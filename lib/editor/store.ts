"use client";

import { create } from "zustand";

import {
  currentPosAt,
  framePos,
  isGraphEvent,
  type ElementState,
  type Frame,
  type SourcePos,
} from "@/lib/editor/frames";
import {
  nextNodeLabel,
  type AttributeValue,
  type Attributes,
  type GraphDoc,
} from "@/lib/graph/types";

export type GraphNodeData = {
  name: string;
  /** open-ended attribute bag algorithms read (capacity, colour, …) */
  attributes?: Attributes;
  /** decorations applied by the canvas during playback */
  visual?: ElementState;
  isCurrent?: boolean;
  editable?: boolean;
};

/** A node in the editor's flat document model (was React Flow's Node). */
export type GraphFlowNode = {
  id: string;
  type: "graphNode";
  position: { x: number; y: number };
  data: GraphNodeData;
  /** single-select highlight */
  selected?: boolean;
};

/** Per-edge attributes: null = the "plain" (unweighted / unlabeled) case.
 *  `attributes` is the open-ended bag (algorithm inputs), like nodes'. */
export type GraphEdgeData = {
  weight?: number | null;
  name?: string | null;
  attributes?: Attributes;
};

/** An edge in the editor's flat document model (was React Flow's Edge). */
export type GraphFlowEdge = {
  id: string;
  source: string;
  target: string;
  data?: GraphEdgeData;
  selected?: boolean;
};

/**
 * The change operations the canvas emits — a drag (position), a click
 * (select), or a delete (remove). applyNodeChanges/applyEdgeChanges below
 * apply them immutably, replacing the React Flow reducers of the same name.
 */
export type NodeChange =
  | {
      type: "position";
      id: string;
      position?: { x: number; y: number };
      /** kept for call-site parity; the editor doesn't persist a drag flag */
      dragging?: boolean;
    }
  | { type: "select"; id: string; selected: boolean }
  | { type: "remove"; id: string };

export type EdgeChange =
  | { type: "select"; id: string; selected: boolean }
  | { type: "remove"; id: string };

/** Apply node changes immutably, preserving order (like React Flow did). */
function applyNodeChanges(
  changes: NodeChange[],
  nodes: GraphFlowNode[],
): GraphFlowNode[] {
  if (!changes.length) return nodes;
  const removed = new Set<string>();
  const byId = new Map<string, NodeChange[]>();
  for (const c of changes) {
    if (c.type === "remove") removed.add(c.id);
    else byId.set(c.id, [...(byId.get(c.id) ?? []), c]);
  }
  const next: GraphFlowNode[] = [];
  for (const node of nodes) {
    if (removed.has(node.id)) continue;
    let updated = node;
    for (const c of byId.get(node.id) ?? []) {
      if (c.type === "position")
        updated = { ...updated, position: c.position ?? updated.position };
      else if (c.type === "select")
        updated = { ...updated, selected: c.selected };
    }
    next.push(updated);
  }
  return next;
}

/** Apply edge changes immutably, preserving order (like React Flow did). */
function applyEdgeChanges(
  changes: EdgeChange[],
  edges: GraphFlowEdge[],
): GraphFlowEdge[] {
  if (!changes.length) return edges;
  const removed = new Set<string>();
  const selected = new Map<string, boolean>();
  for (const c of changes) {
    if (c.type === "remove") removed.add(c.id);
    else selected.set(c.id, c.selected);
  }
  const next: GraphFlowEdge[] = [];
  for (const edge of edges) {
    if (removed.has(edge.id)) continue;
    next.push(
      selected.has(edge.id) ? { ...edge, selected: selected.get(edge.id) } : edge,
    );
  }
  return next;
}

export type WorkerStatus = "booting" | "ready" | "running" | "failed";

/**
 * Playback stepping granularity: "events" rests only on graph events (the
 * canvas-smooth default), "statements" stops on every frame so the code
 * highlight walks line by line.
 */
export type StepGranularity = "events" | "statements";

/**
 * Hit test: crossing `pos` counts only when it moves the traced cursor onto
 * a breakpoint line it wasn't already on — one hit per arrival, so several
 * frames stamped with the same line register as a single stop.
 */
function isBreakpointArrival(
  breakpoints: Record<string, number[]>,
  pos: SourcePos | null,
  prev: SourcePos | null,
): boolean {
  return (
    pos !== null &&
    (prev === null || prev.file !== pos.file || prev.line !== pos.line) &&
    (breakpoints[pos.file]?.includes(pos.line) ?? false)
  );
}

function hasAnyBreakpoint(breakpoints: Record<string, number[]>): boolean {
  return Object.values(breakpoints).some((lines) => lines.length > 0);
}

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

/** What a playhead walk rests on. `filtering`: breakpoints set with pause off,
 * so only breakpoint arrivals count; else every statement ("statements") or
 * every graph event ("events") rests. One source of truth for tick /
 * stepForward / stepBack / runToBreakpoint so they never drift. */
type StopMode = { filtering: boolean; statements: boolean };

function stopMode(state: {
  stepGranularity: StepGranularity;
  breakpoints: Record<string, number[]>;
  pauseOnBreakpoint: boolean;
}): StopMode {
  return {
    statements: state.stepGranularity === "statements",
    filtering: hasAnyBreakpoint(state.breakpoints) && !state.pauseOnBreakpoint,
  };
}

/** Whether the playhead rests just past `frame`. `arrival` is precomputed by
 * the caller (before it advances the traced cursor) so tick can reuse the same
 * value for its pause-on-breakpoint check. */
function isStop(frame: Frame, arrival: boolean, mode: StopMode): boolean {
  return mode.filtering ? arrival : mode.statements || isGraphEvent(frame);
}

/** Advance from `from` to just past the next rest point (see isStop), seeding
 * and carrying the traced cursor for arrival detection. Shared by stepForward
 * (store mode) and runToBreakpoint (forced breakpoint-arrival mode). */
function advanceForward(
  frames: Frame[],
  breakpoints: Record<string, number[]>,
  from: number,
  mode: StopMode,
): number {
  let playhead = from;
  let prev = currentPosAt(frames, playhead);
  while (playhead < frames.length) {
    const frame = frames[playhead];
    const pos = framePos(frame);
    const arrival = isBreakpointArrival(breakpoints, pos, prev);
    playhead++;
    if (pos) prev = pos;
    if (isStop(frame, arrival, mode)) break;
  }
  return playhead;
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
  stepGranularity: StepGranularity;
  /** playback breakpoints, line numbers keyed by file path */
  breakpoints: Record<string, number[]>;
  /**
   * what breakpoints do: false (default) filters the animation — playback
   * walks breakpoint-to-breakpoint at the speed pace without stopping;
   * true pauses playback on each arrival, debugger-style
   */
  pauseOnBreakpoint: boolean;
  /** show the executing-line highlight in the code editor */
  showExecutingLine: boolean;
  /** auto-scroll the code editor to keep the executing line in view */
  followExecutingLine: boolean;

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
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** select exactly one node or edge (or clear with null) — never dirties */
  selectOnly: (target: { nodeId?: string; edgeId?: string } | null) => void;
  /** remove nodes (cascading to their incident edges) plus edges, in one pass */
  removeElements: (nodeIds: string[], edgeIds: string[]) => void;
  connect: (source: string, target: string) => void;
  addNodeAt: (x: number, y: number) => void;
  setNodeName: (nodeId: string, name: string) => void;
  setEdgeWeight: (edgeId: string, weight: number | null) => void;
  setEdgeName: (edgeId: string, name: string | null) => void;
  /** attribute-bag edits (UI-only); keys stay ordered on rename */
  setNodeAttr: (nodeId: string, key: string, value: AttributeValue) => void;
  renameNodeAttr: (nodeId: string, oldKey: string, newKey: string) => void;
  removeNodeAttr: (nodeId: string, key: string) => void;
  setEdgeAttr: (edgeId: string, key: string, value: AttributeValue) => void;
  renameEdgeAttr: (edgeId: string, oldKey: string, newKey: string) => void;
  removeEdgeAttr: (edgeId: string, key: string) => void;
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
  setStepGranularity: (granularity: StepGranularity) => void;
  toggleBreakpoint: (file: string, line: number) => void;
  setPauseOnBreakpoint: (pause: boolean) => void;
  /** advance to the next breakpoint arrival (or the end) and pause */
  runToBreakpoint: () => void;
  setShowExecutingLine: (show: boolean) => void;
  setFollowExecutingLine: (follow: boolean) => void;
  resetPlayback: () => void;
};

// node/edge ids are uuids (the graph_nodes/graph_edges columns are uuid), so
// client-minted ids must be real uuids too, not the old text scheme
const freshId = () => crypto.randomUUID();

/** An attribute bag with `key` removed (fresh object). */
function without(attrs: Attributes | undefined, key: string): Attributes {
  const next = { ...(attrs ?? {}) };
  delete next[key];
  return next;
}

/** Rename a key in place, preserving insertion order so a row being renamed in
 *  the inspector doesn't jump to the end. No-op if oldKey is absent/unchanged. */
function renameKey(
  attrs: Attributes | undefined,
  oldKey: string,
  newKey: string,
): Attributes {
  const current = attrs ?? {};
  if (oldKey === newKey || !(oldKey in current)) return current;
  const next: Attributes = {};
  for (const [k, v] of Object.entries(current)) {
    next[k === oldKey ? newKey : k] = v;
  }
  return next;
}

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
  // default to a brisk, eye-catching traversal (~208ms/event) — fast enough to
  // feel alive on first view, with the slider free to slow right down for study
  speed: 75,
  // sticky preferences like speed — survive init/startRun/resetPlayback
  stepGranularity: "events",
  showExecutingLine: true,
  followExecutingLine: true,
  pauseOnBreakpoint: false,
  // breakpoints reset per document (see init)
  breakpoints: {},

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
        data: { name: node.name, attributes: node.attributes ?? {} },
      })),
      edges: doc.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: {
          weight: edge.weight,
          name: edge.name,
          attributes: edge.attributes ?? {},
        },
      })),
      dirty: false,
      frames: [],
      playhead: 0,
      playing: false,
      console: [],
      breakpoints: {},
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

  // Single-select across both collections. applyNodeChanges/applyEdgeChanges
  // don't auto-deselect, so emit deselects for anything currently selected that
  // isn't the target. Routed through the change handlers, which don't dirty on
  // "select" — so clicking never lights up Save.
  selectOnly: (target) => {
    const { nodes, edges, onNodesChange, onEdgesChange } = get();
    const nodeId = target?.nodeId ?? null;
    const edgeId = target?.edgeId ?? null;
    const nodeChanges = nodes
      .filter((n) => (n.selected ?? false) !== (n.id === nodeId))
      .map((n) => ({
        id: n.id,
        type: "select" as const,
        selected: n.id === nodeId,
      }));
    const edgeChanges = edges
      .filter((e) => (e.selected ?? false) !== (e.id === edgeId))
      .map((e) => ({
        id: e.id,
        type: "select" as const,
        selected: e.id === edgeId,
      }));
    if (nodeChanges.length) onNodesChange(nodeChanges);
    if (edgeChanges.length) onEdgesChange(edgeChanges);
  },

  // Removing a node also removes its incident edges (else the saved doc keeps
  // orphan edges — invisible on canvas but corrupt). One pass for both.
  removeElements: (nodeIds, edgeIds) => {
    const { nodes, edges, onNodesChange, onEdgesChange } = get();
    const nodeSet = new Set(nodeIds);
    const edgeSet = new Set(edgeIds);
    for (const e of edges) {
      if (nodeSet.has(e.source) || nodeSet.has(e.target)) edgeSet.add(e.id);
    }
    const edgeChanges = [...edgeSet]
      .filter((id) => edges.some((e) => e.id === id))
      .map((id) => ({ id, type: "remove" as const }));
    const nodeChanges = [...nodeSet]
      .filter((id) => nodes.some((n) => n.id === id))
      .map((id) => ({ id, type: "remove" as const }));
    if (edgeChanges.length) onEdgesChange(edgeChanges);
    if (nodeChanges.length) onNodesChange(nodeChanges);
  },

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

  setNodeAttr: (nodeId, key, value) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                attributes: { ...(node.data.attributes ?? {}), [key]: value },
              },
            }
          : node,
      ),
      dirty: true,
    })),

  renameNodeAttr: (nodeId, oldKey, newKey) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                attributes: renameKey(node.data.attributes, oldKey, newKey),
              },
            }
          : node,
      ),
      dirty: true,
    })),

  removeNodeAttr: (nodeId, key) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, attributes: without(node.data.attributes, key) },
            }
          : node,
      ),
      dirty: true,
    })),

  setEdgeAttr: (edgeId, key, value) =>
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: {
                ...edge.data,
                attributes: { ...(edge.data?.attributes ?? {}), [key]: value },
              },
            }
          : edge,
      ),
      dirty: true,
    })),

  renameEdgeAttr: (edgeId, oldKey, newKey) =>
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: {
                ...edge.data,
                attributes: renameKey(edge.data?.attributes, oldKey, newKey),
              },
            }
          : edge,
      ),
      dirty: true,
    })),

  removeEdgeAttr: (edgeId, key) =>
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: { ...edge.data, attributes: without(edge.data?.attributes, key) },
            }
          : edge,
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
        attributes: node.data.attributes ?? {},
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        weight: edge.data?.weight ?? null,
        name: edge.data?.name ?? null,
        attributes: edge.data?.attributes ?? {},
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

  // Playback stops, in priority order:
  // - Breakpoints set, pause off ("filter", the default): breakpoint
  //   arrivals ARE the steps — everything between two arrivals is absorbed
  //   into one tick, so the animation walks exactly the chosen lines at the
  //   speed-slider pace. Never strides, so no chosen line is skipped.
  // - Breakpoints set, pause on: normal granularity below, but playback
  //   pauses on each arrival, debugger-style.
  // - No breakpoints: "events" rests on graph events — like a breakpoint on
  //   every Graph API call — with line frames absorbed so the code highlight
  //   moves together with the canvas, never ahead of it (strides at the
  //   rabbit end, see playbackStride); "statements" rests on every frame so
  //   the highlight walks line by line.
  // The scrub slider always moves frame-by-frame regardless of mode.
  tick: () =>
    set((state) => {
      const mode = stopMode(state);
      let playhead = state.playhead;
      let remaining =
        mode.filtering || mode.statements ? 1 : playbackStride(state.speed);
      // where the traced cursor is now, for breakpoint arrival detection
      let prev = currentPosAt(state.frames, playhead);
      let hitBreakpoint = false;
      while (remaining > 0 && playhead < state.frames.length) {
        const frame = state.frames[playhead];
        const pos = framePos(frame);
        const arrival = isBreakpointArrival(state.breakpoints, pos, prev);
        if (arrival && state.pauseOnBreakpoint) {
          // land ON the breakpoint frame and pause, mid-stride if need be
          playhead++;
          hitBreakpoint = true;
          break;
        }
        playhead++;
        if (pos) prev = pos;
        if (isStop(frame, arrival, mode)) remaining--;
      }
      // reaching the frontier of a still-streaming run just means we wait
      // for the next batch — only a finished run ends playback
      const streaming = state.status === "running";
      return {
        playhead,
        playing:
          !hitBreakpoint &&
          state.playing &&
          (playhead < state.frames.length || streaming),
      };
    }),

  stepForward: () =>
    set((state) => ({
      playhead: advanceForward(
        state.frames,
        state.breakpoints,
        state.playhead,
        stopMode(state),
      ),
      playing: false,
    })),

  stepBack: () =>
    set((state) => {
      const mode = stopMode(state);
      if (mode.filtering) {
        // arrivals are defined by forward history, so collect the last
        // breakpoint stop strictly before the current position
        let prev: SourcePos | null = null;
        let target = 0;
        for (let i = 0; i < state.playhead - 1; i++) {
          const pos = framePos(state.frames[i]);
          if (isBreakpointArrival(state.breakpoints, pos, prev)) target = i + 1;
          if (pos) prev = pos;
        }
        return { playhead: target, playing: false };
      }
      let playhead = state.playhead;
      while (playhead > 0) {
        playhead--;
        if (
          mode.statements ||
          playhead === 0 ||
          isGraphEvent(state.frames[playhead - 1])
        )
          break;
      }
      return { playhead, playing: false };
    }),

  setPlayhead: (playhead) =>
    set((state) => ({
      playhead: Math.max(0, Math.min(playhead, state.frames.length)),
      playing: false,
    })),

  setSpeed: (speed) => set({ speed }),

  setStepGranularity: (granularity) => set({ stepGranularity: granularity }),

  toggleBreakpoint: (file, line) =>
    set((state) => {
      const current = state.breakpoints[file] ?? [];
      const next = current.includes(line)
        ? current.filter((l) => l !== line)
        : [...current, line].sort((a, b) => a - b);
      return { breakpoints: { ...state.breakpoints, [file]: next } };
    }),

  // debugger "continue": rest on the next breakpoint arrival regardless of the
  // events/statements setting; with no breakpoints set this runs to the end
  runToBreakpoint: () =>
    set((state) => ({
      playhead: advanceForward(state.frames, state.breakpoints, state.playhead, {
        filtering: true,
        statements: false,
      }),
      playing: false,
    })),

  setPauseOnBreakpoint: (pause) => set({ pauseOnBreakpoint: pause }),

  setShowExecutingLine: (show) => set({ showExecutingLine: show }),
  setFollowExecutingLine: (follow) => set({ followExecutingLine: follow }),

  resetPlayback: () => set({ playhead: 0, playing: false }),
}));
