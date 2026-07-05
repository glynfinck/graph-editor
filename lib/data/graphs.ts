import { createClient } from "@/lib/supabase/server";
import type { GraphDoc } from "@/lib/graph/types";
import type { Tables } from "@/types/helpers";

type GraphRow = Tables<"graphs">;
type NodeRow = Tables<"graph_nodes">;
type EdgeRow = Tables<"graph_edges">;

/** A graph row with its canvas document assembled from the node/edge tables. */
export type Graph = GraphRow & {
  doc: GraphDoc;
  likeCount: number;
  likedByMe: boolean;
};

export const GRAPH_SELECT =
  "*, graph_nodes(*), graph_edges(*), graph_likes(user_id)";

export type GraphJoinRow = GraphRow & {
  graph_nodes: NodeRow[];
  graph_edges: EdgeRow[];
  graph_likes: { user_id: string }[];
};

export function toGraph(
  { graph_nodes, graph_edges, graph_likes, ...row }: GraphJoinRow,
  userId: string | null = null,
): Graph {
  return {
    ...row,
    doc: {
      nodes: graph_nodes.map((n) => ({
        id: n.id,
        name: n.name,
        x: n.x,
        y: n.y,
      })),
      edges: graph_edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        weight: e.weight,
        name: e.name,
      })),
    },
    likeCount: graph_likes.length,
    likedByMe: !!userId && graph_likes.some((like) => like.user_id === userId),
  };
}

/**
 * Everything the caller is allowed to see (RLS: own graphs + public ones),
 * split into own and samples for the explorer page.
 */
export async function getVisibleGraphs() {
  const supabase = await createClient();

  const [{ data: userData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("graphs")
      .select(GRAPH_SELECT)
      .order("is_sample", { ascending: true })
      .order("updated_at", { ascending: false }),
  ]);
  if (error) throw error;

  const user = userData.user;
  const graphs = ((data as GraphJoinRow[] | null) ?? []).map((row) =>
    toGraph(row, user?.id ?? null),
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
      .select(GRAPH_SELECT)
      .eq("is_public", true)
      .order("updated_at", { ascending: false }),
  ]);
  if (error) throw error;

  const user = userData.user;
  const graphs = ((data as GraphJoinRow[] | null) ?? []).map((row) =>
    toGraph(row, user?.id ?? null),
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

  const [{ data: userData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("graphs").select(GRAPH_SELECT).eq("id", id).maybeSingle(),
  ]);
  if (error) throw error;

  return {
    user: userData.user,
    graph: data
      ? toGraph(data as GraphJoinRow, userData.user?.id ?? null)
      : null,
  };
}
