/**
 * Pointer + keyboard editing for the Pixi edit canvas. One state machine
 * distinguishes pan / node-drag / rim-connect / click-select by a small
 * screen-space threshold, and dispatches through the editor store (which owns
 * dirty semantics). A hover pass gives affordance — the cursor and a ring change
 * with what's under the pointer — so connecting from a rim is discoverable.
 * Rendering side effects go through the passed handles; this module is React-free.
 */
import type { Container, Graphics, Ticker } from "pixi.js";
import { toast } from "sonner";

import type { ObjectScene } from "@/lib/editor/pixi/base-objects";
import { R, type Pt } from "@/lib/editor/pixi/geometry";
import { zoomAtPointer } from "@/lib/editor/pixi/stage";
import { useEditorStore } from "@/lib/editor/store";
import { MAX_EDGES, MAX_NODES } from "@/lib/graph/types";

// world-unit hit radii (node radius is 28): the inner body drags the node, the
// rim (circle edge and just outside it) starts a connection
const MOVE_R = 24;
const RIM_R = 36;
const SNAP_R = 36; // connect-target snap radius (React Flow's connectionRadius)
const DRAG_PX = 4; // screen threshold separating a click from a drag
const EDGE_HIT_PX = 7; // screen pick tolerance for selecting an edge
const CONNECT_DASH = 6; // dashed in-progress connection line (React Flow: "6 3")
const CONNECT_GAP = 3;
// Hover ring — the "concentric breathe": a soft brand ring outside the node
// that scales 1→1.08 over 1.5s (the old React Flow node-connect-hint pulse).
// Selection is a crisp static --ring circle at R+3; the hover ring bases
// OUTSIDE it when the node is selected so the two channels never collide.
const PULSE_MS = 1500;
const PULSE_SCALE = 0.08;
const HOVER_ALPHA = 0.6; // brand/60, like the old border-brand/60
const HOVER_BASE = 32; // R+4 — hugs the rim (unselected)
const HOVER_BASE_SELECTED = 35; // R+7 — steps outside the selection ring

type Pending =
  | { kind: "pan"; sx: number; sy: number }
  | { kind: "move"; id: string; sx: number; sy: number; offx: number; offy: number }
  | { kind: "connect"; id: string; sx: number; sy: number };

export function attachInteractions(opts: {
  /** the wrapping element — the cursor is set here (Pixi manages the canvas's
   * own cursor on every move, so ours would get clobbered); the canvas inherits */
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  world: Container;
  scene: ObjectScene;
  /** drives the breathing hover ring */
  ticker: Ticker;
  /** top layer for the hover ring and in-progress connection line */
  connectLayer: Graphics;
  connectColor: number;
  screenToWorld: (clientX: number, clientY: number) => Pt;
  /** redraw grid + persist the view after a pan/zoom */
  redraw: () => void;
  /** redraw the selection layer (so a ring follows a dragged node) */
  refreshSelection: () => void;
  /** repaint playback decorations at live positions (so they follow a drag) */
  refreshOverlay: () => void;
}): () => void {
  const {
    container,
    canvas,
    world,
    scene,
    ticker,
    connectLayer,
    connectColor,
    screenToWorld,
    redraw,
    refreshSelection,
    refreshOverlay,
  } = opts;

  let pending: Pending | null = null;
  let active: "pan" | "move" | "connect" | null = null;
  let lastX = 0;
  let lastY = 0;
  let hovering = false;
  // hover affordance: which node the idle pointer is over (any zone — the
  // cursor alone distinguishes move-body from connect-rim, like React Flow)
  let hoverId: string | null = null;
  let pulseT = 0;
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const drawHover = () => {
    connectLayer.clear();
    if (!hoverId) return;
    const p = scene.nodePos(hoverId);
    if (!p) return;
    // concentric breathe: soft brand ring that scales 1→1.08 (ease-in-out via
    // cosine), basing outside the crisp selection ring when the node is
    // selected so the two never collide
    const selected = useEditorStore
      .getState()
      .nodes.some((n) => n.id === hoverId && n.selected);
    const base = selected ? HOVER_BASE_SELECTED : HOVER_BASE;
    const wave = reducedMotion
      ? 0
      : 0.5 - 0.5 * Math.cos((2 * Math.PI * pulseT) / PULSE_MS);
    connectLayer
      .circle(p.x, p.y, base * (1 + PULSE_SCALE * wave))
      .stroke({ width: 2, color: connectColor, alpha: HOVER_ALPHA });
  };

  // breathe only while idle-hovering (a drag repurposes the layer)
  const animateHover = () => {
    if (!hoverId || pending || reducedMotion) return;
    pulseT += ticker.deltaMS;
    drawHover();
  };
  ticker.add(animateHover);

  const updateHover = (clientX: number, clientY: number) => {
    const w = screenToWorld(clientX, clientY);
    const hit = scene.hitNode(w.x, w.y, RIM_R);
    let id: string | null = null;
    let cursor = "grab";
    if (hit) {
      id = hit.id;
      cursor = hit.dist <= MOVE_R ? "grab" : "crosshair";
    } else if (scene.hitEdge(w.x, w.y, EDGE_HIT_PX / world.scale.x)) {
      cursor = "pointer";
    }
    container.style.cursor = cursor;
    if (id !== hoverId) {
      hoverId = id;
      pulseT = 0; // each hover starts at rest (scale 1) and breathes out
      drawHover();
    }
  };

  const clearHover = () => {
    if (hoverId) {
      hoverId = null;
      connectLayer.clear();
    }
  };

  const drawConnect = (sourceId: string, cursor: Pt) => {
    connectLayer.clear();
    const s = scene.nodePos(sourceId);
    if (!s) return;
    const snap = scene.hitNode(cursor.x, cursor.y, SNAP_R, sourceId);
    const end = snap ? (scene.nodePos(snap.id) ?? cursor) : cursor;
    const dx = end.x - s.x;
    const dy = end.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const x1 = s.x + ux * R;
    const y1 = s.y + uy * R;
    const x2 = snap ? end.x - ux * R : end.x;
    const y2 = snap ? end.y - uy * R : end.y;
    if (snap) {
      connectLayer.circle(end.x, end.y, R + 3).stroke({ width: 2.5, color: connectColor });
    }
    // dashed line, like React Flow's in-progress connection
    const segLen = Math.hypot(x2 - x1, y2 - y1) || 1;
    const period = CONNECT_DASH + CONNECT_GAP;
    for (let p = 0; p < segLen; p += period) {
      const a = p;
      const b = Math.min(segLen, p + CONNECT_DASH);
      connectLayer.moveTo(x1 + ux * a, y1 + uy * a).lineTo(x1 + ux * b, y1 + uy * b);
    }
    connectLayer.stroke({ width: 2, color: connectColor });
  };

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    hovering = true;
    const w = screenToWorld(ev.clientX, ev.clientY);
    const hit = scene.hitNode(w.x, w.y, RIM_R);
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (hit && hit.dist <= MOVE_R) {
      const c = scene.nodePos(hit.id) ?? w;
      pending = {
        kind: "move",
        id: hit.id,
        sx: ev.clientX,
        sy: ev.clientY,
        offx: c.x - w.x,
        offy: c.y - w.y,
      };
    } else if (hit) {
      pending = { kind: "connect", id: hit.id, sx: ev.clientX, sy: ev.clientY };
    } else {
      pending = { kind: "pan", sx: ev.clientX, sy: ev.clientY };
    }
    active = null;
  };

  const onMove = (ev: PointerEvent) => {
    if (!pending) {
      if (hovering) updateHover(ev.clientX, ev.clientY);
      return;
    }
    if (!active) {
      const moved = Math.hypot(ev.clientX - pending.sx, ev.clientY - pending.sy);
      if (moved < DRAG_PX) return; // still a click, not a drag
      active = pending.kind;
      if (active === "pan") {
        container.style.cursor = "grabbing";
        connectLayer.clear(); // drop any hover ring
      } else if (active === "connect") {
        container.style.cursor = "crosshair";
      } else {
        container.style.cursor = "grabbing";
        connectLayer.clear();
        hoverId = null;
      }
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
      // move imperatively for live feedback; the store write is deferred to
      // pointer-up so a drag never re-renders React (structureSig, the label
      // pass, and the selection memos all key off the nodes array reference)
      scene.moveNode(pending.id, x, y);
      refreshSelection();
      refreshOverlay(); // keep any playback decorations glued to the node
    } else if (active === "connect" && pending.kind === "connect") {
      drawConnect(pending.id, screenToWorld(ev.clientX, ev.clientY));
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!pending) return;
    const store = useEditorStore.getState();
    if (!active) {
      if (pending.kind === "move" || pending.kind === "connect") {
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
    } else if (active === "connect" && pending.kind === "connect") {
      const w = screenToWorld(ev.clientX, ev.clientY);
      const snap = scene.hitNode(w.x, w.y, SNAP_R, pending.id);
      if (snap) {
        if (store.edges.length >= MAX_EDGES) {
          toast.error(`Graphs are limited to ${MAX_EDGES.toLocaleString()} edges.`);
        } else {
          store.connect(pending.id, snap.id); // self-loop/dupes guarded in store
        }
      }
    }
    pending = null;
    active = null;
    connectLayer.clear();
    hoverId = null;
    updateHover(ev.clientX, ev.clientY); // restore hover cursor/ring
  };

  const onDbl = (ev: MouseEvent) => {
    const w = screenToWorld(ev.clientX, ev.clientY);
    if (scene.hitNode(w.x, w.y, RIM_R)) return; // double-clicked a node, not the pane
    const store = useEditorStore.getState();
    if (store.nodes.length >= MAX_NODES) {
      toast.error(`Graphs are limited to ${MAX_NODES.toLocaleString()} nodes.`);
      return;
    }
    // the Pixi scene renders a node's stored position as the circle CENTER
    // (base-objects placeNode), so drop the node's center on the cursor — no
    // top-left correction like React Flow's box model needed
    store.addNodeAt(w.x, w.y);
  };

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    zoomAtPointer(world, canvas, ev);
    // world children (selection, overlay) scale with the zoom automatically;
    // only the stage-space grid and the hover ring need a manual repaint
    redraw();
    refreshSelection();
    drawHover();
  };

  const onEnter = () => {
    hovering = true;
  };
  const onLeave = () => {
    hovering = false;
    if (!active) clearHover();
  };

  // Delete/Backspace removes the selection. Gated only on NOT typing in an
  // input (inspector fields, or Monaco / the terminal in the workspace) — not
  // on hover, so a selection stays deletable once the pointer leaves the canvas
  // (e.g. moving toward the inspector) and keyboard-only users can delete too.
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
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

  container.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("dblclick", onDbl);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerenter", onEnter);
  canvas.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKey);

  return () => {
    ticker.remove(animateHover);
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("dblclick", onDbl);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerenter", onEnter);
    canvas.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("keydown", onKey);
  };
}
