import { describe, expect, it } from "vitest";

import { useEditorStore } from "@/lib/editor/store";

// Build a fresh 2-node, 1-edge graph and clear the dirty flag that setup sets.
// The store is a singleton, so each test rebuilds via init() (no auto-reset).
function twoNodeGraph() {
  const store = useEditorStore.getState();
  store.init("g", "graph", "", false, { nodes: [], edges: [] });
  store.addNodeAt(0, 0);
  store.addNodeAt(100, 0);
  const [a, b] = useEditorStore.getState().nodes;
  store.connect(a.id, b.id);
  useEditorStore.setState({ dirty: false });
  return { a, b, edgeId: useEditorStore.getState().edges[0].id };
}

const nodeAttrs = (id: string) =>
  useEditorStore.getState().nodes.find((n) => n.id === id)?.data.attributes;
const edgeAttrs = (id: string) =>
  useEditorStore.getState().edges.find((e) => e.id === id)?.data?.attributes;

describe("node attribute mutators", () => {
  it("setNodeAttr adds a value and marks the doc dirty", () => {
    const { a } = twoNodeGraph();
    useEditorStore.getState().setNodeAttr(a.id, "capacity", 10);
    expect(nodeAttrs(a.id)).toEqual({ capacity: 10 });
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("setNodeAttr updates one key without disturbing the others", () => {
    const { a } = twoNodeGraph();
    const store = useEditorStore.getState();
    store.setNodeAttr(a.id, "capacity", 10);
    store.setNodeAttr(a.id, "color", "red");
    store.setNodeAttr(a.id, "capacity", 20);
    expect(nodeAttrs(a.id)).toEqual({ capacity: 20, color: "red" });
  });

  it("removeNodeAttr deletes only the named key", () => {
    const { a } = twoNodeGraph();
    const store = useEditorStore.getState();
    store.setNodeAttr(a.id, "capacity", 10);
    store.setNodeAttr(a.id, "color", "red");
    store.removeNodeAttr(a.id, "capacity");
    expect(nodeAttrs(a.id)).toEqual({ color: "red" });
  });

  it("renameNodeAttr keeps the value and the key ordering", () => {
    const { a } = twoNodeGraph();
    const store = useEditorStore.getState();
    store.setNodeAttr(a.id, "a", 1);
    store.setNodeAttr(a.id, "b", 2);
    store.setNodeAttr(a.id, "c", 3);
    store.renameNodeAttr(a.id, "b", "beta");
    expect(Object.keys(nodeAttrs(a.id)!)).toEqual(["a", "beta", "c"]);
    expect(nodeAttrs(a.id)).toEqual({ a: 1, beta: 2, c: 3 });
  });

  it("renameNodeAttr is a no-op when the source key is absent", () => {
    const { a } = twoNodeGraph();
    const store = useEditorStore.getState();
    store.setNodeAttr(a.id, "a", 1);
    store.renameNodeAttr(a.id, "missing", "x");
    expect(nodeAttrs(a.id)).toEqual({ a: 1 });
  });
});

describe("edge attribute mutators", () => {
  it("set / rename / remove operate on the selected edge", () => {
    const { edgeId } = twoNodeGraph();
    const store = useEditorStore.getState();
    store.setEdgeAttr(edgeId, "cost", 2.5);
    store.setEdgeAttr(edgeId, "oneway", true);
    expect(edgeAttrs(edgeId)).toEqual({ cost: 2.5, oneway: true });

    store.renameEdgeAttr(edgeId, "cost", "distance");
    expect(edgeAttrs(edgeId)).toEqual({ distance: 2.5, oneway: true });

    store.removeEdgeAttr(edgeId, "oneway");
    expect(edgeAttrs(edgeId)).toEqual({ distance: 2.5 });
  });
});

describe("attributes round-trip through toDoc / init", () => {
  it("serializes attributes and restores them on reload", () => {
    const { a, edgeId } = twoNodeGraph();
    const store = useEditorStore.getState();
    store.setNodeAttr(a.id, "capacity", 10);
    store.setNodeAttr(a.id, "active", true);
    store.setEdgeAttr(edgeId, "cost", 2.5);

    const doc = useEditorStore.getState().toDoc();
    expect(doc.nodes.find((n) => n.id === a.id)?.attributes).toEqual({
      capacity: 10,
      active: true,
    });
    expect(doc.edges[0].attributes).toEqual({ cost: 2.5 });

    // reload from the serialized doc — attributes must survive (ids preserved)
    useEditorStore.getState().init("g", "graph", "", false, doc);
    expect(nodeAttrs(a.id)).toEqual({ capacity: 10, active: true });
    expect(edgeAttrs(edgeId)).toEqual({ cost: 2.5 });
  });

  it("defaults a bare graph's elements to an empty bag", () => {
    const { a, edgeId } = twoNodeGraph();
    const doc = useEditorStore.getState().toDoc();
    expect(doc.nodes.find((n) => n.id === a.id)?.attributes).toEqual({});
    expect(doc.edges.find((e) => e.id === edgeId)?.attributes).toEqual({});
  });
});
