import {
  getGraphDoc,
  SUMMARY_SELECT,
  toGraphSummary,
  type GraphSummary,
  type SummaryRow,
} from "@/lib/data/graphs";
import type { GraphDoc } from "@/lib/graph/types";
import { extractEmbedRefs, firstPythonFence } from "@/lib/posts/embeds";
import { STARTER_MAIN_PY } from "@/lib/projects/types";
import { createClient } from "@/lib/supabase/server";

/**
 * The anonymous "demo" workspace: one ephemeral project seeded from the four
 * official lesson posts (BFS, DFS, Dijkstra, A*). Everything is read from
 * public/sample content (anon RLS allows it) and assembled in memory — the
 * client never persists it. Mirrors createProjectFromPost's post→(code + graph)
 * seed, but for all four lessons at once.
 */

// synthetic, never written — just labels the in-memory project store
export const DEMO_PROJECT_ID = "00000000-0000-0000-0002-000000000000";

const DEMO_NAME = "Algorithms demo";
const DEMO_DESCRIPTION =
  "Try BFS, DFS, Dijkstra and A* — edit the code and the graph, run it, and watch it play. Nothing here is saved.";

// official lesson posts, in file-tree order. BFS leads so the friendly default
// pair (bfs.py + "A binary tree") is what opens first.
const DEMO_LESSONS: { postId: string; file: string }[] = [
  { postId: "00000000-0000-0000-0001-000000000002", file: "bfs.py" },
  { postId: "00000000-0000-0000-0001-000000000001", file: "dfs.py" },
  { postId: "00000000-0000-0000-0001-000000000003", file: "dijkstra.py" },
  { postId: "00000000-0000-0000-0001-000000000004", file: "astar.py" },
];

export type DemoWorkspace = {
  project: {
    id: string;
    name: string;
    description: string;
    active_graph_id: string | null;
  };
  files: { path: string; content: string }[];
  graphs: GraphSummary[];
  pinnedGraphIds: string[];
  /** graph id -> full document, so demo mode never calls loadGraphDoc */
  demoGraphDocs: Record<string, GraphDoc>;
  openPath: string | null;
};

function blankFallback(): DemoWorkspace {
  return {
    project: {
      id: DEMO_PROJECT_ID,
      name: DEMO_NAME,
      description: DEMO_DESCRIPTION,
      active_graph_id: null,
    },
    files: [{ path: "main.py", content: STARTER_MAIN_PY }],
    graphs: [],
    pinnedGraphIds: [],
    demoGraphDocs: {},
    openPath: "main.py",
  };
}

export async function getDemoWorkspace(): Promise<DemoWorkspace> {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("posts")
    .select("id, body")
    .eq("is_official", true)
    .eq("is_published", true);

  const bodyById = new Map(
    (posts ?? []).map((post) => [post.id, post.body] as const),
  );

  // resolve each lesson to its code + primary embedded graph id, keeping order
  const lessons = DEMO_LESSONS.flatMap(({ postId, file }) => {
    const body = bodyById.get(postId);
    if (!body) return [];
    const code = firstPythonFence(body);
    if (!code) return [];
    const graphId = extractEmbedRefs(body).graphIds[0] ?? null;
    return [{ file, code, graphId }];
  });

  if (!lessons.length) return blankFallback();

  // load summaries + full docs for every referenced graph (deduped, anon-safe)
  const graphIds = [
    ...new Set(
      lessons
        .map((lesson) => lesson.graphId)
        .filter((id): id is string => !!id),
    ),
  ];

  let graphs: GraphSummary[] = [];
  const demoGraphDocs: Record<string, GraphDoc> = {};
  if (graphIds.length) {
    const [summaryRes, docs] = await Promise.all([
      supabase.from("graphs").select(SUMMARY_SELECT).in("id", graphIds),
      Promise.all(graphIds.map((id) => getGraphDoc(supabase, id))),
    ]);
    graphs = ((summaryRes.data as SummaryRow[] | null) ?? []).map((row) =>
      toGraphSummary(row, null),
    );
    graphIds.forEach((id, index) => {
      demoGraphDocs[id] = docs[index];
    });
  }

  const visible = new Set(graphs.map((graph) => graph.id));
  const nameOf = (id: string | null) =>
    id ? (graphs.find((graph) => graph.id === id)?.name ?? null) : null;

  // one line pointing each file at its lesson's graph — the tracer keys on live
  // buffer line numbers, so a leading comment doesn't offset the highlight
  const files = lessons.map(({ file, code, graphId }) => {
    const name = nameOf(graphId);
    const hint = name
      ? `# Recommended test graph: “${name}” — pick it in the top-right selector.\n\n`
      : "";
    return { path: file, content: hint + code };
  });

  const pinnedGraphIds = [
    ...new Set(
      lessons
        .map((lesson) => lesson.graphId)
        .filter((id): id is string => !!id && visible.has(id)),
    ),
  ];

  const first = lessons[0];
  const activeGraphId =
    first.graphId && visible.has(first.graphId)
      ? first.graphId
      : (pinnedGraphIds[0] ?? null);

  return {
    project: {
      id: DEMO_PROJECT_ID,
      name: DEMO_NAME,
      description: DEMO_DESCRIPTION,
      active_graph_id: activeGraphId,
    },
    files,
    graphs,
    pinnedGraphIds,
    demoGraphDocs,
    openPath: first.file,
  };
}
