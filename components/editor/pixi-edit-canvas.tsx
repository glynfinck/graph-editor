"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";

import { EdgeInspector } from "@/components/editor/edge-inspector";
import { NodeInspector } from "@/components/editor/node-inspector";
import { PlaybackControls } from "@/components/editor/playback-controls";
import { createObjectScene, type ObjectScene } from "@/lib/editor/pixi/base-objects";
import { resolvePalette } from "@/lib/editor/pixi/colors";
import { fitBounds, R, trimmedEnds } from "@/lib/editor/pixi/geometry";
import { drawGrid } from "@/lib/editor/pixi/grid";
import { attachInteractions } from "@/lib/editor/pixi/interactions";
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
  drawSelection: () => void;
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

  // exactly one selected node / edge → show its inspector (like graph-canvas)
  const selectedNodeId = useMemo(() => {
    const sel = nodes.filter((n) => n.selected);
    return sel.length === 1 ? sel[0].id : null;
  }, [nodes]);
  const selectedEdgeId = useMemo(() => {
    const sel = edges.filter((e) => e.selected);
    return sel.length === 1 ? sel[0].id : null;
  }, [edges]);

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
      const selLayer = new Graphics();
      world.addChild(selLayer); // selection rings sit on top of everything
      const connectLayer = new Graphics();
      world.addChild(connectLayer); // the in-progress connection line, topmost

      const canvas = app.canvas;
      const screenToWorld = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (clientX - rect.left - world.position.x) / world.scale.x,
          y: (clientY - rect.top - world.position.y) / world.scale.y,
        };
      };

      const redraw = () => {
        drawGrid(gridG, world, app!.screen.width, app!.screen.height, pal.grid);
        viewRef.current = {
          scale: world.scale.x,
          x: world.position.x,
          y: world.position.y,
        };
      };

      // selection channel above the graph: a ring on the selected node / a
      // thicker recolor on the selected edge (reads live selection from store)
      const drawSelection = () => {
        selLayer.clear();
        const st = useEditorStore.getState();
        const selNode = st.nodes.find((n) => n.selected);
        if (selNode) {
          const p = scene.nodePos(selNode.id);
          if (p)
            selLayer.circle(p.x, p.y, R + 3).stroke({ width: 2.5, color: pal.ring });
        }
        const selEdge = st.edges.find((e) => e.selected);
        if (selEdge) {
          const s = scene.nodePos(selEdge.source);
          const t = scene.nodePos(selEdge.target);
          if (s && t) {
            const e = trimmedEnds(s, t, directed);
            selLayer
              .moveTo(e.x1, e.y1)
              .lineTo(e.x2, e.y2)
              .stroke({ width: 3.5, color: pal.ring });
          }
        }
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

      const detachInput = attachInteractions({
        canvas,
        world,
        scene,
        connectLayer,
        connectColor: pal.ring,
        screenToWorld,
        redraw,
        refreshSelection: drawSelection,
      });

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

      sceneRef.current = { scene, overlay, redraw, drawSelection };
      overlay.decorate(s0.frames, s0.playhead);
      drawSelection(); // reflect any selection that survived a rebuild

      teardown = () => {
        window.clearTimeout(settle);
        sceneRef.current = null;
        detachInput();
        overlay.destroy();
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

  // selection changed → repaint the selection channel (imperative, no rebuild)
  useEffect(() => {
    sceneRef.current?.drawSelection();
  }, [selectedNodeId, selectedEdgeId]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {showPlayback && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2">
          <div className="pointer-events-auto">
            <PlaybackControls />
          </div>
        </div>
      )}
      {selectedNodeId ? (
        <div className="absolute top-2 right-2 z-10">
          <NodeInspector nodeId={selectedNodeId} />
        </div>
      ) : selectedEdgeId ? (
        <div className="absolute top-2 right-2 z-10">
          <EdgeInspector edgeId={selectedEdgeId} directed={directed} />
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
        Pixi (WebGL) · {nodes.length} nodes / {edges.length} edges · double-click
        to add · drag from a rim to connect · ⌫ deletes
      </div>
    </div>
  );
}
