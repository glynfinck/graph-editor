"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";

import { PlaybackControls } from "@/components/editor/playback-controls";
import { createObjectScene, type ObjectScene } from "@/lib/editor/pixi/base-objects";
import { resolvePalette } from "@/lib/editor/pixi/colors";
import { fitBounds } from "@/lib/editor/pixi/geometry";
import { drawGrid } from "@/lib/editor/pixi/grid";
import {
  createPlaybackOverlay,
  type PlaybackOverlay,
} from "@/lib/editor/pixi/playback-overlay";
import { useEditorStore } from "@/lib/editor/store";

/** Handles the edit canvas keeps across renders for the imperative effects. */
type EditScene = {
  scene: ObjectScene;
  overlay: PlaybackOverlay;
  redraw: () => void;
};

/**
 * Editable Pixi (WebGL) renderer. A single Application persists across edits —
 * structural edits patch per-object display objects (see base-objects), so a
 * drag or add never tears down the WebGL context or refits the viewport. Full
 * rebuild happens only on graph switch, direction toggle, or theme change.
 *
 * Phase B: renders + reconciles + plays back. Pointer editing (drag / connect /
 * select / delete) is layered on in later phases; for now the pointer pans.
 */
export default function PixiEditCanvas({
  showPlayback = false,
}: {
  showPlayback?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const directed = useEditorStore((s) => s.directed);
  const graphId = useEditorStore((s) => s.graphId);
  const frames = useEditorStore((s) => s.frames);
  const playhead = useEditorStore((s) => s.playhead);

  const viewRef = useRef<{ scale: number; x: number; y: number } | null>(null);
  const sceneRef = useRef<EditScene | null>(null);
  // last graph id the build effect saw, to decide fit (new graph) vs. preserve
  // view (theme rebuild)
  const lastGraphRef = useRef<string | null>(null);

  // structural identity of the graph — changes only on add/remove/connect, so
  // position/selection/label edits don't trigger a reconcile pass
  const structureSig = useMemo(
    () =>
      nodes.map((n) => n.id).join(",") +
      "|" +
      edges.map((e) => `${e.id}:${e.source}>${e.target}`).join(","),
    [nodes, edges],
  );

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

  // Build (or rebuild) the whole scene. Keyed only on graph identity, direction,
  // and theme — NOT on node/edge arrays — so edits never rebuild.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // a new graph refits; a theme rebuild preserves the current view
    const refit = viewRef.current === null || lastGraphRef.current !== graphId;
    lastGraphRef.current = graphId;

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

      const gridG = new Graphics();
      app.stage.addChild(gridG);
      const world = new Container();
      app.stage.addChild(world);

      const scene = createObjectScene({ palette: pal, directed });
      // z-order: edges → edge labels → [overlay] → node circles → node labels
      world.addChild(scene.edgesLayer, scene.edgeLabelsLayer);
      const overlay = createPlaybackOverlay({
        world,
        ticker: app.ticker,
        palette: pal,
        directed,
        nodePos: scene.nodePos,
        edgeRec: scene.edgeRec,
      });
      world.addChild(scene.nodesLayer, scene.nodeLabelsLayer);

      const redraw = () => {
        drawGrid(gridG, world, app!.screen.width, app!.screen.height, pal.grid);
        viewRef.current = {
          scale: world.scale.x,
          x: world.position.x,
          y: world.position.y,
        };
      };

      const fit = () => {
        const b = fitBounds(useEditorStore.getState().nodes);
        if (!app || !b) return;
        const gw = b.maxX - b.minX || 1;
        const gh = b.maxY - b.minY || 1;
        const scale =
          Math.min(app.screen.width / gw, app.screen.height / gh) * 0.9;
        world.scale.set(scale);
        world.position.set(
          app.screen.width / 2 - ((b.minX + b.maxX) / 2) * scale,
          app.screen.height / 2 - ((b.minY + b.maxY) / 2) * scale,
        );
        redraw();
      };

      // populate from the live store snapshot
      const s0 = useEditorStore.getState();
      scene.reconcile(s0.nodes, s0.edges);

      // pan + zoom (editing gestures replace onDown in a later phase)
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

      // restore the prior view on a theme rebuild; fit on a new graph
      if (!refit && viewRef.current) {
        world.scale.set(viewRef.current.scale);
        world.position.set(viewRef.current.x, viewRef.current.y);
        redraw();
      } else {
        fit();
      }
      const settle = window.setTimeout(() => {
        if (refit) fit();
        else redraw();
      }, 80);

      sceneRef.current = { scene, overlay, redraw };
      overlay.decorate(s0.frames, s0.playhead);

      teardown = () => {
        window.clearTimeout(settle);
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
  }, [directed, themeVersion, graphId]);

  // structural edits → patch the scene in place (no rebuild, no refit)
  useEffect(() => {
    // structureSig (in deps) is the trigger; reconcile reads live store state
    const s = useEditorStore.getState();
    sceneRef.current?.scene.reconcile(s.nodes, s.edges);
  }, [structureSig]);

  // drive playback: fold new frames into the overlay
  useEffect(() => {
    sceneRef.current?.overlay.decorate(frames, playhead);
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
        Pixi (WebGL) · {nodes.length} nodes / {edges.length} edges
      </div>
    </div>
  );
}
