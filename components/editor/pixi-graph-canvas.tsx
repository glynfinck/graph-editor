"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";

import { NODE_DIAMETER } from "@/components/editor/graph-node";
import { useEditorStore } from "@/lib/editor/store";

const R = NODE_DIAMETER / 2; // 28
const AH = 11; // arrowhead length
const AW = 7; // arrowhead half-width
// creating a Text texture per node is the expensive part; above this we skip
// labels (a level-of-detail cap) so the geometry still renders fast at scale
const LABEL_CAP = 800;
const LABEL_MIN_ZOOM = 0.55; // hide labels when zoomed out past this

/** Resolve a CSS custom property (even oklch) to a packed 0xRRGGBB number. */
function cssColor(varName: string, fallback: number): number {
  const probe = document.createElement("span");
  probe.style.color = `var(${varName})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color; // browser resolves to rgb()/rgba()
  probe.remove();
  const m = rgb.match(/\d+(?:\.\d+)?/g);
  if (!m || m.length < 3) return fallback;
  const [r, g, b] = m.map(Number);
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

/**
 * EXPERIMENT — a Pixi (WebGL) renderer for the graph, read-only for now: nodes,
 * edges, arrowheads, pan/zoom, fit-to-view, and label LOD. Reads the same
 * editor store as the React Flow canvas so we can A/B them on the same graph.
 * No editing or playback yet; this phase is only to compare raw render/pan
 * performance at scale.
 */
export default function PixiGraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const directed = useEditorStore((s) => s.directed);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let destroyed = false;
    let app: Application | null = null;
    let teardown: () => void = () => {};

    (async () => {
      const application = new Application();
      await application.init({
        resizeTo: el,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        background: cssColor("--background", 0xffffff),
      });
      if (destroyed) {
        application.destroy(true);
        return;
      }
      app = application;
      el.appendChild(app.canvas);

      const cNode = cssColor("--graph-node", 0xe6eaf4);
      const cBorder = cssColor("--graph-node-border", 0xaeb9d2);
      const cEdge = cssColor("--graph-edge", 0x9aa4b6);
      const cText = cssColor("--foreground", 0x1a1f2b);

      const world = new Container();
      app.stage.addChild(world);

      const byId = new Map(nodes.map((n) => [n.id, n]));

      // edges + arrowheads (batched into two Graphics)
      const edgesG = new Graphics();
      const arrowsG = new Graphics();
      for (const e of edges) {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) continue;
        const sx = s.position.x;
        const sy = s.position.y;
        const tx = t.position.x;
        const ty = t.position.y;
        const dx = tx - sx;
        const dy = ty - sy;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const endGap = directed ? R + AH : R;
        edgesG.moveTo(sx + ux * R, sy + uy * R).lineTo(tx - ux * endGap, ty - uy * endGap);
        if (directed) {
          const tipX = tx - ux * R;
          const tipY = ty - uy * R;
          const baseX = tx - ux * (R + AH);
          const baseY = ty - uy * (R + AH);
          arrowsG.poly([
            tipX, tipY,
            baseX - uy * AW, baseY + ux * AW,
            baseX + uy * AW, baseY - ux * AW,
          ]);
        }
      }
      edgesG.stroke({ width: 1.5, color: cEdge });
      arrowsG.fill(cEdge);
      world.addChild(edgesG, arrowsG);

      // nodes (batched)
      const nodesG = new Graphics();
      for (const n of nodes) nodesG.circle(n.position.x, n.position.y, R);
      nodesG.fill(cNode).stroke({ width: 2, color: cBorder });
      world.addChild(nodesG);

      // labels (skipped past the cap; hidden when zoomed out)
      let labels: Container | null = null;
      if (nodes.length <= LABEL_CAP) {
        labels = new Container();
        for (const n of nodes) {
          const short = n.data.name.length <= 4;
          const txt = new Text({
            text: n.data.name,
            style: {
              fontSize: 15,
              fontWeight: "700",
              fill: cText,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            },
          });
          txt.anchor.set(0.5);
          txt.position.set(
            n.position.x,
            short ? n.position.y : n.position.y + R + 12,
          );
          labels.addChild(txt);
        }
        world.addChild(labels);
      }

      const updateLOD = () => {
        if (labels) labels.visible = world.scale.x > LABEL_MIN_ZOOM;
      };

      const fit = () => {
        if (!app || nodes.length === 0) return;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const n of nodes) {
          minX = Math.min(minX, n.position.x);
          minY = Math.min(minY, n.position.y);
          maxX = Math.max(maxX, n.position.x);
          maxY = Math.max(maxY, n.position.y);
        }
        minX -= R;
        minY -= R;
        maxX += R;
        maxY += R;
        const gw = maxX - minX || 1;
        const gh = maxY - minY || 1;
        const w = app.screen.width;
        const h = app.screen.height;
        const scale = Math.min(w / gw, h / gh) * 0.9;
        world.scale.set(scale);
        world.position.set(
          w / 2 - ((minX + maxX) / 2) * scale,
          h / 2 - ((minY + maxY) / 2) * scale,
        );
        updateLOD();
      };

      // pan + zoom via DOM events on the canvas
      const canvas = app.canvas;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const onDown = (ev: PointerEvent) => {
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
        const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.max(0.02, Math.min(8, world.scale.x * factor));
        const wx = (mx - world.position.x) / world.scale.x;
        const wy = (my - world.position.y) / world.scale.y;
        world.scale.set(next);
        world.position.set(mx - wx * next, my - wy * next);
        updateLOD();
      };
      canvas.style.cursor = "grab";
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });

      fit();
      // refit once the panel has settled its size
      const settle = window.setTimeout(fit, 80);

      teardown = () => {
        window.clearTimeout(settle);
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
  }, [nodes, edges, directed]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
        Pixi (WebGL) · {nodes.length} nodes / {edges.length} edges · drag to pan ·
        scroll to zoom
      </div>
    </div>
  );
}
