"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";

import {
  PixiCanvasControls,
  type PixiViewControls,
} from "@/components/editor/pixi-canvas-controls";
import { PlaybackControls } from "@/components/editor/playback-controls";
import { edgeKey } from "@/lib/editor/frames";
import { resolvePalette } from "@/lib/editor/pixi/colors";
import { arrowheadPoly, R, trimmedEnds, type Pt } from "@/lib/editor/pixi/geometry";
import { drawGrid } from "@/lib/editor/pixi/grid";
import { createNodeLabel, nodeLabelOffsetY } from "@/lib/editor/pixi/labels";
import {
  createPlaybackOverlay,
  type PlaybackOverlay,
} from "@/lib/editor/pixi/playback-overlay";
import {
  attachPanZoom,
  fitView,
  useThemeVersion,
  zoomStep,
} from "@/lib/editor/pixi/stage";
import { useEditorStore } from "@/lib/editor/store";

// Batch the base graph into several Graphics rather than one giant object:
// bounding each object's geometry keeps the batcher efficient and avoids one
// monster buffer re-upload on any change. Nodes get smaller chunks since each
// circle's fill+stroke is a lot more geometry than an edge segment.
const NODE_CHUNK = 150;
const EDGE_CHUNK = 600;

/**
 * View-only Pixi (WebGL) renderer: nodes, edges, arrowheads, the dot grid,
 * pan/zoom/fit, labels, and playback decoration. Rebuilds the whole scene when
 * the graph, direction, or theme changes — fine here because a read-only graph
 * only changes on switch. Editing lives in the sibling edit canvas; both share
 * the stage/geometry/label helpers in lib/editor/pixi/ so viewport feel and
 * edge/label geometry stay identical between the two.
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
  const controlsRef = useRef<PixiViewControls | null>(null);

  // rebuild the scene with fresh colors on a theme/palette change
  const themeVersion = useThemeVersion();

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

      // edges (chunked stroke) + arrowheads (chunked fill) — same geometry as
      // the edit path (trimmedEnds/arrowheadPoly) so the two renderers agree
      let edgeG: Graphics | null = null;
      let arrowG: Graphics | null = null;
      let ei = 0;
      for (const e of edges) {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) continue;
        if (ei % EDGE_CHUNK === 0) {
          if (edgeG) edgeG.stroke({ width: 1.5, color: pal.edge });
          edgeG = new Graphics();
          world.addChild(edgeG);
          if (directed) {
            if (arrowG) arrowG.fill(pal.edge);
            arrowG = new Graphics();
            world.addChild(arrowG);
          }
        }
        ei++;
        const te = trimmedEnds(s.position, t.position, directed);
        edgeG!.moveTo(te.x1, te.y1).lineTo(te.x2, te.y2);
        if (directed) arrowG!.poly(arrowheadPoly(s.position, t.position));
      }
      if (edgeG) edgeG.stroke({ width: 1.5, color: pal.edge });
      if (directed && arrowG) arrowG.fill(pal.edge);

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
        const label = createNodeLabel(n.data.name, pal.text, pal.bg, pal.border);
        label.position.set(
          n.position.x,
          n.position.y + nodeLabelOffsetY(n.data.name),
        );
        labels.addChild(label);
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
        if (!app) return;
        fitView(app.screen, world, nodes);
        redraw();
      };

      // pan + zoom via DOM events on the canvas (shared with the edit path's
      // zoom feel through the stage helpers)
      const canvas = app.canvas;
      const detachPanZoom = attachPanZoom(canvas, world, redraw);

      controlsRef.current = {
        zoomIn: () => {
          if (!app) return;
          zoomStep(world, app.screen, "in");
          redraw();
        },
        zoomOut: () => {
          if (!app) return;
          zoomStep(world, app.screen, "out");
          redraw();
        },
        fit,
      };

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
        controlsRef.current = null;
        overlay.destroy();
        detachPanZoom();
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
      <PixiCanvasControls controlsRef={controlsRef} />
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
        Pixi (WebGL) · {nodes.length} nodes / {edges.length} edges · drag to pan ·
        scroll to zoom
      </div>
    </div>
  );
}
