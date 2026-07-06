import { expect, test, type Page } from "@playwright/test";

import { PYTHON_PRELUDE } from "../lib/editor/python";

/**
 * The `graph` Python API (lib/editor/python.ts), exercised against the REAL
 * Pyodide worker (public/python-worker.js) with hand-built graphs — the only
 * way to assert the networkx bridge's semantics (weights, direction, positions,
 * attributes) on controlled inputs. Boots Pyodide + networkx once, then runs
 * each case in a fresh namespace, asserting on the script's stdout.
 *
 * Needs the webServer (serves /python-worker.js) and network egress for the
 * Pyodide + networkx CDN download.
 */

type GraphMsg = { out: string; error: string | null };
type RunGraph = (graph: unknown, code: string) => Promise<GraphMsg>;
type AttrBag = Record<string, string | number | boolean>;

// mirror the payload shape use-python-runner sends the worker
const node = (
  name: string,
  opts: { x?: number; y?: number; attributes?: AttrBag } = {},
) => ({
  id: name,
  name,
  x: opts.x ?? 0,
  y: opts.y ?? 0,
  attributes: opts.attributes ?? {},
});
const edge = (
  source: string,
  target: string,
  opts: { weight?: number | null; attributes?: AttrBag } = {},
) => ({
  source,
  target,
  weight: opts.weight ?? null,
  attributes: opts.attributes ?? {},
});
const graph = (
  directed: boolean,
  nodes: ReturnType<typeof node>[],
  edges: ReturnType<typeof edge>[],
) => ({ directed, nodes, edges });

test.describe.serial("graph Python API", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // minimal same-origin document so we can spawn the app's real worker
    await page.route("**/__e2e_pyodide", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>e2e</title>",
      }),
    );
    await page.goto("/__e2e_pyodide");
    // boot Pyodide once and expose a per-graph run() helper on window
    await page.evaluate(async (prelude) => {
      const worker = new Worker("/python-worker.js");
      await new Promise<void>((resolve, reject) => {
        const onBoot = (event: MessageEvent) => {
          const data = event.data as { type?: string; message?: string };
          if (data.type === "ready") {
            worker.removeEventListener("message", onBoot);
            resolve();
          } else if (data.type === "boot-error") {
            reject(new Error(data.message));
          }
        };
        worker.addEventListener("message", onBoot);
      });
      let rid = 0;
      const run: RunGraph = (g, code) =>
        new Promise((resolve) => {
          const runId = ++rid;
          let out = "";
          let error: string | null = null;
          const onMsg = (event: MessageEvent) => {
            const m = event.data as {
              type?: string;
              runId?: number;
              text?: string;
              message?: string;
            };
            if (m.runId !== runId) return; // ignores boot + other runs
            if (m.type === "stdout" || m.type === "stderr") out += m.text ?? "";
            else if (m.type === "error") {
              error = m.message ?? "error";
              worker.removeEventListener("message", onMsg);
              resolve({ out, error });
            } else if (m.type === "done") {
              worker.removeEventListener("message", onMsg);
              resolve({ out, error });
            }
            // "frames" messages are ignored
          };
          worker.addEventListener("message", onMsg);
          worker.postMessage({ runId, prelude, code, graph: g });
        });
      (window as unknown as { __runGraph: RunGraph }).__runGraph = run;
    }, PYTHON_PRELUDE);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  const run = (g: unknown, code: string): Promise<GraphMsg> =>
    page.evaluate(
      ([graphArg, codeArg]) =>
        (window as unknown as { __runGraph: RunGraph }).__runGraph(
          graphArg,
          codeArg as string,
        ),
      [g, code] as const,
    );

  test("edge weights: weighted, unweighted default, missing default", async () => {
    const g = graph(
      false,
      [node("A"), node("B"), node("C")],
      [edge("A", "B", { weight: 5 }), edge("B", "C")],
    );
    const { out, error } = await run(
      g,
      [
        'print("ab", graph.getWeight("A", "B"))',
        'print("bc", graph.getWeight("B", "C", default=1))',
        'print("ac", graph.getWeight("A", "C", default=99))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("ab 5");
    expect(out).toContain("bc 1"); // unweighted edge → default
    expect(out).toContain("ac 99"); // no edge → default
  });

  test("directed graph traverses successors only", async () => {
    const g = graph(
      true,
      [node("A"), node("B"), node("C")],
      [edge("A", "B"), edge("B", "C")],
    );
    const { out, error } = await run(
      g,
      [
        'print("directed", graph.directed)',
        'print("nbrsB", sorted(graph.getNeighbors("B")))',
        'print("hasAB", graph.hasEdge("A", "B"))',
        'print("hasBA", graph.hasEdge("B", "A"))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("directed True");
    expect(out).toContain("nbrsB ['C']"); // B→C only; A→B does NOT make A a nbr
    expect(out).toContain("hasAB True");
    expect(out).toContain("hasBA False");
  });

  test("undirected graph traverses both directions", async () => {
    const g = graph(
      false,
      [node("A"), node("B"), node("C")],
      [edge("A", "B"), edge("B", "C")],
    );
    const { out, error } = await run(
      g,
      [
        'print("directed", graph.directed)',
        'print("nbrsB", sorted(graph.getNeighbors("B")))',
        'print("hasBA", graph.hasEdge("B", "A"))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("directed False");
    expect(out).toContain("nbrsB ['A', 'C']");
    expect(out).toContain("hasBA True");
  });

  test("node positions come back as (x, y) floats", async () => {
    const g = graph(
      false,
      [node("A", { x: 10, y: 20 }), node("B", { x: 30, y: 40 })],
      [],
    );
    const { out, error } = await run(
      g,
      [
        'print("posA", graph.getPosition("A"))',
        'print("posB", graph.getPosition("B"))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("posA (10.0, 20.0)");
    expect(out).toContain("posB (30.0, 40.0)");
  });

  test("membership and node listing", async () => {
    const g = graph(false, [node("A"), node("B")], [edge("A", "B")]);
    const { out, error } = await run(
      g,
      [
        'print("hasA", graph.hasNode("A"))',
        'print("hasZ", graph.hasNode("Z"))',
        'print("nodes", sorted(graph.getNodes()))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("hasA True");
    expect(out).toContain("hasZ False");
    expect(out).toContain("nodes ['A', 'B']");
  });

  test("node attributes keep their types; reserved id wins; missing → default", async () => {
    const g = graph(
      false,
      [
        node("A", {
          // `id` is reserved — a user attribute named id must NOT override it
          attributes: { capacity: 10, color: "red", active: true, id: "HIJACK" },
        }),
        node("B"),
      ],
      [edge("A", "B")],
    );
    const { out, error } = await run(
      g,
      [
        'print("cap", graph.getAttr("A", "capacity"))',
        'print("captype", type(graph.getAttr("A", "capacity")).__name__)',
        'print("color", graph.getAttr("A", "color"))',
        'print("active", graph.getAttr("A", "active"))',
        'print("id", graph.getAttr("A", "id"))',
        'print("missing", graph.getAttr("A", "nope", default="none"))',
        'print("Bcap", graph.getAttr("B", "capacity", default=0))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("cap 10");
    expect(out).toContain("captype int");
    expect(out).toContain("color red");
    expect(out).toContain("active True");
    expect(out).toContain("id A"); // canonical id, not "HIJACK"
    expect(out).toContain("missing none");
    expect(out).toContain("Bcap 0");
  });

  test("edge attributes keep their types; reserved weight wins", async () => {
    const g = graph(
      false,
      [node("A"), node("B")],
      [
        edge("A", "B", {
          weight: 3,
          // `weight` is reserved — the canonical edge weight must win
          attributes: { cost: 2.5, oneway: false, weight: 999 },
        }),
      ],
    );
    const { out, error } = await run(
      g,
      [
        'print("cost", graph.getEdgeAttr("A", "B", "cost"))',
        'print("oneway", graph.getEdgeAttr("A", "B", "oneway"))',
        'print("weight", graph.getWeight("A", "B"))',
        'print("missing", graph.getEdgeAttr("A", "B", "nope", default="none"))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("cost 2.5");
    expect(out).toContain("oneway False");
    expect(out).toContain("weight 3"); // canonical weight, not 999
    expect(out).toContain("missing none");
  });

  test("getNodes(data=True) / getEdges(data=True) expose attributes", async () => {
    const g = graph(
      false,
      [node("A", { attributes: { capacity: 10 } }), node("B")],
      [edge("A", "B", { attributes: { cost: 2.5 } })],
    );
    const { out, error } = await run(
      g,
      [
        "nd = dict(graph.getNodes(data=True))",
        'print("Acap", nd["A"].get("capacity"))',
        'print("Aid", nd["A"].get("id"))',
        "ed = {frozenset((u, v)): d for u, v, d in graph.getEdges(data=True)}",
        'print("Ecost", ed[frozenset(("A", "B"))].get("cost"))',
      ].join("\n"),
    );
    expect(error).toBeNull();
    expect(out).toContain("Acap 10");
    expect(out).toContain("Aid A");
    expect(out).toContain("Ecost 2.5");
  });
});
