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
