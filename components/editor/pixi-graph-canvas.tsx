"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";

import { NODE_DIAMETER } from "@/components/editor/graph-node";
import { useEditorStore } from "@/lib/editor/store";

const R = NODE_DIAMETER / 2; // 28
const AH = 11; // arrowhead length
const AW = 7; // arrowhead half-width
const GAP = 24; // dot-grid spacing (world units) — matches the React Flow canvas
// creating a Text texture per node is the expensive part; above this we skip
// labels (a level-of-detail cap) so the geometry still renders fast at scale
const LABEL_CAP = 800;
const LABEL_MIN_ZOOM = 0.55; // hide labels when zoomed out past this

/** The computed color a CSS var resolves to, read from inside `scope` so
 * ancestor-scoped palettes ([data-palette]) apply. Whatever format the browser
 * serializes (rgb / oklch / color()) comes back verbatim. */
function resolveColor(scope: HTMLElement, varName: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${varName})`;
  probe.style.display = "none";
  scope.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** Normalize ANY CSS color string (rgb, oklch, color(), named) to 0xRRGGBB by
 * painting one pixel and reading it back — no fragile string parsing. A magenta
 * sentinel detects colors the canvas can't parse and falls back cleanly. */
function toHex(cssColorString: string, fallback: number): number {
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = "#ff00ff";
  ctx.fillStyle = cssColorString; // ignored if unparseable → sentinel remains
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  if (r === 255 && g === 0 && b === 255) return fallback;
  return (r << 16) | (g << 8) | b;
}

function cssColor(scope: HTMLElement, varName: string, fallback: number): number {
  return toHex(resolveColor(scope, varName), fallback);
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
  // Rebuild with fresh colors whenever the theme, palette, or any style on
  // <html>/<body> changes. next-themes toggles a class and the palette sets
  // data-palette — neither is reliably observable via React state (and their
  // timing races this effect), so watch the DOM directly (the observer fires
  // after the new values are applied) and bump a version.
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
        background: cssColor(el, "--background", 0xffffff),
      });
      if (destroyed) {
        application.destroy(true);
        return;
      }
      app = application;
      el.appendChild(app.canvas);

      // the real graph palette — node fill is near-white and borders/edges are
      // pale; the dot grid gives them the contrast they rely on, matching the
      // React Flow canvas
      const cNode = cssColor(el, "--graph-node", 0xffffff);
      const cBorder = cssColor(el, "--graph-node-border", 0xaeb9d2);
      const cEdge = cssColor(el, "--graph-edge", 0xc9d0dd);
      const cGrid = cssColor(el, "--border", 0xe2e6ee);
      const cText = cssColor(el, "--foreground", 0x1a1f2b);

      // dot-grid background in screen space (behind the graph), redrawn as the
      // view pans/zooms — cheap because it only covers the viewport
      const gridG = new Graphics();
      app.stage.addChild(gridG);

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

      // nodes — fill + stroke PER circle so the border actually renders (a
      // single batched stroke after a batched fill doesn't in Pixi v8)
      const nodesG = new Graphics();
      for (const n of nodes) {
        nodesG
          .circle(n.position.x, n.position.y, R)
          .fill(cNode)
          .stroke({ width: 2, color: cBorder });
      }
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

      // screen-space dots at GAP*scale spacing, phased by the pan offset, so the
      // grid scrolls/zooms with the graph. Skipped when too dense to read.
      const drawGrid = () => {
        if (!app) return;
        gridG.clear();
        const scale = world.scale.x;
        const spacing = GAP * scale;
        if (spacing < 10) return;
        const w = app.screen.width;
        const h = app.screen.height;
        const ox = ((world.position.x % spacing) + spacing) % spacing;
        const oy = ((world.position.y % spacing) + spacing) % spacing;
        const r = Math.max(0.7, Math.min(1.6, 0.7 * scale));
        for (let x = ox; x <= w; x += spacing) {
          for (let y = oy; y <= h; y += spacing) gridG.circle(x, y, r);
        }
        gridG.fill({ color: cGrid, alpha: 0.9 });
      };

      const redraw = () => {
        drawGrid();
        updateLOD();
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
        redraw();
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
        drawGrid();
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
        // scale by how much was actually scrolled (normalized across
        // line/page delta modes) and clamp so one event can't leap far — this
        // keeps trackpads, which fire many small events, from rocketing
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
  }, [nodes, edges, directed, themeVersion]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
        Pixi (WebGL) · {nodes.length} nodes / {edges.length} edges · drag to pan ·
        scroll to zoom
      </div>
    </div>
  );
}
