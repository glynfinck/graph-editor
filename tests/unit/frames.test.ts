import { describe, expect, it } from "vitest";

import {
  applyFrames,
  computeVisualState,
  currentPosAt,
  edgeKey,
  emptyVisualState,
  isFrame,
  type Frame,
} from "@/lib/editor/frames";

describe("edgeKey", () => {
  it("is direction-independent when undirected", () => {
    expect(edgeKey("n1", "n2")).toBe(edgeKey("n2", "n1"));
  });

  it("keeps source→target order when directed", () => {
    expect(edgeKey("n1", "n2", true)).toBe("n1|n2");
    expect(edgeKey("n1", "n2", true)).not.toBe(edgeKey("n2", "n1", true));
  });
});

describe("computeVisualState", () => {
  const frames: Frame[] = [
    { kind: "node", id: "n1", peek: false, path: false },
    { kind: "edge", source: "n1", target: "n2", peek: false, path: false },
    { kind: "node", id: "n2", peek: false, path: false },
    { kind: "node", id: "n1", peek: true, path: false },
    { kind: "node", id: "n2", peek: false, path: true },
    { kind: "clear" },
  ];

  it("marks non-peek visits as visited", () => {
    const state = computeVisualState(frames, 2);
    expect(state.nodeStates.get("n1")).toBe("visited");
    expect(state.edgeStates.get(edgeKey("n1", "n2"))).toBe("visited");
  });

  it("peek moves the cursor without marking visited", () => {
    const state = computeVisualState(
      [{ kind: "node", id: "n9", peek: true, path: false }],
      1,
    );
    expect(state.currentNode).toBe("n9");
    expect(state.nodeStates.has("n9")).toBe(false);
  });

  it("path wins over visited and is never demoted", () => {
    const state = computeVisualState(frames, 5);
    expect(state.nodeStates.get("n2")).toBe("path");
    const later = computeVisualState(
      [
        ...frames,
        { kind: "node", id: "n2", peek: false, path: false },
      ],
      7,
    );
    expect(later.nodeStates.get("n2")).toBe("path");
  });

  it("clear resets the cursor but keeps visited state", () => {
    const state = computeVisualState(frames, frames.length);
    expect(state.currentNode).toBeNull();
    expect(state.currentEdge).toBeNull();
    expect(state.nodeStates.get("n1")).toBe("visited");
  });

  it("playhead 0 is the empty state", () => {
    const state = computeVisualState(frames, 0);
    expect(state.nodeStates.size).toBe(0);
    expect(state.currentNode).toBeNull();
  });

  it("line frames don't touch the canvas state", () => {
    const state = computeVisualState(
      [
        { kind: "node", id: "n1", peek: false, path: false },
        { kind: "line", line: 7 },
      ],
      2,
    );
    expect(state.currentNode).toBe("n1");
    expect(state.nodeStates.get("n1")).toBe("visited");
  });
});

describe("applyFrames (incremental folding)", () => {
  const frames: Frame[] = [
    { kind: "node", id: "n1", peek: false, path: false },
    { kind: "edge", source: "n1", target: "n2", peek: false, path: false },
    { kind: "node", id: "n2", peek: false, path: false },
    { kind: "line", line: 4 },
    { kind: "node", id: "n2", peek: false, path: true },
    { kind: "clear" },
  ];

  it("stepping one frame at a time matches a full recompute", () => {
    const inc = emptyVisualState();
    for (let count = 1; count <= frames.length; count++) {
      applyFrames(inc, frames, count - 1, count);
      const full = computeVisualState(frames, count);
      expect(inc.nodeStates).toEqual(full.nodeStates);
      expect(inc.edgeStates).toEqual(full.edgeStates);
      expect(inc.currentNode).toBe(full.currentNode);
      expect(inc.currentEdge).toBe(full.currentEdge);
    }
  });

  it("reports which dimensions moved (so only those rebuild)", () => {
    const s = emptyVisualState();
    expect(applyFrames(s, [frames[0]], 0, 1)).toEqual({
      nodesChanged: true,
      edgesChanged: false,
    });
    expect(applyFrames(s, [frames[1]], 0, 1)).toEqual({
      nodesChanged: false,
      edgesChanged: true,
    });
    expect(applyFrames(s, [{ kind: "line", line: 9 }], 0, 1)).toEqual({
      nodesChanged: false,
      edgesChanged: false,
    });
    expect(applyFrames(s, [{ kind: "clear" }], 0, 1)).toEqual({
      nodesChanged: true,
      edgesChanged: true,
    });
  });
});

describe("currentPosAt", () => {
  const frames: Frame[] = [
    { kind: "line", line: 2 },
    { kind: "node", id: "n1", peek: false, path: false, line: 3 },
    { kind: "node", id: "n2", peek: false, path: false }, // no line info
    { kind: "line", line: 5, file: "helpers.py" },
    { kind: "clear" },
  ];

  it("returns the nearest source position at or before the playhead", () => {
    expect(currentPosAt(frames, 1)).toEqual({ file: "algorithm.py", line: 2 });
    expect(currentPosAt(frames, 2)).toEqual({ file: "algorithm.py", line: 3 });
    expect(currentPosAt(frames, 4)).toEqual({ file: "helpers.py", line: 5 });
  });

  it("keeps the last known position across frames without line info", () => {
    expect(currentPosAt(frames, 3)).toEqual({ file: "algorithm.py", line: 3 });
  });

  it("is null at playhead 0 and after a clear frame", () => {
    expect(currentPosAt(frames, 0)).toBeNull();
    expect(currentPosAt(frames, frames.length)).toBeNull();
  });
});

describe("isFrame", () => {
  it("accepts valid frames and rejects junk", () => {
    expect(isFrame({ kind: "node", id: "n1", peek: false, path: false })).toBe(
      true,
    );
    expect(isFrame({ kind: "edge", source: "a", target: "b" })).toBe(true);
    expect(isFrame({ kind: "clear" })).toBe(true);
    expect(isFrame({ kind: "line", line: 3 })).toBe(true);
    expect(isFrame({ kind: "node" })).toBe(false);
    expect(isFrame({ kind: "line" })).toBe(false);
    expect(isFrame(null)).toBe(false);
    expect(isFrame("frame")).toBe(false);
  });
});
