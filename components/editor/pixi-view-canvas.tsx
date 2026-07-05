"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";

import { PlaybackControls } from "@/components/editor/playback-controls";
import { edgeKey } from "@/lib/editor/frames";
import { resolvePalette } from "@/lib/editor/pixi/colors";
import { AH, AW, R, type Pt } from "@/lib/editor/pixi/geometry";
import { drawGrid } from "@/lib/editor/pixi/grid";
import { createNodeLabel } from "@/lib/editor/pixi/labels";
import {
  createPlaybackOverlay,
  type PlaybackOverlay,
} from "@/lib/editor/pixi/playback-overlay";
import { useEditorStore } from "@/lib/editor/store";

// A single Graphics has a geometry-buffer cap; a big graph overflows it and
// silently drops shapes. So batch into chunks — nodes especially, since each
// circle's fill+stroke is a lot of geometry.
const NODE_CHUNK = 150;
const EDGE_CHUNK = 600;

/**
 * View-only Pixi (WebGL) renderer: nodes, edges, arrowheads, the dot grid,
 * pan/zoom/fit, labels, and playback decoration. Rebuilds the whole scene when
 * the graph, direction, or theme changes — fine here because a read-only graph
 * only changes on switch. Editing lives in the sibling edit canvas.
 */
export default function PixiViewCanvas({
  showPlayback = false,
}: {
  showPlayback?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const directed = useEditorStore((s) => s.directed);
  const frames = useEditorStore((s) => s.frames);
  const playhead = useEditorStore((s) => s.playhead);
  // preserve zoom/pan across same-graph rebuilds (theme changes); only refit
  // when the graph itself changes
  const viewRef = useRef<{ scale: number; x: number; y: number } | null>(null);
  const lastNodesRef = useRef<typeof nodes | null>(null);
  const sceneRef = useRef<PlaybackOverlay | null>(null);

  // Rebuild with fresh colors whenever the theme, palette, or any style on
  // <html>/<body> changes — watch the DOM directly (the observer fires after
  // the new values are applied) and bump a version.
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeVersion((v) => v + 1));
    const opts: MutationObserverInit = {
      attributes: true,
      attributeFilter: ["class", "data-palette", "style"],
    };
    obs.observe(document.documentElement, opts);
    obs.observe(document.body, opts);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // same nodes reference = a theme/style rebuild, not a new graph
    const graphChanged = lastNodesRef.current !== nodes;
    lastNodesRef.current = nodes;

    let destroyed = false;
    let app: Application | null = null;
    let teardown: () => void = () => {};

    (async () => {
      const application = new Application();
      const pal = resolvePalette(el);
      await application.init({
        resizeTo: el,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        background: pal.bg,
      });
      if (destroyed) {
        application.destroy(true);
        return;
      }
      app = application;
      el.appendChild(app.canvas);
      // all input is DOM-driven; disable Pixi's event system so it doesn't
      // reset the canvas cursor on every move
      app.stage.eventMode = "none";

      const gridG = new Graphics();
      app.stage.addChild(gridG);

      const world = new Container();
      app.stage.addChild(world);

      const byId = new Map(nodes.map((n) => [n.id, n]));

      // edges (chunked stroke) + arrowheads
      const arrowsG = new Graphics();
      let edgeG: Graphics | null = null;
      let ei = 0;
      for (const e of edges) {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) continue;
        if (ei % EDGE_CHUNK === 0) {
          if (edgeG) edgeG.stroke({ width: 1.5, color: pal.edge });
          edgeG = new Graphics();
          world.addChild(edgeG);
        }
        ei++;
        const dx = t.position.x - s.position.x;
        const dy = t.position.y - s.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const endGap = directed ? R + AH : R;
        edgeG!
          .moveTo(s.position.x + ux * R, s.position.y + uy * R)
          .lineTo(t.position.x - ux * endGap, t.position.y - uy * endGap);
        if (directed) {
          const tipX = t.position.x - ux * R;
          const tipY = t.position.y - uy * R;
          const baseX = t.position.x - ux * (R + AH);
          const baseY = t.position.y - uy * (R + AH);
          arrowsG.poly([
            tipX, tipY,
            baseX - uy * AW, baseY + ux * AW,
            baseX + uy * AW, baseY - ux * AW,
          ]);
        }
      }
      if (edgeG) edgeG.stroke({ width: 1.5, color: pal.edge });
      arrowsG.fill(pal.edge);
      world.addChild(arrowsG);

      // nodes — fill + stroke PER circle so the border renders (batched stroke
      // after batched fill is a no-op in Pixi v8), chunked so we don't overflow
      let nodeG: Graphics | null = null;
      nodes.forEach((n, i) => {
        if (i % NODE_CHUNK === 0) {
          nodeG = new Graphics();
          world.addChild(nodeG);
        }
        nodeG!
          .circle(n.position.x, n.position.y, R)
          .fill(pal.node)
          .stroke({ width: 2, color: pal.border });
      });

      // playback overlay (above the base, below labels)
      const edgeByKey = new Map<string, { s: Pt; t: Pt }>();
      for (const e of edges) {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (s && t)
          edgeByKey.set(edgeKey(e.source, e.target, directed), {
            s: s.position,
            t: t.position,
          });
      }
      const overlay = createPlaybackOverlay({
        world,
        ticker: app.ticker,
        palette: pal,
        directed,
        nodePos: (id) => byId.get(id)?.position,
        edgeRec: (key) => edgeByKey.get(key),
      });
      sceneRef.current = overlay;

      // labels on top
      const labels = new Container();
      for (const n of nodes) {
        labels.addChild(
          createNodeLabel(n.data.name, n.position.x, n.position.y, pal.text),
        );
      }
      world.addChild(labels);

      const redraw = () => {
        drawGrid(gridG, world, app!.screen.width, app!.screen.height, pal.grid);
        viewRef.current = {
          scale: world.scale.x,
          x: world.position.x,
          y: world.position.y,
        };
      };

      // Pixi's resizeTo only watches the window; observe the element too so a
      // resizable panel drag resizes the renderer (keeping the current view).
      const resizeObs = new ResizeObserver(() => {
        if (!app) return;
        app.resize();
        redraw();
      });
      resizeObs.observe(el);

      const fit = () => {
        if (!app || nodes.length === 0) return;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const n of nodes) {
          minX = Math.min(minX, n.position.x - R);
          minY = Math.min(minY, n.position.y - R);
          maxX = Math.max(maxX, n.position.x + R);
          maxY = Math.max(maxY, n.position.y + R);
        }
        const gw = maxX - minX || 1;
        const gh = maxY - minY || 1;
        const scale = Math.min(app.screen.width / gw, app.screen.height / gh) * 0.9;
        world.scale.set(scale);
        world.position.set(
          app.screen.width / 2 - ((minX + maxX) / 2) * scale,
          app.screen.height / 2 - ((minY + maxY) / 2) * scale,
        );
        redraw();
      };

      // pan + zoom via DOM events on the canvas
      const canvas = app.canvas;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const onDown = (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        dragging = true;
        lastX = ev.clientX;
        lastY = ev.clientY;
        canvas.style.cursor = "grabbing";
      };
      const onMove = (ev: PointerEvent) => {
        if (!dragging) return;
        world.position.x += ev.clientX - lastX;
        world.position.y += ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        redraw();
      };
      const onUp = () => {
        dragging = false;
        canvas.style.cursor = "grab";
      };
      const onWheel = (ev: WheelEvent) => {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        let dy = ev.deltaY;
        if (ev.deltaMode === 1) dy *= 16;
        else if (ev.deltaMode === 2) dy *= 100;
        const factor = Math.min(1.2, Math.max(0.83, Math.exp(-dy * 0.0012)));
        const next = Math.max(0.02, Math.min(8, world.scale.x * factor));
        const wx = (mx - world.position.x) / world.scale.x;
        const wy = (my - world.position.y) / world.scale.y;
        world.scale.set(next);
        world.position.set(mx - wx * next, my - wy * next);
        redraw();
      };
      canvas.style.cursor = "grab";
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });

      const applyView = () => {
        if (!graphChanged && viewRef.current) {
          world.scale.set(viewRef.current.scale);
          world.position.set(viewRef.current.x, viewRef.current.y);
          redraw();
        } else {
          fit();
        }
      };
      applyView();
      const settle = window.setTimeout(applyView, 80);

      // paint whatever playback state the store is already at, then let the
      // playback effect drive it forward
      const s0 = useEditorStore.getState();
      overlay.decorate(s0.frames, s0.playhead);

      teardown = () => {
        window.clearTimeout(settle);
        resizeObs.disconnect();
        sceneRef.current = null;
        overlay.destroy();
        canvas.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("wheel", onWheel);
      };
    })();

    return () => {
      destroyed = true;
      teardown();
      try {
        app?.destroy({ removeView: true }, { children: true, texture: true });
      } catch {
        // ignore teardown races
      }
    };
  }, [nodes, edges, directed, themeVersion]);

  // drive playback: fold new frames into the overlay when the playhead or frame
  // buffer moves. The scene rebuild is NOT keyed on these, so a run animates by
  // touching only the overlay, never the whole graph.
  useEffect(() => {
    sceneRef.current?.decorate(frames, playhead);
  }, [frames, playhead]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {showPlayback && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2">
          <div className="pointer-events-auto">
            <PlaybackControls />
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
        Pixi (WebGL) · {nodes.length} nodes / {edges.length} edges · drag to pan ·
        scroll to zoom
      </div>
    </div>
  );
}
