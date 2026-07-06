import { beforeEach, describe, expect, it } from "vitest";

import type { Frame } from "@/lib/editor/frames";
import { useEditorStore } from "@/lib/editor/store";

const line = (n: number): Frame => ({ kind: "line", line: n });
const node = (id: string): Frame => ({
  kind: "node",
  id,
  peek: false,
  path: false,
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("client-minted ids are uuids", () => {
  // regression: node/edge id columns are uuid, so freshId() must mint uuids —
  // otherwise saving a locally-edited graph fails casting "n..." to uuid.
  it("addNodeAt and connect produce uuid ids", () => {
    const store = useEditorStore.getState();
    store.init("g1", "graph", "", false, { nodes: [], edges: [] });
    store.addNodeAt(0, 0);
    store.addNodeAt(100, 0);
    const [a, b] = useEditorStore.getState().nodes;
    store.connect(a.id, b.id);

    const doc = useEditorStore.getState().toDoc();
    expect(doc.nodes[0].id).toMatch(UUID_RE);
    expect(doc.nodes[1].id).toMatch(UUID_RE);
    expect(doc.edges[0].id).toMatch(UUID_RE);
  });
});

describe("selection and removal", () => {
  function threeNodeGraph() {
    const store = useEditorStore.getState();
    store.init("g", "graph", "", false, { nodes: [], edges: [] });
    store.addNodeAt(0, 0);
    store.addNodeAt(100, 0);
    store.addNodeAt(200, 0);
    const [a, b, c] = useEditorStore.getState().nodes;
    store.connect(a.id, b.id);
    store.connect(b.id, c.id);
    useEditorStore.setState({ dirty: false }); // building dirtied it
    return { a, b, c };
  }

  it("selectOnly selects exactly one node and never dirties", () => {
    const { a, b } = threeNodeGraph();
    useEditorStore.getState().selectOnly({ nodeId: a.id });
    let nodes = useEditorStore.getState().nodes;
    expect(nodes.find((n) => n.id === a.id)?.selected).toBe(true);
    expect(nodes.filter((n) => n.selected)).toHaveLength(1);

    // switching selection deselects the previous one
    useEditorStore.getState().selectOnly({ nodeId: b.id });
    nodes = useEditorStore.getState().nodes;
    expect(nodes.find((n) => n.id === a.id)?.selected).toBe(false);
    expect(nodes.find((n) => n.id === b.id)?.selected).toBe(true);
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  it("selecting an edge deselects nodes, and null clears everything", () => {
    const { a } = threeNodeGraph();
    const [e0] = useEditorStore.getState().edges;
    useEditorStore.getState().selectOnly({ nodeId: a.id });
    useEditorStore.getState().selectOnly({ edgeId: e0.id });
    expect(useEditorStore.getState().nodes.some((n) => n.selected)).toBe(false);
    expect(
      useEditorStore.getState().edges.find((e) => e.id === e0.id)?.selected,
    ).toBe(true);

    useEditorStore.getState().selectOnly(null);
    expect(useEditorStore.getState().nodes.some((n) => n.selected)).toBe(false);
    expect(useEditorStore.getState().edges.some((e) => e.selected)).toBe(false);
  });

  it("removeElements cascades to incident edges and dirties", () => {
    const { b } = threeNodeGraph();
    useEditorStore.getState().removeElements([b.id], []);
    const state = useEditorStore.getState();
    expect(state.nodes.some((n) => n.id === b.id)).toBe(false);
    expect(state.nodes).toHaveLength(2);
    // b touched both edges → both removed, no orphans left behind
    expect(state.edges).toHaveLength(0);
    expect(state.dirty).toBe(true);
  });

  it("removeElements can drop a lone edge without touching nodes", () => {
    threeNodeGraph();
    const [e0] = useEditorStore.getState().edges;
    useEditorStore.getState().removeElements([], [e0.id]);
    const state = useEditorStore.getState();
    expect(state.edges.some((e) => e.id === e0.id)).toBe(false);
    expect(state.edges).toHaveLength(1);
    expect(state.nodes).toHaveLength(3);
  });
});

describe("event-granularity stepping", () => {
  // positions after a graph event: 1 (node), 4 (node), 6 (clear)
  const frames: Frame[] = [
    node("n1"),
    line(2),
    line(3),
    node("n2"),
    line(4),
    { kind: "clear" },
  ];

  beforeEach(() => {
    useEditorStore.setState({
      frames,
      playhead: 0,
      playing: false,
      status: "ready",
      speed: 60,
      stepGranularity: "events",
    });
  });

  it("stepForward stops just after the next graph event", () => {
    const step = () => useEditorStore.getState().stepForward();
    step();
    expect(useEditorStore.getState().playhead).toBe(1);
    step();
    expect(useEditorStore.getState().playhead).toBe(4);
    step();
    expect(useEditorStore.getState().playhead).toBe(6);
    step(); // clamped at the end
    expect(useEditorStore.getState().playhead).toBe(6);
  });

  it("stepBack returns to the previous graph event", () => {
    useEditorStore.setState({ playhead: 6 });
    const step = () => useEditorStore.getState().stepBack();
    step();
    expect(useEditorStore.getState().playhead).toBe(4);
    step();
    expect(useEditorStore.getState().playhead).toBe(1);
    step();
    expect(useEditorStore.getState().playhead).toBe(0);
  });

  it("stepBack from between events (scrubbed there) lands on the previous one", () => {
    useEditorStore.setState({ playhead: 3 });
    useEditorStore.getState().stepBack();
    expect(useEditorStore.getState().playhead).toBe(1);
  });

  it("stepping pauses playback", () => {
    useEditorStore.setState({ playing: true });
    useEditorStore.getState().stepForward();
    expect(useEditorStore.getState().playing).toBe(false);
  });

  it("tick absorbs line frames so code and canvas advance together", () => {
    useEditorStore.setState({ playing: true });
    const tick = () => useEditorStore.getState().tick();
    tick();
    expect(useEditorStore.getState().playhead).toBe(1);
    expect(useEditorStore.getState().playing).toBe(true);
    tick();
    expect(useEditorStore.getState().playhead).toBe(4);
    tick();
    expect(useEditorStore.getState().playhead).toBe(6);
    expect(useEditorStore.getState().playing).toBe(false); // reached the end
  });

  it("takes bigger strides at the rabbit end of the speed slider", () => {
    useEditorStore.setState({ playing: true, speed: 100 });
    useEditorStore.getState().tick();
    // max-speed stride swallows all three graph events in a single tick
    expect(useEditorStore.getState().playhead).toBe(6);
    expect(useEditorStore.getState().playing).toBe(false);
  });

  it("keeps playing at the frontier while frames are still streaming", () => {
    useEditorStore.setState({
      frames: [node("n1")],
      playing: true,
      status: "running",
    });
    const tick = () => useEditorStore.getState().tick();
    tick(); // caught up with the stream — waits, doesn't stop
    expect(useEditorStore.getState().playhead).toBe(1);
    expect(useEditorStore.getState().playing).toBe(true);

    useEditorStore.getState().pushFrames([line(2), node("n2")]);
    tick();
    expect(useEditorStore.getState().playhead).toBe(3);
    expect(useEditorStore.getState().playing).toBe(true);

    useEditorStore.setState({ status: "ready" }); // run finished
    tick();
    expect(useEditorStore.getState().playing).toBe(false);
  });
});

describe("statement-granularity stepping", () => {
  const frames: Frame[] = [
    node("n1"),
    line(2),
    line(3),
    node("n2"),
    line(4),
    { kind: "clear" },
  ];

  beforeEach(() => {
    useEditorStore.setState({
      frames,
      playhead: 0,
      playing: false,
      status: "ready",
      speed: 60,
      stepGranularity: "statements",
    });
  });

  it("stepForward stops on every frame, including line frames", () => {
    const step = () => useEditorStore.getState().stepForward();
    for (let expected = 1; expected <= 6; expected++) {
      step();
      expect(useEditorStore.getState().playhead).toBe(expected);
    }
    step(); // clamped at the end
    expect(useEditorStore.getState().playhead).toBe(6);
  });

  it("stepBack retreats one frame at a time", () => {
    useEditorStore.setState({ playhead: 6 });
    const step = () => useEditorStore.getState().stepBack();
    for (let expected = 5; expected >= 0; expected--) {
      step();
      expect(useEditorStore.getState().playhead).toBe(expected);
    }
  });

  it("tick advances exactly one frame per call", () => {
    useEditorStore.setState({ playing: true });
    const tick = () => useEditorStore.getState().tick();
    for (let expected = 1; expected <= 6; expected++) {
      tick();
      expect(useEditorStore.getState().playhead).toBe(expected);
    }
    expect(useEditorStore.getState().playing).toBe(false); // reached the end
  });

  it("never strides, even at the rabbit end of the speed slider", () => {
    useEditorStore.setState({ playing: true, speed: 100 });
    useEditorStore.getState().tick();
    // contrast with events mode, where a max-speed tick jumps to 6 — no
    // statement is ever skipped in this mode
    expect(useEditorStore.getState().playhead).toBe(1);
  });

  it("keeps playing at the frontier while frames are still streaming", () => {
    useEditorStore.setState({
      frames: [node("n1")],
      playing: true,
      status: "running",
    });
    const tick = () => useEditorStore.getState().tick();
    tick(); // caught up with the stream — waits, doesn't stop
    expect(useEditorStore.getState().playhead).toBe(1);
    expect(useEditorStore.getState().playing).toBe(true);

    useEditorStore.getState().pushFrames([line(2)]);
    tick();
    expect(useEditorStore.getState().playhead).toBe(2);
    expect(useEditorStore.getState().playing).toBe(true);

    useEditorStore.setState({ status: "ready" }); // run finished
    tick();
    expect(useEditorStore.getState().playing).toBe(false);
  });

  it("stepping pauses playback", () => {
    useEditorStore.setState({ playing: true });
    useEditorStore.getState().stepForward();
    expect(useEditorStore.getState().playing).toBe(false);
  });
});

describe("playback breakpoints", () => {
  // node frames stamped with a line, like the tracer produces. Line 3 runs
  // twice (a loop body revisited) with a graph event in between.
  const stamped = (id: string, l: number): Frame => ({
    kind: "node",
    id,
    peek: false,
    path: false,
    line: l,
    file: "main.py",
  });
  const lineIn = (n: number): Frame => ({
    kind: "line",
    line: n,
    file: "main.py",
  });
  const frames: Frame[] = [
    lineIn(2), // 1
    stamped("n1", 2), // 2
    lineIn(3), // 3  <- breakpoint arrival
    stamped("n2", 3), // 4  (still line 3 — same arrival)
    lineIn(4), // 5
    lineIn(3), // 6  <- second arrival at line 3
    { kind: "clear" }, // 7
  ];

  beforeEach(() => {
    useEditorStore.setState({
      frames,
      playhead: 0,
      playing: false,
      status: "ready",
      speed: 60,
      stepGranularity: "events",
      breakpoints: { "main.py": [3] },
      pauseOnBreakpoint: false,
    });
  });

  it("toggleBreakpoint adds and removes lines per file", () => {
    useEditorStore.getState().toggleBreakpoint("main.py", 7);
    expect(useEditorStore.getState().breakpoints["main.py"]).toEqual([3, 7]);
    useEditorStore.getState().toggleBreakpoint("main.py", 3);
    expect(useEditorStore.getState().breakpoints["main.py"]).toEqual([7]);
    useEditorStore.getState().toggleBreakpoint("helpers.py", 1);
    expect(useEditorStore.getState().breakpoints["helpers.py"]).toEqual([1]);
  });

  it("defaults to filtering, not pausing", () => {
    expect(useEditorStore.getInitialState().pauseOnBreakpoint).toBe(false);
  });

  describe("filter mode (default): breakpoints are the animation's steps", () => {
    it("tick walks breakpoint-to-breakpoint without stopping", () => {
      useEditorStore.setState({ playing: true });
      const tick = () => useEditorStore.getState().tick();
      tick(); // first arrival at line 3
      expect(useEditorStore.getState().playhead).toBe(3);
      expect(useEditorStore.getState().playing).toBe(true); // no pause
      tick(); // re-arrival at line 3 (frame 6), same-line frame 4 absorbed
      expect(useEditorStore.getState().playhead).toBe(6);
      expect(useEditorStore.getState().playing).toBe(true);
      tick(); // no arrivals left — consumes the tail and ends
      expect(useEditorStore.getState().playhead).toBe(frames.length);
      expect(useEditorStore.getState().playing).toBe(false);
    });

    it("never strides past a breakpoint, even at max speed", () => {
      useEditorStore.setState({ playing: true, speed: 100 });
      useEditorStore.getState().tick();
      expect(useEditorStore.getState().playhead).toBe(3);
      expect(useEditorStore.getState().playing).toBe(true);
    });

    it("step buttons move between breakpoint stops", () => {
      const state = () => useEditorStore.getState();
      state().stepForward();
      expect(state().playhead).toBe(3);
      state().stepForward();
      expect(state().playhead).toBe(6);
      state().stepBack();
      expect(state().playhead).toBe(3);
      state().stepBack();
      expect(state().playhead).toBe(0);
    });

    it("breakpoints only in files that never run fast-forward the whole run", () => {
      useEditorStore.setState({
        breakpoints: { "helpers.py": [3] },
        playing: true,
      });
      useEditorStore.getState().tick();
      // no arrival ever matches, so the single tick consumes everything
      expect(useEditorStore.getState().playhead).toBe(frames.length);
      expect(useEditorStore.getState().playing).toBe(false);
    });
  });

  describe("pause mode: breakpoints stop playback", () => {
    beforeEach(() => {
      useEditorStore.setState({ pauseOnBreakpoint: true });
    });

    it("tick pauses on arrival at a breakpoint line, mid-stride", () => {
      useEditorStore.setState({ playing: true, speed: 100 }); // max stride
      useEditorStore.getState().tick();
      // stops ON the line-3 frame instead of swallowing the whole run
      expect(useEditorStore.getState().playhead).toBe(3);
      expect(useEditorStore.getState().playing).toBe(false);
    });

    it("resuming from a breakpoint doesn't re-trip on the same line", () => {
      useEditorStore.setState({ playhead: 3, playing: true });
      useEditorStore.getState().tick();
      // frame 4 is still line 3 (same arrival) — absorbed, not a second pause
      expect(useEditorStore.getState().playhead).toBe(4);
      expect(useEditorStore.getState().playing).toBe(true);
    });

    it("pauses again on a fresh arrival at the same line", () => {
      useEditorStore.setState({ playhead: 4, playing: true, speed: 100 });
      useEditorStore.getState().tick();
      // leaves line 3 (frame 5, line 4), then re-arrives at line 3 (frame 6)
      expect(useEditorStore.getState().playhead).toBe(6);
      expect(useEditorStore.getState().playing).toBe(false);
    });

    it("step buttons keep their granularity stepping", () => {
      useEditorStore.getState().stepForward();
      // events granularity: next graph event (frame 2), not the breakpoint
      expect(useEditorStore.getState().playhead).toBe(2);
    });

    it("breakpoints in other files don't pause playback", () => {
      useEditorStore.setState({
        breakpoints: { "helpers.py": [3] },
        playing: true,
        speed: 100,
      });
      useEditorStore.getState().tick();
      expect(useEditorStore.getState().playhead).toBe(frames.length);
    });
  });

  it("runToBreakpoint jumps to the next arrival and pauses", () => {
    useEditorStore.setState({ playing: true });
    useEditorStore.getState().runToBreakpoint();
    expect(useEditorStore.getState().playhead).toBe(3);
    expect(useEditorStore.getState().playing).toBe(false);
    useEditorStore.getState().runToBreakpoint();
    expect(useEditorStore.getState().playhead).toBe(6);
  });

  it("runToBreakpoint with no breakpoints runs to the end", () => {
    useEditorStore.setState({ breakpoints: {} });
    useEditorStore.getState().runToBreakpoint();
    expect(useEditorStore.getState().playhead).toBe(frames.length);
    expect(useEditorStore.getState().playing).toBe(false);
  });
});

describe("code follow preferences", () => {
  it("default to on and are settable", () => {
    expect(useEditorStore.getInitialState().showExecutingLine).toBe(true);
    expect(useEditorStore.getInitialState().followExecutingLine).toBe(true);
    useEditorStore.getState().setShowExecutingLine(false);
    useEditorStore.getState().setFollowExecutingLine(false);
    expect(useEditorStore.getState().showExecutingLine).toBe(false);
    expect(useEditorStore.getState().followExecutingLine).toBe(false);
    useEditorStore.setState({
      showExecutingLine: true,
      followExecutingLine: true,
    });
  });

  it("init clears breakpoints but keeps the sticky preferences", () => {
    useEditorStore.setState({
      breakpoints: { "main.py": [3] },
      stepGranularity: "statements",
    });
    useEditorStore
      .getState()
      .init("g", "graph", "", false, { nodes: [], edges: [] });
    expect(useEditorStore.getState().breakpoints).toEqual({});
    expect(useEditorStore.getState().stepGranularity).toBe("statements");
    useEditorStore.setState({ stepGranularity: "events" });
  });
});

describe("step granularity preference", () => {
  it("defaults to events", () => {
    expect(useEditorStore.getInitialState().stepGranularity).toBe("events");
  });

  it("setStepGranularity flips the mode without touching the playhead", () => {
    useEditorStore.setState({
      playhead: 3,
      playing: true,
      stepGranularity: "statements",
    });
    useEditorStore.getState().setStepGranularity("events");
    const state = useEditorStore.getState();
    expect(state.stepGranularity).toBe("events");
    expect(state.playhead).toBe(3);
    expect(state.playing).toBe(true);
  });

  it("survives resetPlayback and startRun (sticky like speed)", () => {
    useEditorStore.setState({ stepGranularity: "statements" });
    useEditorStore.getState().resetPlayback();
    useEditorStore.getState().startRun();
    expect(useEditorStore.getState().stepGranularity).toBe("statements");
  });
});
