/**
 * The editable Pixi base: one addressable display object per node and edge, so
 * a drag moves a node in O(incident edges) instead of rebuilding the scene, and
 * structural edits patch just the objects that changed. The read-only path uses
 * chunked batching (rendered inline in pixi-view-canvas); this path trades that
 * batching for addressability, which is the right call at editable scale.
 *
 * Four layers, composed by the edit canvas around the playback overlay so the
 * overlay recolors visited/path node circles yet the labels stay on top:
 *   edges → edge labels → [playback overlay] → node circles → node labels
 */
import { BitmapText, Container, Graphics } from "pixi.js";

import { edgeKey } from "@/lib/editor/frames";
import type { GraphPalette } from "@/lib/editor/pixi/colors";
import {
  arrowheadPoly,
  pointToSegment,
  R,
  trimmedEnds,
  type Pt,
} from "@/lib/editor/pixi/geometry";
import {
  createEdgeLabel,
  createNodeLabel,
  edgeLabelString,
} from "@/lib/editor/pixi/labels";
import type { GraphFlowEdge, GraphFlowNode } from "@/lib/editor/store";

type NodeObj = { circle: Graphics; label: BitmapText; name: string };
type EdgeObj = {
  gfx: Graphics;
  source: string;
  target: string;
  label: Container | null;
  labelStr: string | null;
};

export type ObjectScene = {
  /** layers the composer parents into `world`, in the documented z-order */
  edgesLayer: Container;
  edgeLabelsLayer: Container;
  nodesLayer: Container;
  nodeLabelsLayer: Container;
  /** live accessors for the playback overlay */
  nodePos: (id: string) => Pt | undefined;
  edgeRec: (key: string) => { s: Pt; t: Pt } | undefined;
  /** re-sync the scene to a store snapshot (structural edits) */
  reconcile: (nodes: GraphFlowNode[], edges: GraphFlowEdge[]) => void;
  /** imperative move during a drag: object + incident edges, no reconcile */
  moveNode: (id: string, x: number, y: number) => void;
  setNodeLabel: (id: string, name: string) => void;
  setEdgeLabel: (
    id: string,
    weight: number | null | undefined,
    name: string | null | undefined,
  ) => void;
  /** nearest node within maxDist (world units), optionally excluding one id */
  hitNode: (
    x: number,
    y: number,
    maxDist: number,
    excludeId?: string,
  ) => { id: string; dist: number } | null;
  /** nearest edge id within maxDist (world units) */
  hitEdge: (x: number, y: number, maxDist: number) => string | null;
};

export function createObjectScene(opts: {
  palette: GraphPalette;
  directed: boolean;
}): ObjectScene {
  const { palette: c, directed } = opts;
  const edgesLayer = new Container();
  const edgeLabelsLayer = new Container();
  const nodesLayer = new Container();
  const nodeLabelsLayer = new Container();

  const nodesById = new Map<string, NodeObj>();
  const edgesById = new Map<string, EdgeObj>();
  const incident = new Map<string, Set<string>>();
  const recByKey = new Map<string, { s: Pt; t: Pt }>();

  const center = (id: string): Pt | undefined =>
    nodesById.get(id)?.circle.position;

  const placeNode = (o: NodeObj, x: number, y: number) => {
    o.circle.position.set(x, y);
    // short names sit inside the circle, longer ones hang below as a caption
    o.label.position.set(x, o.name.length <= 4 ? y : y + R + 12);
  };

  const drawEdge = (o: EdgeObj) => {
    o.gfx.clear();
    const s = center(o.source);
    const t = center(o.target);
    if (!s || !t) return;
    const e = trimmedEnds(s, t, directed);
    o.gfx.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: 1.5, color: c.edge });
    if (directed) o.gfx.poly(arrowheadPoly(s, t)).fill(c.edge);
    if (o.label) o.label.position.set((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2);
  };

  const addNode = (n: GraphFlowNode) => {
    const circle = new Graphics()
      .circle(0, 0, R)
      .fill(c.node)
      .stroke({ width: 2, color: c.border });
    nodesLayer.addChild(circle);
    const label = createNodeLabel(n.data.name, n.position.x, n.position.y, c.text);
    nodeLabelsLayer.addChild(label);
    const o: NodeObj = { circle, label, name: n.data.name };
    placeNode(o, n.position.x, n.position.y);
    nodesById.set(n.id, o);
    if (!incident.has(n.id)) incident.set(n.id, new Set());
  };

  const removeNode = (id: string) => {
    const o = nodesById.get(id);
    if (!o) return;
    o.circle.destroy();
    o.label.destroy();
    nodesById.delete(id);
    incident.delete(id);
  };

  const link = (nodeId: string, edgeId: string) => {
    let set = incident.get(nodeId);
    if (!set) {
      set = new Set();
      incident.set(nodeId, set);
    }
    set.add(edgeId);
  };

  const addEdge = (e: GraphFlowEdge) => {
    const gfx = new Graphics();
    edgesLayer.addChild(gfx);
    const labelStr = edgeLabelString(e.data?.weight, e.data?.name);
    let label: Container | null = null;
    if (labelStr) {
      label = createEdgeLabel(labelStr, c.text, c.bg, c.border);
      edgeLabelsLayer.addChild(label);
    }
    const o: EdgeObj = { gfx, source: e.source, target: e.target, label, labelStr };
    edgesById.set(e.id, o);
    link(e.source, e.id);
    link(e.target, e.id);
    drawEdge(o);
  };

  const removeEdge = (id: string) => {
    const o = edgesById.get(id);
    if (!o) return;
    o.gfx.destroy();
    o.label?.destroy();
    incident.get(o.source)?.delete(id);
    incident.get(o.target)?.delete(id);
    edgesById.delete(id);
  };

  function setNodeLabel(id: string, name: string) {
    const o = nodesById.get(id);
    if (!o || o.name === name) return; // cheap no-op so a label pass can call it freely
    o.name = name;
    o.label.text = name;
    placeNode(o, o.circle.position.x, o.circle.position.y);
  }

  function setEdgeLabel(
    id: string,
    weight: number | null | undefined,
    name: string | null | undefined,
  ) {
    const o = edgesById.get(id);
    if (!o) return;
    const str = edgeLabelString(weight, name);
    if (str === o.labelStr) return;
    o.label?.destroy();
    o.labelStr = str;
    o.label = str ? createEdgeLabel(str, c.text, c.bg, c.border) : null;
    if (o.label) edgeLabelsLayer.addChild(o.label);
    drawEdge(o); // positions the new label at the midpoint
  }

  const reconcile = (nodes: GraphFlowNode[], edges: GraphFlowEdge[]) => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edgeIds = new Set(edges.map((e) => e.id));
    for (const id of [...nodesById.keys()]) if (!nodeIds.has(id)) removeNode(id);
    for (const id of [...edgesById.keys()]) if (!edgeIds.has(id)) removeEdge(id);

    for (const n of nodes) {
      const o = nodesById.get(n.id);
      if (!o) addNode(n);
      else {
        if (o.name !== n.data.name) setNodeLabel(n.id, n.data.name);
        placeNode(o, n.position.x, n.position.y);
      }
    }
    for (const e of edges) {
      const o = edgesById.get(e.id);
      if (!o) addEdge(e);
      else setEdgeLabel(e.id, e.data?.weight, e.data?.name);
    }

    // positions may have shifted; rebuild the frame-key index (live position
    // refs) and redraw every edge
    recByKey.clear();
    for (const [, o] of edgesById) {
      const s = center(o.source);
      const t = center(o.target);
      if (s && t) recByKey.set(edgeKey(o.source, o.target, directed), { s, t });
      drawEdge(o);
    }
  };

  const moveNode = (id: string, x: number, y: number) => {
    const o = nodesById.get(id);
    if (!o) return;
    placeNode(o, x, y);
    for (const eid of incident.get(id) ?? []) {
      const eo = edgesById.get(eid);
      if (eo) drawEdge(eo);
    }
  };

  const hitNode = (
    x: number,
    y: number,
    maxDist: number,
    excludeId?: string,
  ) => {
    let best: { id: string; dist: number } | null = null;
    for (const [id, o] of nodesById) {
      if (id === excludeId) continue;
      const d = Math.hypot(x - o.circle.position.x, y - o.circle.position.y);
      if (d <= maxDist && (!best || d < best.dist)) best = { id, dist: d };
    }
    return best;
  };

  const hitEdge = (x: number, y: number, maxDist: number) => {
    let bestId: string | null = null;
    let bestDist = maxDist;
    for (const [id, o] of edgesById) {
      const s = center(o.source);
      const t = center(o.target);
      if (!s || !t) continue;
      const e = trimmedEnds(s, t, directed);
      const d = pointToSegment(x, y, e.x1, e.y1, e.x2, e.y2);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  };

  return {
    edgesLayer,
    edgeLabelsLayer,
    nodesLayer,
    nodeLabelsLayer,
    nodePos: (id) => center(id),
    edgeRec: (key) => recByKey.get(key),
    reconcile,
    moveNode,
    setNodeLabel,
    setEdgeLabel,
    hitNode,
    hitEdge,
  };
}
