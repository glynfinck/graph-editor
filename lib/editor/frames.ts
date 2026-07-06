/**
 * Animation frames — the messages Python emits to drive the visualization.
 * Playback folds frames[0..playhead) into a VisualState each render, which
 * makes scrubbing and stepping trivially correct.
 */
export type Frame =
  | {
      kind: "node";
      id: string;
      peek: boolean;
      path: boolean;
      line?: number;
      file?: string;
    }
  | {
      kind: "edge";
      source: string;
      target: string;
      peek: boolean;
      path: boolean;
      line?: number;
      file?: string;
    }
  /** the algorithm's cursor moved to a source line without touching the graph */
  | { kind: "line"; line: number; file?: string }
  | { kind: "clear" };

/** A frame that changes what the canvas shows (line frames only move the code cursor). */
export function isGraphEvent(frame: Frame): boolean {
  return frame.kind !== "line";
}

export type ElementState = "idle" | "visited" | "path";

export type VisualState = {
  nodeStates: Map<string, ElementState>;
  edgeStates: Map<string, ElementState>;
  /** node id under the cursor of the running algorithm */
  currentNode: string | null;
  /** undirected edge key (see edgeKey) under the cursor */
  currentEdge: string | null;
};

/**
 * Canonical key for an edge between two node ids. Undirected edges normalize
 * endpoint order so A→B and B→A collapse to one key; directed edges keep the
 * source→target order so the two are distinct.
 */
export function edgeKey(a: string, b: string, directed = false): string {
  if (directed) return `${a}|${b}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function emptyVisualState(): VisualState {
  return {
    nodeStates: new Map(),
    edgeStates: new Map(),
    currentNode: null,
    currentEdge: null,
  };
}

function promote(
  states: Map<string, ElementState>,
  key: string,
  frame: { peek: boolean; path: boolean },
) {
  if (frame.path) {
    states.set(key, "path");
  } else if (!frame.peek && states.get(key) !== "path") {
    states.set(key, "visited");
  }
}

/**
 * Fold frames[from..to) onto an existing state IN PLACE, reporting which
 * dimensions moved so a caller can rebuild only what changed. This is the
 * incremental core: playback applies just the new frames each tick instead of
 * re-folding the whole prefix every time (which was quadratic over a run).
 */
export function applyFrames(
  state: VisualState,
  frames: Frame[],
  from: number,
  to: number,
  directed = false,
): { nodesChanged: boolean; edgesChanged: boolean } {
  let nodesChanged = false;
  let edgesChanged = false;
  const end = Math.min(to, frames.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const frame = frames[i];
    switch (frame.kind) {
      case "node":
        state.currentNode = frame.id;
        promote(state.nodeStates, frame.id, frame);
        nodesChanged = true;
        break;
      case "edge": {
        const key = edgeKey(frame.source, frame.target, directed);
        state.currentEdge = key;
        promote(state.edgeStates, key, frame);
        edgesChanged = true;
        break;
      }
      case "clear":
        state.currentNode = null;
        state.currentEdge = null;
        nodesChanged = true;
        edgesChanged = true;
        break;
    }
  }
  return { nodesChanged, edgesChanged };
}

/** Fold frames[0..count) into a fresh visual state (full recompute). */
export function computeVisualState(
  frames: Frame[],
  count: number,
  directed = false,
): VisualState {
  const state = emptyVisualState();
  applyFrames(state, frames, 0, count, directed);
  return state;
}

export type SourcePos = { file: string; line: number };

/**
 * Source position a single frame carries, if any. Frames without a file
 * (single-file graph editor runs) default to the editor buffer.
 */
export function framePos(frame: Frame): SourcePos | null {
  if (frame.kind === "clear") return null;
  if (typeof frame.line !== "number") return null;
  return { file: frame.file ?? "algorithm.py", line: frame.line };
}

/**
 * Source position the algorithm was at after frames[0..count) — drives the
 * code panels' highlights. Walks backwards to the nearest frame carrying line
 * info; a clear frame (end of run) clears the highlight.
 */
export function currentPosAt(frames: Frame[], count: number): SourcePos | null {
  for (let i = Math.min(count, frames.length) - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame.kind === "clear") return null;
    const pos = framePos(frame);
    if (pos) return pos;
  }
  return null;
}

/** Runtime validation of frames coming out of the worker. */
export function isFrame(value: unknown): value is Frame {
  if (typeof value !== "object" || value === null) return false;
  const frame = value as Record<string, unknown>;
  if (frame.kind === "clear") return true;
  if (frame.kind === "line") return typeof frame.line === "number";
  if (frame.kind === "node") return typeof frame.id === "string";
  if (frame.kind === "edge") {
    return typeof frame.source === "string" && typeof frame.target === "string";
  }
  return false;
}
