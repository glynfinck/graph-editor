/**
 * Pointer + keyboard editing for the Pixi edit canvas. One state machine
 * distinguishes pan / node-drag / rim-connect / click-select by a small
 * screen-space threshold, and dispatches through the editor store (which owns
 * dirty semantics). A hover pass gives affordance — the cursor and a ring change
 * with what's under the pointer — so connecting from a rim is discoverable.
 * Rendering side effects go through the passed handles; this module is React-free.
 */
import type { Container, Graphics } from "pixi.js";
import { toast } from "sonner";

import type { ObjectScene } from "@/lib/editor/pixi/base-objects";
import { R, type Pt } from "@/lib/editor/pixi/geometry";
import { useEditorStore } from "@/lib/editor/store";
import { MAX_EDGES, MAX_NODES } from "@/lib/graph/types";

// world-unit hit radii (node radius is 28): the inner body drags the node, the
// rim (circle edge and just outside it) starts a connection
const MOVE_R = 24;
const RIM_R = 36;
const SNAP_R = 36; // connect-target snap radius (React Flow's connectionRadius)
const DRAG_PX = 4; // screen threshold separating a click from a drag
const EDGE_HIT_PX = 7; // screen pick tolerance for selecting an edge

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
  /** top layer for the hover ring and in-progress connection line */
  connectLayer: Graphics;
  connectColor: number;
  screenToWorld: (clientX: number, clientY: number) => Pt;
  /** redraw grid + persist the view after a pan/zoom */
  redraw: () => void;
  /** redraw the selection layer (so a ring follows a dragged node) */
  refreshSelection: () => void;
}): () => void {
  const {
    container,
    canvas,
    world,
    scene,
    connectLayer,
    connectColor,
    screenToWorld,
    redraw,
    refreshSelection,
  } = opts;

  let pending: Pending | null = null;
  let active: "pan" | "move" | "connect" | null = null;
  let lastX = 0;
  let lastY = 0;
  let hovering = false;
  // hover affordance: which node (and zone) the idle pointer is over
  let hoverId: string | null = null;
  let hoverZone: "body" | "rim" | null = null;

  const drawHover = () => {
    connectLayer.clear();
    if (!hoverId) return;
    const p = scene.nodePos(hoverId);
    if (!p) return;
    // a ring hugging the rim signals "you can drag from here to connect"
    connectLayer
      .circle(p.x, p.y, R + 2)
      .stroke({ width: 2, color: connectColor, alpha: hoverZone === "rim" ? 0.9 : 0.4 });
  };

  const updateHover = (clientX: number, clientY: number) => {
    const w = screenToWorld(clientX, clientY);
    const hit = scene.hitNode(w.x, w.y, RIM_R);
    let id: string | null = null;
    let zone: "body" | "rim" | null = null;
    let cursor = "grab";
    if (hit) {
      id = hit.id;
      zone = hit.dist <= MOVE_R ? "body" : "rim";
      cursor = zone === "rim" ? "crosshair" : "grab";
    } else if (scene.hitEdge(w.x, w.y, EDGE_HIT_PX / world.scale.x)) {
      cursor = "pointer";
    }
    container.style.cursor = cursor;
    if (id !== hoverId || zone !== hoverZone) {
      hoverId = id;
      hoverZone = zone;
      drawHover();
    }
  };

  const clearHover = () => {
    if (hoverId) {
      hoverId = null;
      hoverZone = null;
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
    connectLayer.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2, color: connectColor });
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
      scene.moveNode(pending.id, x, y);
      refreshSelection();
      useEditorStore.getState().onNodesChange([
        { id: pending.id, type: "position", position: { x, y }, dragging: true },
      ]);
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
    store.addNodeAt(w.x - R, w.y - R); // addNodeAt takes the top-left corner
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
    drawHover();
  };

  const onEnter = () => {
    hovering = true;
  };
  const onLeave = () => {
    hovering = false;
    if (!active) clearHover();
  };

  // Delete/Backspace removes the selection — only while the canvas is the user's
  // focus (hovering), and never while typing in an input (inspector fields, or
  // Monaco / the terminal in the workspace).
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
