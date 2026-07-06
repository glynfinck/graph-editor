import { createClient } from "@/lib/supabase/server";
import type { GraphDoc } from "@/lib/graph/types";
import type { Tables } from "@/types/helpers";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

type GraphRow = Tables<"graphs">;

/** A graph row with its full canvas document (nodes + edges paged in). */
export type Graph = GraphRow & {
  doc: GraphDoc;
  likeCount: number;
  likedByMe: boolean;
};

/** A graph row for lists/cards — counts only, no node/edge payload pulled. */
export type GraphSummary = GraphRow & {
  nodeCount: number;
  edgeCount: number;
  likeCount: number;
  likedByMe: boolean;
};

// Requests are row-capped (supabase max_rows), so a big graph's nodes/edges are
// fetched in bounded pages and concatenated rather than one giant embed.
const PAGE = 1000;

async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** A graph's full document, paged in (nodes and edges concurrently). */
export async function getGraphDoc(
  supabase: Supabase,
  graphId: string,
): Promise<GraphDoc> {
  const [nodes, edges] = await Promise.all([
    fetchAllRows<GraphDoc["nodes"][number]>((from, to) =>
      supabase
        .from("graph_nodes")
        .select("id, name, x, y")
        .eq("graph_id", graphId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<GraphDoc["edges"][number]>((from, to) =>
      supabase
        .from("graph_edges")
        .select("id, source, target, weight, name")
        .eq("graph_id", graphId)
        .order("id")
        .range(from, to),
    ),
  ]);
  return { nodes, edges };
}

export const SUMMARY_SELECT =
  "*, graph_nodes(count), graph_edges(count), graph_likes(user_id)";

export type SummaryRow = GraphRow & {
  graph_nodes: { count: number }[];
  graph_edges: { count: number }[];
  graph_likes: { user_id: string }[];
};

export function toGraphSummary(
  { graph_nodes, graph_edges, graph_likes, ...row }: SummaryRow,
  userId: string | null,
): GraphSummary {
  return {
    ...row,
    nodeCount: graph_nodes[0]?.count ?? 0,
    edgeCount: graph_edges[0]?.count ?? 0,
    likeCount: graph_likes.length,
    likedByMe: !!userId && graph_likes.some((like) => like.user_id === userId),
  };
}

/**
 * Card thumbnails: a bounded, evenly-spread sample of node positions and
 * edges, keyed by graph id. Sampling happens in the graph_previews SQL
 * function — a plain embed can only take the FIRST n rows, and nodes insert
 * in drawing order, so big graphs rendered as one stretched corner of the
 * canvas instead of their real shape.
 */
export type GraphPreview = {
  directed: boolean;
  nodes: { id: string; x: number; y: number }[];
  edges: { source: string; target: string }[];
};

export async function getGraphPreviews(
  supabase: Supabase,
  graphIds: string[],
): Promise<Record<string, GraphPreview>> {
  const ids = [...new Set(graphIds)];
  if (!ids.length) return {};

  // a missing RPC (migration not applied yet) degrades to no thumbnails —
  // the cards fall back to their placeholder icon instead of a 500
  const { data, error } = await supabase.rpc("graph_previews", {
    p_graph_ids: ids,
  });
  if (error) return {};

  const previews: Record<string, GraphPreview> = {};
  for (const row of data ?? []) {
    previews[row.graph_id] = {
      directed: row.directed,
      nodes: row.nodes as GraphPreview["nodes"],
      edges: row.edges as GraphPreview["edges"],
    };
  }
  return previews;
}

/**
 * Everything the caller is allowed to see (RLS: own graphs + public ones),
 * split into own and samples for the explorer page. Counts only — cards don't
 * need the node/edge payload.
 */
export async function getVisibleGraphs() {
  const supabase = await createClient();

  const [{ data: userData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("graphs")
      .select(SUMMARY_SELECT)
      .order("is_sample", { ascending: true })
      .order("updated_at", { ascending: false }),
  ]);
  if (error) throw error;

  const user = userData.user;
  const graphs = ((data as SummaryRow[] | null) ?? []).map((row) =>
    toGraphSummary(row, user?.id ?? null),
  );
  return {
    user,
    mine: graphs.filter((g) => user && g.owner_id === user.id),
    samples: graphs.filter((g) => g.is_sample),
  };
}

/**
 * Public graphs for the explore gallery: the seeded samples plus anything
 * the community has published. Anonymous-safe — RLS allows public reads.
 */
export async function getPublicGraphs() {
  const supabase = await createClient();

  const [{ data: userData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("graphs")
      .select(SUMMARY_SELECT)
      .eq("is_public", true)
      .order("updated_at", { ascending: false }),
  ]);
  if (error) throw error;

  const user = userData.user;
  const graphs = ((data as SummaryRow[] | null) ?? []).map((row) =>
    toGraphSummary(row, user?.id ?? null),
  );
  return {
    user,
    samples: graphs.filter((g) => g.is_sample),
    // highest rated first; the query already breaks ties by recency
    community: graphs
      .filter((g) => !g.is_sample)
      .sort((a, b) => b.likeCount - a.likeCount),
  };
}

/** Single graph by id — null when it doesn't exist or isn't visible (RLS). */
export async function getGraph(id: string) {
  const supabase = await createClient();

  // fetch the doc concurrently with the row/auth — it only needs the id (a
  // param). On a not-found / RLS-hidden graph the doc reads come back empty
  // (RLS covers graph_nodes/edges too) and are simply discarded below.
  const [{ data: userData }, { data: row, error }, doc] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("graphs")
      .select("*, graph_likes(user_id)")
      .eq("id", id)
      .maybeSingle(),
    getGraphDoc(supabase, id),
  ]);
  if (error) throw error;
  if (!row) return { user: userData.user, graph: null };

  const userId = userData.user?.id ?? null;
  const { graph_likes, ...graphRow } = row as GraphRow & {
    graph_likes: { user_id: string }[];
  };
  const graph: Graph = {
    ...graphRow,
    doc,
    likeCount: graph_likes.length,
    likedByMe: !!userId && graph_likes.some((like) => like.user_id === userId),
  };
  return { user: userData.user, graph };
}
