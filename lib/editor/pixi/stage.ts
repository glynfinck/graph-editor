/**
 * Shared Pixi stage plumbing used by both canvases (edit + view): the theme
 * rebuild signal, pointer pan/zoom, and fit-to-view. Keeps the two renderers
 * agreeing on viewport feel and lifecycle instead of maintaining two copies.
 */
"use client";

import { useEffect, useState } from "react";
import type { Container } from "pixi.js";

import { fitBounds, type Pt } from "@/lib/editor/pixi/geometry";

/**
 * A monotonically increasing counter that bumps whenever the theme or palette
 * changes — next-themes sets `class`, the palette sets `data-palette`, both on
 * <html>. Watches ONLY those attributes (NOT `style`): unrelated inline-style
 * churn (Radix scroll-locks, resizable-panel drags, toasts) must not rebuild
 * the whole scene mid-edit. Key a rebuild effect on the returned value.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setVersion((v) => v + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-palette"],
    });
    return () => obs.disconnect();
  }, []);
  return version;
}

// zoom feel — shared so both canvases scroll identically
const ZOOM_MIN = 0.02;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.2; // per button click / clamp per wheel notch

/** Zoom `world` toward the pointer from a wheel event (cursor stays put). */
export function zoomAtPointer(
  world: Container,
  canvas: HTMLCanvasElement,
  ev: WheelEvent,
) {
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  let dy = ev.deltaY;
  if (ev.deltaMode === 1) dy *= 16; // lines → px
  else if (ev.deltaMode === 2) dy *= 100; // pages → px
  const factor = Math.min(ZOOM_STEP, Math.max(1 / ZOOM_STEP, Math.exp(-dy * 0.0012)));
  zoomBy(world, factor, mx, my);
}

/** Multiply the zoom by `factor` about the screen point (cx,cy), clamped. */
export function zoomBy(
  world: Container,
  factor: number,
  cx: number,
  cy: number,
) {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, world.scale.x * factor));
  const wx = (cx - world.position.x) / world.scale.x;
  const wy = (cy - world.position.y) / world.scale.y;
  world.scale.set(next);
  world.position.set(cx - wx * next, cy - wy * next);
}

/** Step the zoom in/out about the viewport center (for the on-canvas buttons). */
export function zoomStep(
  world: Container,
  screen: { width: number; height: number },
  direction: "in" | "out",
) {
  const factor = direction === "in" ? ZOOM_STEP : 1 / ZOOM_STEP;
  zoomBy(world, factor, screen.width / 2, screen.height / 2);
}

/** Fit `world` so every node is visible with a 10% margin (no-op if empty). */
export function fitView(
  screen: { width: number; height: number },
  world: Container,
  nodes: { position: Pt }[],
) {
  const b = fitBounds(nodes);
  if (!b) return;
  const gw = b.maxX - b.minX || 1;
  const gh = b.maxY - b.minY || 1;
  const scale = Math.min(screen.width / gw, screen.height / gh) * 0.9;
  world.scale.set(scale);
  world.position.set(
    screen.width / 2 - ((b.minX + b.maxX) / 2) * scale,
    screen.height / 2 - ((b.minY + b.maxY) / 2) * scale,
  );
}

/**
 * Drag-to-pan + wheel-to-zoom on a view-only canvas. `onChange` fires after any
 * viewport change (redraw + persist). Returns a detach function. The edit
 * canvas has its own pointer state machine (attachInteractions) and only reuses
 * zoomAtPointer, so this helper is for the read-only path.
 */
export function attachPanZoom(
  canvas: HTMLCanvasElement,
  world: Container,
  onChange: () => void,
): () => void {
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
    onChange();
  };
  const onUp = () => {
    dragging = false;
    canvas.style.cursor = "grab";
  };
  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    zoomAtPointer(world, canvas, ev);
    onChange();
  };
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("wheel", onWheel);
  };
}
