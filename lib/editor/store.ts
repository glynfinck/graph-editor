"use client";

import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";

import { isGraphEvent, type ElementState, type Frame } from "@/lib/editor/frames";
import { nextNodeLabel, type GraphDoc } from "@/lib/graph/types";

export type GraphNodeData = {
  name: string;
  /** decorations applied by the canvas during playback */
  visual?: ElementState;
  isCurrent?: boolean;
  editable?: boolean;
};
export type GraphFlowNode = Node<GraphNodeData, "graphNode">;

/** Per-edge attributes: null = the "plain" (unweighted / unlabeled) case. */
export type GraphEdgeData = {
  weight?: number | null;
  name?: string | null;
};
export type GraphFlowEdge = Edge<GraphEdgeData>;

export type WorkerStatus = "booting" | "ready" | "running" | "failed";

export type ConsoleLine = {
  kind: "stdout" | "stderr" | "error" | "info" | "command";
  text: string;
  /** shell prompt the command was typed at (kind === "command" only) */
  prompt?: string;
};

/** Original playback formula: speed 1–100 → 800–8 ms per frame. */
export function frameDelayMs(speed: number) {
  return (101 - speed) * 8;
}

// a setTimeout + render cycle can't beat a display frame
const MIN_TICK_MS = 17;
const STRIDE_RAMP_START = 70;
const MAX_EVENTS_PER_SECOND = 600;

/**
 * Graph events consumed per tick. Timers can't fire faster than a frame
 * paint, so the rabbit end of the slider gets faster by taking bigger
 * strides per tick instead of shorter delays. The target rate grows
 * geometrically from the linear formula's rate at speed 70 (~4 events/s) to
 * ~600 events/s at 100 — every notch is the same ~18% faster, no cliff.
 */
export function playbackStride(speed: number) {
  if (speed <= STRIDE_RAMP_START) return 1;
  const baseEps = 1000 / frameDelayMs(STRIDE_RAMP_START);
  const t = (speed - STRIDE_RAMP_START) / (100 - STRIDE_RAMP_START);
  const targetEps = baseEps * Math.pow(MAX_EVENTS_PER_SECOND / baseEps, t);
  const effectiveDelay = Math.max(frameDelayMs(speed), MIN_TICK_MS);
  return Math.max(1, Math.round((targetEps * effectiveDelay) / 1000));
}

type EditorState = {
  // document
  graphId: string;
  name: string;
  description: string;
  /** graph-level: directed graphs draw arrowheads and dedupe by direction */
  directed: boolean;
  nodes: GraphFlowNode[];
  edges: GraphFlowEdge[];
  dirty: boolean;

  // python runtime
  status: WorkerStatus;
  console: ConsoleLine[];
  frames: Frame[];
  playhead: number;
  playing: boolean;
  speed: number;

  // document actions
  init: (
    graphId: string,
    name: string,
    description: string,
    directed: boolean,
    doc: GraphDoc,
  ) => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setDirected: (directed: boolean) => void;
  onNodesChange: (changes: NodeChange<GraphFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<GraphFlowEdge>[]) => void;
  connect: (source: string, target: string) => void;
  addNodeAt: (x: number, y: number) => void;
  setNodeName: (nodeId: string, name: string) => void;
  setEdgeWeight: (edgeId: string, weight: number | null) => void;
  setEdgeName: (edgeId: string, name: string | null) => void;
  markSaved: () => void;
  toDoc: () => GraphDoc;

  // runtime actions
  setStatus: (status: WorkerStatus) => void;
  appendConsole: (line: ConsoleLine) => void;
  clearConsole: () => void;
  startRun: () => void;
  pushFrames: (batch: Frame[]) => void;
  finishRun: (ok: boolean) => void;
  play: () => void;
  pause: () => void;
  tick: () => void;
  stepForward: () => void;
  stepBack: () => void;
  setPlayhead: (playhead: number) => void;
  setSpeed: (speed: number) => void;
  resetPlayback: () => void;
};

// node/edge ids are uuids (the graph_nodes/graph_edges columns are uuid), so
// client-minted ids must be real uuids too, not the old text scheme
const freshId = () => crypto.randomUUID();

export const useEditorStore = create<EditorState>((set, get) => ({
  graphId: "",
  name: "",
  description: "",
  directed: false,
  nodes: [],
  edges: [],
  dirty: false,

  status: "booting",
  console: [],
  frames: [],
  playhead: 0,
  playing: false,
  speed: 60,

  init: (graphId, name, description, directed, doc) =>
    set({
      graphId,
      name,
      description,
      directed,
      nodes: doc.nodes.map((node) => ({
        id: node.id,
        type: "graphNode" as const,
        position: { x: node.x, y: node.y },
        data: { name: node.name },
      })),
      edges: doc.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: { weight: edge.weight, name: edge.name },
      })),
      dirty: false,
      frames: [],
      playhead: 0,
      playing: false,
      console: [],
    }),

  setName: (name) => set({ name, dirty: true }),
  setDescription: (description) => set({ description, dirty: true }),
  setDirected: (directed) => set({ directed, dirty: true }),

  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      dirty:
        state.dirty ||
        changes.some((c) => c.type === "position" || c.type === "remove"),
    })),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      dirty: state.dirty || changes.some((c) => c.type === "remove"),
    })),

  connect: (source, target) => {
    if (source === target) return;
    const { edges, directed } = get();
    // undirected: A→B and B→A are the same edge; directed: they're distinct
    const exists = edges.some((edge) =>
      directed
        ? edge.source === source && edge.target === target
        : (edge.source === source && edge.target === target) ||
          (edge.source === target && edge.target === source),
    );
    if (exists) return;
    set({
      edges: [
        ...edges,
        { id: freshId(), source, target, data: { weight: null, name: null } },
      ],
      dirty: true,
    });
  },

  addNodeAt: (x, y) => {
    const { nodes } = get();
    const name = nextNodeLabel(nodes.map((node) => node.data.name));
    set({
      nodes: [
        ...nodes,
        {
          id: freshId(),
          type: "graphNode" as const,
          position: { x, y },
          data: { name },
        },
      ],
      dirty: true,
    });
  },

  setNodeName: (nodeId, name) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, name } }
          : node,
      ),
      dirty: true,
    })),

  setEdgeWeight: (edgeId, weight) =>
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId
          ? { ...edge, data: { ...edge.data, weight } }
          : edge,
      ),
      dirty: true,
    })),

  setEdgeName: (edgeId, name) =>
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId ? { ...edge, data: { ...edge.data, name } } : edge,
      ),
      dirty: true,
    })),

  markSaved: () => set({ dirty: false }),

  toDoc: () => {
    const { nodes, edges } = get();
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        name: node.data.name,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        weight: edge.data?.weight ?? null,
        name: edge.data?.name ?? null,
      })),
    };
  },

  setStatus: (status) => set({ status }),

  appendConsole: (line) =>
    set((state) => ({ console: [...state.console, line] })),
  clearConsole: () => set({ console: [] }),

  // console scrollback is preserved across runs, terminal-style — the eraser
  // button (or a shell `clear`) is how it empties. Playback starts live:
  // frames stream in batches while Python runs and the playhead chases them,
  // so big graphs animate immediately instead of after the whole run.
  startRun: () =>
    set((state) => ({
      status: "running",
      frames: [],
      playhead: 0,
      playing: true,
      console: [...state.console, { kind: "info", text: "Running…" }],
    })),

  pushFrames: (batch) =>
    set((state) => ({ frames: [...state.frames, ...batch] })),

  finishRun: (ok) =>
    set((state) => ({
      status: "ready",
      // trailing frame clears the "current" cursor once playback ends
      frames: ok ? [...state.frames, { kind: "clear" }] : state.frames,
      // playback has been running against the stream; a failed run stops it,
      // a pause mid-stream is respected
      playing: ok ? state.playing : false,
    })),

  play: () =>
    set((state) => ({
      playing: true,
      // replay from the start when pressing play at the end
      playhead: state.playhead >= state.frames.length ? 0 : state.playhead,
    })),
  pause: () => set({ playing: false }),

  // Playback and the step buttons move by graph events — like a breakpoint
  // on every Graph API call. Line frames in between are absorbed into the
  // same tick so the code highlight moves together with the canvas, never
  // ahead of it. The scrub slider still moves frame-by-frame for
  // statement-level stepping. At the rabbit end of the speed slider a tick
  // consumes several events at once (see playbackStride).
  tick: () =>
    set((state) => {
      let playhead = state.playhead;
      let remaining = playbackStride(state.speed);
      while (remaining > 0 && playhead < state.frames.length) {
        playhead++;
        if (isGraphEvent(state.frames[playhead - 1])) remaining--;
      }
      // reaching the frontier of a still-streaming run just means we wait
      // for the next batch — only a finished run ends playback
      const streaming = state.status === "running";
      return {
        playhead,
        playing:
          state.playing && (playhead < state.frames.length || streaming),
      };
    }),

  stepForward: () =>
    set((state) => {
      let playhead = state.playhead;
      while (playhead < state.frames.length) {
        playhead++;
        if (isGraphEvent(state.frames[playhead - 1])) break;
      }
      return { playhead, playing: false };
    }),

  stepBack: () =>
    set((state) => {
      let playhead = state.playhead;
      while (playhead > 0) {
        playhead--;
        if (playhead === 0 || isGraphEvent(state.frames[playhead - 1])) break;
      }
      return { playhead, playing: false };
    }),

  setPlayhead: (playhead) =>
    set((state) => ({
      playhead: Math.max(0, Math.min(playhead, state.frames.length)),
      playing: false,
    })),

  setSpeed: (speed) => set({ speed }),

  resetPlayback: () => set({ playhead: 0, playing: false }),
}));
