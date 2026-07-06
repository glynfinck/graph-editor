import { describe, expect, it } from "vitest";

import {
  ATTR_VALUE_STR_MAX,
  MAX_ATTRS_PER_ELEMENT,
  graphDocSchema,
} from "@/lib/graph/types";

// A minimal valid node/edge; pass `attributes` to exercise the bag. `undefined`
// omits the key entirely (to test the default), any other value is passed through.
const node = (attributes?: unknown) => ({
  id: "n1",
  name: "A",
  x: 0,
  y: 0,
  ...(attributes === undefined ? {} : { attributes }),
});
const edge = (attributes?: unknown) => ({
  id: "e1",
  source: "n1",
  target: "n2",
  ...(attributes === undefined ? {} : { attributes }),
});
const parse = (doc: unknown) => graphDocSchema.safeParse(doc);

describe("graphDocSchema attributes", () => {
  it("defaults to an empty bag when omitted, on nodes and edges", () => {
    const doc = graphDocSchema.parse({ nodes: [node()], edges: [edge()] });
    expect(doc.nodes[0].attributes).toEqual({});
    expect(doc.edges[0].attributes).toEqual({});
  });

  it("accepts string / number / boolean scalars and preserves their types", () => {
    const doc = graphDocSchema.parse({
      nodes: [node({ capacity: 10, color: "red", active: true })],
      edges: [edge({ cost: 2.5 })],
    });
    expect(doc.nodes[0].attributes).toEqual({
      capacity: 10,
      color: "red",
      active: true,
    });
    expect(typeof doc.nodes[0].attributes.capacity).toBe("number");
    expect(typeof doc.nodes[0].attributes.active).toBe("boolean");
    expect(doc.edges[0].attributes).toEqual({ cost: 2.5 });
  });

  it("rejects non-scalar values (null, nested object, array)", () => {
    for (const bad of [null, { nested: 1 }, [1, 2]]) {
      expect(parse({ nodes: [node({ bad })], edges: [] }).success).toBe(false);
    }
  });

  it("caps a single string value's length", () => {
    const atMax = "z".repeat(ATTR_VALUE_STR_MAX);
    expect(parse({ nodes: [node({ note: atMax })], edges: [] }).success).toBe(
      true,
    );
    const tooLong = "z".repeat(ATTR_VALUE_STR_MAX + 1);
    expect(parse({ nodes: [node({ note: tooLong })], edges: [] }).success).toBe(
      false,
    );
  });

  it("caps the number of attributes per element", () => {
    const bag = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, i]));
    expect(
      parse({ nodes: [node(bag(MAX_ATTRS_PER_ELEMENT))], edges: [] }).success,
    ).toBe(true);
    expect(
      parse({ nodes: [node(bag(MAX_ATTRS_PER_ELEMENT + 1))], edges: [] })
        .success,
    ).toBe(false);
  });

  it("rejects a blank attribute key", () => {
    expect(parse({ nodes: [node({ "": 1 })], edges: [] }).success).toBe(false);
  });
});
