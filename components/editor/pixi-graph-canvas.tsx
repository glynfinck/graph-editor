"use client";

import { useEffect, useRef, useState } from "react";
import { Application, BitmapText, Container, Graphics } from "pixi.js";

import { NODE_DIAMETER } from "@/components/editor/graph-node";
import { useEditorStore } from "@/lib/editor/store";

const R = NODE_DIAMETER / 2; // 28
const AH = 11; // arrowhead length
const AW = 7; // arrowhead half-width
const GAP = 24; // dot-grid spacing (world units) — matches the React Flow canvas

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

/** Linear blend of two packed 0xRRGGBB colors (t=0 → a, t=1 → b). */
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
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
  // preserve zoom/pan across same-graph rebuilds (theme changes); only refit
  // when the graph itself changes
  const viewRef = useRef<{ scale: number; x: number; y: number } | null>(null);
  const lastNodesRef = useRef<typeof nodes | null>(null);

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

    // same nodes reference = a theme/style rebuild, not a new graph
    const graphChanged = lastNodesRef.current !== nodes;
    lastNodesRef.current = nodes;

    let destroyed = false;
    let app: Application | null = null;
    let teardown: () => void = () => {};

    (async () => {
      const application = new Application();
      const cBg = cssColor(el, "--background", 0xffffff);
      await application.init({
        resizeTo: el,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        background: cBg,
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
      const cText = cssColor(el, "--foreground", 0x1a1f2b);
      // grid dots: blend from the background toward the foreground. A dark dot
      // on a light background needs a bigger step to read as strongly as a
      // light dot on a dark background, so scale the blend by bg luminance.
      const bgLum =
        (0.299 * ((cBg >> 16) & 255) +
          0.587 * ((cBg >> 8) & 255) +
          0.114 * (cBg & 255)) /
        255;
      const cGrid = mix(cBg, cText, bgLum > 0.5 ? 0.4 : 0.34);

      // dot-grid background in screen space (behind the graph), redrawn as the
      // view pans/zooms — cheap because it only covers the viewport
      const gridG = new Graphics();
      app.stage.addChild(gridG);

      const world = new Container();
      app.stage.addChild(world);

      const byId = new Map(nodes.map((n) => [n.id, n]));

      // A single Graphics has a geometry-buffer cap; a big graph overflows it
      // and silently drops shapes (the missing edges). So batch into chunks —
      // nodes especially, since each circle's fill+stroke is a lot of geometry.
      const NODE_CHUNK = 150;
      const EDGE_CHUNK = 600;

      // edges (chunked stroke) + arrowheads
      const arrowsG = new Graphics();
      let edgeG: Graphics | null = null;
      let ei = 0;
      for (const e of edges) {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) continue;
        if (ei % EDGE_CHUNK === 0) {
          if (edgeG) edgeG.stroke({ width: 1.5, color: cEdge });
          edgeG = new Graphics();
          world.addChild(edgeG);
        }
        ei++;
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
        edgeG!
          .moveTo(sx + ux * R, sy + uy * R)
          .lineTo(tx - ux * endGap, ty - uy * endGap);
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
      if (edgeG) edgeG.stroke({ width: 1.5, color: cEdge });
      arrowsG.fill(cEdge);
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
          .fill(cNode)
          .stroke({ width: 2, color: cBorder });
      });

      // labels — BitmapText shares ONE glyph atlas across every instance
      // (unlike Text, which is a texture each), so there's no node cap. Drawn
      // white and tinted to the text color, and always visible (like React
      // Flow) — BitmapText is cheap enough to keep on at any zoom.
      const labels = new Container();
      for (const n of nodes) {
        const short = n.data.name.length <= 4;
        const txt = new BitmapText({
          text: n.data.name,
          style: {
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 15,
            fontWeight: "700",
            fill: 0xffffff,
          },
        });
        txt.tint = cText;
        txt.anchor.set(0.5);
        txt.position.set(
          n.position.x,
          short ? n.position.y : n.position.y + R + 12,
        );
        labels.addChild(txt);
      }
      world.addChild(labels);

      // screen-space dots at GAP*scale spacing, phased by the pan offset, so the
      // grid scrolls/zooms with the graph. Skipped when too dense to read.
      const drawGrid = () => {
        if (!app) return;
        gridG.clear();
        const scale = world.scale.x;
        const spacing = GAP * scale;
        // fade the grid in as the dots spread apart (smoothstep over 9→24px)
        // instead of snapping on at a hard threshold
        const t = Math.max(0, Math.min(1, (spacing - 9) / 15));
        const alpha = t * t * (3 - 2 * t); // smoothstep, up to full opacity
        if (alpha < 0.03) return; // effectively invisible → skip the work
        const w = app.screen.width;
        const h = app.screen.height;
        const ox = ((world.position.x % spacing) + spacing) % spacing;
        const oy = ((world.position.y % spacing) + spacing) % spacing;
        const r = Math.max(1, Math.min(2, 0.9 * scale));
        for (let x = ox; x <= w; x += spacing) {
          for (let y = oy; y <= h; y += spacing) gridG.circle(x, y, r);
        }
        gridG.fill({ color: cGrid, alpha });
      };

      const saveView = () => {
        viewRef.current = {
          scale: world.scale.x,
          x: world.position.x,
          y: world.position.y,
        };
      };
      const redraw = () => {
        drawGrid();
        saveView();
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

      // restore the prior view on a same-graph rebuild (e.g. a theme change);
      // only fit when the graph itself changed
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
      // re-apply once the panel has settled its size
      const settle = window.setTimeout(applyView, 80);

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
