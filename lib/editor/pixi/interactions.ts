/**
 * Pointer + keyboard editing for the Pixi edit canvas. One state machine
 * distinguishes pan / node-drag / click-select by a small screen-space
 * threshold, and dispatches through the editor store (which owns dirty/undo-free
 * semantics). Rendering side effects (moving objects, redrawing selection) go
 * through the passed handles so this module stays free of React.
 */
import type { Container } from "pixi.js";

import type { ObjectScene } from "@/lib/editor/pixi/base-objects";
import type { Pt } from "@/lib/editor/pixi/geometry";
import { useEditorStore } from "@/lib/editor/store";

// world-unit hit radius for grabbing a node (node radius is 28; a little slack)
const RIM_R = 32;
const DRAG_PX = 4; // screen-space threshold separating a click from a drag
const EDGE_HIT_PX = 7; // screen-space pick tolerance for selecting an edge

type Pending =
  | { kind: "pan"; sx: number; sy: number }
  | { kind: "move"; id: string; sx: number; sy: number; offx: number; offy: number };

export function attachInteractions(opts: {
  canvas: HTMLCanvasElement;
  world: Container;
  scene: ObjectScene;
  screenToWorld: (clientX: number, clientY: number) => Pt;
  /** redraw grid + persist the view after a pan/zoom */
  redraw: () => void;
  /** redraw the selection layer (so a ring follows a dragged node) */
  refreshSelection: () => void;
}): () => void {
  const { canvas, world, scene, screenToWorld, redraw, refreshSelection } = opts;

  let pending: Pending | null = null;
  let active: "pan" | "move" | null = null;
  let lastX = 0;
  let lastY = 0;
  let hovering = false;

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const w = screenToWorld(ev.clientX, ev.clientY);
    const hit = scene.hitNode(w.x, w.y, RIM_R);
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (hit) {
      const c = scene.nodePos(hit.id) ?? w;
      pending = {
        kind: "move",
        id: hit.id,
        sx: ev.clientX,
        sy: ev.clientY,
        offx: c.x - w.x,
        offy: c.y - w.y,
      };
    } else {
      pending = { kind: "pan", sx: ev.clientX, sy: ev.clientY };
    }
    active = null;
    canvas.setPointerCapture?.(ev.pointerId);
  };

  const onMove = (ev: PointerEvent) => {
    if (!pending) return;
    if (!active) {
      const moved = Math.hypot(ev.clientX - pending.sx, ev.clientY - pending.sy);
      if (moved < DRAG_PX) return; // still a click, not a drag
      active = pending.kind;
      if (active === "pan") canvas.style.cursor = "grabbing";
    }
    if (active === "pan") {
      world.position.x += ev.clientX - lastX;
      world.position.y += ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      redraw();
    } else if (active === "move" && pending.kind === "move") {
      const w = screenToWorld(ev.clientX, ev.clientY);
      const x = w.x + pending.offx;
      const y = w.y + pending.offy;
      scene.moveNode(pending.id, x, y);
      refreshSelection();
      // keep the store authoritative so a rebuild can't snap the node back
      useEditorStore.getState().onNodesChange([
        { id: pending.id, type: "position", position: { x, y }, dragging: true },
      ]);
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!pending) return;
    canvas.releasePointerCapture?.(ev.pointerId);
    const store = useEditorStore.getState();
    if (!active) {
      // a click, not a drag → selection
      if (pending.kind === "move") {
        store.selectOnly({ nodeId: pending.id });
      } else {
        const w = screenToWorld(ev.clientX, ev.clientY);
        const edgeId = scene.hitEdge(w.x, w.y, EDGE_HIT_PX / world.scale.x);
        store.selectOnly(edgeId ? { edgeId } : null);
      }
    } else if (active === "move" && pending.kind === "move") {
      const c = scene.nodePos(pending.id);
      if (c) {
        store.onNodesChange([
          {
            id: pending.id,
            type: "position",
            position: { x: c.x, y: c.y },
            dragging: false,
          },
        ]);
      }
    }
    pending = null;
    active = null;
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
    refreshSelection();
  };

  const onEnter = () => {
    hovering = true;
  };
  const onLeave = () => {
    hovering = false;
  };

  // Delete/Backspace removes the selection — but only while the canvas is the
  // user's focus (hovering), and never when they're typing in an input (the
  // inspector fields, or Monaco/terminal in the workspace).
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
    if (!hovering) return;
    const ae = document.activeElement as HTMLElement | null;
    if (
      ae &&
      (ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.tagName === "SELECT" ||
        ae.isContentEditable)
    ) {
      return;
    }
    const { nodes, edges } = useEditorStore.getState();
    const nodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
    const edgeIds = edges.filter((e) => e.selected).map((e) => e.id);
    if (!nodeIds.length && !edgeIds.length) return;
    ev.preventDefault();
    useEditorStore.getState().removeElements(nodeIds, edgeIds);
  };

  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerenter", onEnter);
  canvas.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKey);

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerenter", onEnter);
    canvas.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("keydown", onKey);
  };
}
