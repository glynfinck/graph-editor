"use client";

import { useEffect, useRef, useState } from "react";
import { Application, BitmapText, Container, Graphics } from "pixi.js";

import { NODE_DIAMETER } from "@/components/editor/graph-node";
import { PlaybackControls } from "@/components/editor/playback-controls";
import {
  computeVisualState,
  edgeKey,
  emptyVisualState,
  type Frame,
  type VisualState,
} from "@/lib/editor/frames";
import { useEditorStore } from "@/lib/editor/store";

const R = NODE_DIAMETER / 2; // 28
const AH = 11; // arrowhead length
const AW = 7; // arrowhead half-width
const GAP = 24; // dot-grid spacing (world units) — matches the React Flow canvas
// marching-ants dashes on the current edge (React Flow animates its active
// edge the same way); lengths are world units so they scale with zoom like the
// SVG dasharray does, and DASH_SPEED is world units/sec toward the target
const DASH_LEN = 7;
const DASH_GAP = 5;
const DASH_SPEED = 26;

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

/** Like cssColor, but flattens a (possibly translucent) color onto `bgHex` —
 * the visited node fill is semi-transparent in some themes and composites over
 * the canvas background on screen, so bake that composite in for an opaque tint
 * that matches what React Flow shows. */
function cssColorOver(
  scope: HTMLElement,
  varName: string,
  bgHex: number,
  fallback: number,
): number {
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = `#${bgHex.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = resolveColor(scope, varName); // ignored if unparseable → bg
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
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

type Scene = { decorate: (frames: Frame[], playhead: number) => void };

/**
 * EXPERIMENT — a Pixi (WebGL) renderer for the graph. Draws nodes, edges,
 * arrowheads, the dot grid, pan/zoom/fit, labels, AND playback decoration, so
 * we can A/B its render performance against the React Flow canvas on the same
 * graph and the same run. View-only: editing stays on React Flow.
 *
 * Playback is incremental like the React Flow path (see GraphDecorator): the
 * base graph is drawn once, and only a small overlay of visited/path/current
 * elements is repainted as the playhead moves — appending each promotion once
 * on forward playback instead of redrawing the whole graph every tick.
 */
export default function PixiGraphCanvas({
  showPlayback = false,
}: {
  /** show the floating transport bar (workspace runs code; viewers don't) */
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
  // the built scene's imperative playback hook, set once Pixi is initialized
  const sceneRef = useRef<Scene | null>(null);

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
      // playback palette (mirrors graph-node.tsx / graph-decoration.ts)
      const cVisitedFill = cssColorOver(el, "--graph-visited", cBg, 0xdde8f5);
      const cVisitedBorder = cssColor(el, "--graph-visited-border", 0x5b7aa8);
      const cPathFill = cssColor(el, "--graph-path-fill", 0xe7c9a0);
      const cPathBorder = cssColor(el, "--graph-path", 0xc98a3c);
      const cCurrent = cssColor(el, "--graph-current", 0x8a63d2);
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

      // ── playback overlay ──────────────────────────────────────────────
      // Sits above the base graph, below the labels. Fixed sub-layers keep the
      // z-order stable (edges under nodes, the moving cursor on top) no matter
      // what order elements get promoted in during a run.
      const trimmedEnds = (s: (typeof nodes)[number], t: (typeof nodes)[number]) => {
        const dx = t.position.x - s.position.x;
        const dy = t.position.y - s.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const endGap = directed ? R + AH : R;
        return {
          x1: s.position.x + ux * R,
          y1: s.position.y + uy * R,
          x2: t.position.x - ux * endGap,
          y2: t.position.y - uy * endGap,
        };
      };
      // resolve every edge to its endpoint nodes once, keyed like the frames
      const edgeByKey = new Map<string, { s: (typeof nodes)[number]; t: (typeof nodes)[number] }>();
      for (const e of edges) {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (s && t) edgeByKey.set(edgeKey(e.source, e.target, directed), { s, t });
      }

      const overlay = new Container();
      const layVisitedEdges = new Container();
      const layPathEdges = new Container();
      const layVisitedNodes = new Container();
      const layPathNodes = new Container();
      const layCurrent = new Graphics();
      overlay.addChild(
        layVisitedEdges,
        layPathEdges,
        layVisitedNodes,
        layPathNodes,
        layCurrent,
      );
      world.addChild(overlay);

      // append-only chunked painter: each promotion draws once and stays, so
      // forward playback is O(1) per event instead of repainting the graph
      const painter = (parent: Container, chunk: number) => {
        let g: Graphics | null = null;
        let n = 0;
        const list: Graphics[] = [];
        return {
          add(draw: (g: Graphics) => void) {
            if (n % chunk === 0) {
              g = new Graphics();
              parent.addChild(g);
              list.push(g);
            }
            n++;
            draw(g!);
          },
          reset() {
            for (const gg of list) {
              parent.removeChild(gg);
              gg.destroy();
            }
            list.length = 0;
            g = null;
            n = 0;
          },
        };
      };
      const pVisitedNodes = painter(layVisitedNodes, NODE_CHUNK);
      const pPathNodes = painter(layPathNodes, NODE_CHUNK);
      const pVisitedEdges = painter(layVisitedEdges, EDGE_CHUNK);
      const pPathEdges = painter(layPathEdges, EDGE_CHUNK);

      const drawNode = (
        p: ReturnType<typeof painter>,
        id: string,
        fill: number,
        border: number,
      ) => {
        const node = byId.get(id);
        if (!node) return;
        p.add((g) =>
          g
            .circle(node.position.x, node.position.y, R)
            .fill(fill)
            .stroke({ width: 2, color: border }),
        );
      };
      const drawEdge = (
        p: ReturnType<typeof painter>,
        rec: { s: (typeof nodes)[number]; t: (typeof nodes)[number] },
        width: number,
        color: number,
      ) => {
        const e = trimmedEnds(rec.s, rec.t);
        p.add((g) => g.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width, color }));
      };

      // the moving cursor — one node + one edge, cleared and redrawn each tick.
      // The edge is drawn as animated marching-ants dashes (phase advances on
      // the ticker below), matching React Flow's `animated` active edge.
      let dashPhase = 0;
      const drawCurrent = (vs: VisualState) => {
        layCurrent.clear();
        if (vs.currentEdge) {
          const rec = edgeByKey.get(vs.currentEdge);
          if (rec) {
            const e = trimmedEnds(rec.s, rec.t);
            const dx = e.x2 - e.x1;
            const dy = e.y2 - e.y1;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const period = DASH_LEN + DASH_GAP;
            // phase in [-period, 0) that grows toward the target then wraps
            const start = (((dashPhase % period) + period) % period) - period;
            for (let p = start; p < len; p += period) {
              const a = Math.max(0, p);
              const b = Math.min(len, p + DASH_LEN);
              if (b > a) {
                layCurrent
                  .moveTo(e.x1 + ux * a, e.y1 + uy * a)
                  .lineTo(e.x1 + ux * b, e.y1 + uy * b);
              }
            }
            layCurrent.stroke({ width: 3, color: cCurrent });
            // directed: recolor the arrowhead to the current color too
            if (directed) {
              const ax = rec.t.position.x;
              const ay = rec.t.position.y;
              const adx = ax - rec.s.position.x;
              const ady = ay - rec.s.position.y;
              const ad = Math.hypot(adx, ady) || 1;
              const aux = adx / ad;
              const auy = ady / ad;
              const tipX = ax - aux * R;
              const tipY = ay - auy * R;
              const baseX = ax - aux * (R + AH);
              const baseY = ay - auy * (R + AH);
              layCurrent
                .poly([
                  tipX, tipY,
                  baseX - auy * AW, baseY + aux * AW,
                  baseX + auy * AW, baseY - aux * AW,
                ])
                .fill(cCurrent);
            }
          }
        }
        if (vs.currentNode) {
          const node = byId.get(vs.currentNode);
          if (node) {
            layCurrent
              .circle(node.position.x, node.position.y, R + 4)
              .stroke({ width: 4, color: cCurrent, alpha: 0.3 })
              .circle(node.position.x, node.position.y, R)
              .stroke({ width: 3, color: cCurrent });
          }
        }
      };

      // full repaint from a folded state (new run / backward scrub)
      const repaintAll = (vs: VisualState) => {
        pVisitedNodes.reset();
        pPathNodes.reset();
        pVisitedEdges.reset();
        pPathEdges.reset();
        for (const [id, st] of vs.nodeStates) {
          if (st === "path") drawNode(pPathNodes, id, cPathFill, cPathBorder);
          else if (st === "visited")
            drawNode(pVisitedNodes, id, cVisitedFill, cVisitedBorder);
        }
        for (const [key, st] of vs.edgeStates) {
          const rec = edgeByKey.get(key);
          if (!rec) continue;
          if (st === "path") drawEdge(pPathEdges, rec, 3, cPathBorder);
          else if (st === "visited")
            drawEdge(pVisitedEdges, rec, 2, cVisitedBorder);
        }
        drawCurrent(vs);
      };

      // incremental forward fold — mirrors promote() in frames.ts, but emits a
      // draw the moment an element changes state so nothing is repainted twice
      const foldForward = (
        vs: VisualState,
        list: Frame[],
        from: number,
        to: number,
      ) => {
        const end = Math.min(to, list.length);
        for (let i = Math.max(0, from); i < end; i++) {
          const f = list[i];
          if (f.kind === "node") {
            vs.currentNode = f.id;
            const prev = vs.nodeStates.get(f.id);
            if (f.path) {
              if (prev !== "path") {
                vs.nodeStates.set(f.id, "path");
                drawNode(pPathNodes, f.id, cPathFill, cPathBorder);
              }
            } else if (!f.peek && prev !== "path" && prev !== "visited") {
              vs.nodeStates.set(f.id, "visited");
              drawNode(pVisitedNodes, f.id, cVisitedFill, cVisitedBorder);
            }
          } else if (f.kind === "edge") {
            const key = edgeKey(f.source, f.target, directed);
            vs.currentEdge = key;
            const prev = vs.edgeStates.get(key);
            const rec = edgeByKey.get(key);
            if (f.path) {
              if (prev !== "path") {
                vs.edgeStates.set(key, "path");
                if (rec) drawEdge(pPathEdges, rec, 3, cPathBorder);
              }
            } else if (!f.peek && prev !== "path" && prev !== "visited") {
              vs.edgeStates.set(key, "visited");
              if (rec) drawEdge(pVisitedEdges, rec, 2, cVisitedBorder);
            }
          } else if (f.kind === "clear") {
            vs.currentNode = null;
            vs.currentEdge = null;
          }
        }
      };

      let vs: VisualState = emptyVisualState();
      let foldedFrames: Frame[] | null = null;
      let foldedCount = 0;
      const decorate: Scene["decorate"] = (nextFrames, nextPlayhead) => {
        if (nextFrames !== foldedFrames || nextPlayhead < foldedCount) {
          // new run or backward scrub → fold from scratch and repaint
          vs = computeVisualState(nextFrames, nextPlayhead, directed);
          foldedFrames = nextFrames;
          foldedCount = nextPlayhead;
          repaintAll(vs);
        } else if (nextPlayhead > foldedCount) {
          foldForward(vs, nextFrames, foldedCount, nextPlayhead);
          foldedFrames = nextFrames;
          foldedCount = nextPlayhead;
          drawCurrent(vs);
        }
      };

      // march the dashes: redraw only the tiny current-cursor layer each frame
      // while there's an active edge (Pixi's ticker already renders the stage
      // continuously; this just keeps the dash phase moving)
      const animateDashes = () => {
        if (!app || !vs.currentEdge) return;
        dashPhase += (app.ticker.deltaMS / 1000) * DASH_SPEED;
        drawCurrent(vs);
      };
      app.ticker.add(animateDashes);
      // ──────────────────────────────────────────────────────────────────

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

      // paint whatever playback state the store is already at onto the fresh
      // scene, then let the playback effect drive it forward from here
      sceneRef.current = { decorate };
      const s0 = useEditorStore.getState();
      decorate(s0.frames, s0.playhead);

      teardown = () => {
        window.clearTimeout(settle);
        sceneRef.current = null;
        application.ticker.remove(animateDashes);
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

  // drive playback: fold the new frames into the overlay whenever the playhead
  // or the frame buffer moves. The scene rebuild above is NOT keyed on these,
  // so a run animates by touching only the overlay, never the whole graph.
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
