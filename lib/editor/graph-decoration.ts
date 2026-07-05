import { MarkerType, type Edge } from "@xyflow/react";

import { NODE_DRAG_HANDLE } from "@/components/editor/graph-node";
import {
  applyFrames,
  computeVisualState,
  edgeKey,
  emptyVisualState,
  type ElementState,
  type Frame,
  type VisualState,
} from "@/lib/editor/frames";
import type { GraphFlowEdge, GraphFlowNode } from "@/lib/editor/store";

function edgeStroke(state: ElementState, isCurrent: boolean, selected: boolean) {
  // selection recolors the whole connector (line + arrowhead) to the ring
  // color — the same signal nodes use — instead of drawing a shape around it
  if (selected) return { stroke: "var(--ring)", strokeWidth: 2.5 };
  if (isCurrent) return { stroke: "var(--graph-current)", strokeWidth: 3 };
  if (state === "path") return { stroke: "var(--graph-path)", strokeWidth: 3 };
  if (state === "visited") {
    return { stroke: "var(--graph-visited-border)", strokeWidth: 2 };
  }
  return { stroke: "var(--graph-edge)", strokeWidth: 1.5 };
}

type NodeEntry = { base: GraphFlowNode; sig: string; node: GraphFlowNode };
type EdgeEntry = { base: Edge; sig: string; edge: Edge };

/**
 * Turns the editor graph + playback frames into decorated React Flow
 * nodes/edges, incrementally. Each call folds only the frames since the last
 * playhead — playback was quadratic when it re-folded the whole prefix every
 * tick, which is what made big graphs jank — and rebuilds only the dimension a
 * frame actually touched, reusing element identity for everything unchanged so
 * React Flow re-renders just the couple of nodes/edges that moved.
 *
 * One instance lives per canvas (held in useState). All the mutable bookkeeping
 * is encapsulated here, off the React render path, so callers just invoke
 * decorate() with the current inputs.
 */
export class GraphDecorator {
  private frames: Frame[] = [];
  private count = 0;
  private directed = false;
  private state: VisualState = emptyVisualState();
  private prevNodes: GraphFlowNode[] | null = null;
  private prevEdges: GraphFlowEdge[] | null = null;
  private prevEditable = false;
  private nodes: GraphFlowNode[] = [];
  private edges: Edge[] = [];
  private nodeCache = new Map<string, NodeEntry>();
  private edgeCache = new Map<string, EdgeEntry>();

  decorate(
    frames: Frame[],
    playhead: number,
    directed: boolean,
    nodes: GraphFlowNode[],
    edges: GraphFlowEdge[],
    editable: boolean,
  ): { nodes: GraphFlowNode[]; edges: Edge[] } {
    let nodesDirty = false;
    let edgesDirty = false;

    if (
      this.frames !== frames ||
      this.directed !== directed ||
      playhead < this.count
    ) {
      // new run, direction flip, or a backward scrub → fold from scratch
      this.state = computeVisualState(frames, playhead, directed);
      nodesDirty = true;
      edgesDirty = true;
    } else if (playhead > this.count) {
      const moved = applyFrames(
        this.state,
        frames,
        this.count,
        playhead,
        directed,
      );
      nodesDirty = moved.nodesChanged;
      edgesDirty = moved.edgesChanged;
    }
    this.frames = frames;
    this.directed = directed;
    this.count = playhead;

    // edits (or the editable flag) change structure — rebuild that dimension
    if (this.prevNodes !== nodes || this.prevEditable !== editable) {
      nodesDirty = true;
    }
    if (this.prevEdges !== edges) edgesDirty = true;
    this.prevNodes = nodes;
    this.prevEdges = edges;
    this.prevEditable = editable;

    const vs = this.state;
    if (nodesDirty) {
      this.nodes = nodes.map((node) => {
        const state = vs.nodeStates.get(node.id) ?? "idle";
        const isCurrent = vs.currentNode === node.id;
        const sig = `${state}|${isCurrent}|${editable}`;
        const prev = this.nodeCache.get(node.id);
        if (prev && prev.base === node && prev.sig === sig) return prev.node;
        const decorated: GraphFlowNode = {
          ...node,
          dragHandle: NODE_DRAG_HANDLE,
          data: { ...node.data, visual: state, isCurrent, editable },
        };
        this.nodeCache.set(node.id, { base: node, sig, node: decorated });
        return decorated;
      });
    }
    if (edgesDirty) {
      this.edges = edges.map((edge): Edge => {
        const key = edgeKey(edge.source, edge.target, directed);
        const state = vs.edgeStates.get(key) ?? "idle";
        const isCurrent = vs.currentEdge === key;
        const selected = edge.selected ?? false;
        const sig = `${state}|${isCurrent}|${directed}|${selected}`;
        const prev = this.edgeCache.get(edge.id);
        if (prev && prev.base === edge && prev.sig === sig) return prev.edge;
        const stroke = edgeStroke(state, isCurrent, selected);
        // React Flow markers default to markerUnits="strokeWidth", so the
        // arrowhead scales with the line; divide it back out to keep a constant
        // on-screen size at every state.
        const markerSize = 30 / stroke.strokeWidth;
        const decorated: Edge = {
          ...edge,
          type: "floating",
          animated: isCurrent,
          style: stroke,
          markerEnd: directed
            ? {
                type: MarkerType.ArrowClosed,
                color: stroke.stroke,
                width: markerSize,
                height: markerSize,
              }
            : undefined,
        };
        this.edgeCache.set(edge.id, { base: edge, sig, edge: decorated });
        return decorated;
      });
    }

    return { nodes: this.nodes, edges: this.edges };
  }
}
