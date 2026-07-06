import {
  getGraphPreviews,
  SUMMARY_SELECT,
  toGraphSummary,
  type GraphPreview,
  type GraphSummary,
  type SummaryRow,
} from "@/lib/data/graphs";
import {
  POST_SELECT,
  toPost,
  type Post,
  type PostAuthor,
  type PostJoinRow,
} from "@/lib/data/posts";
import { createClient } from "@/lib/supabase/server";

/** A public graph with its author resolved (no FK to profiles, see below). */
export type ExploreGraph = GraphSummary & { author: PostAuthor };

export type Explore = {
  user: { id: string } | null;
  /** samples + community graphs together; cards carry the Sample badge */
  graphs: ExploreGraph[];
  /** community write-ups, published_at desc */
  posts: Post[];
  /** the official lessons, oldest first — they read as Lesson 1, 2, … */
  lessons: Post[];
  /** forks per post id (security-definer aggregate; private forks count) */
  forkCounts: Record<string, number>;
  previews: Record<string, GraphPreview>;
};

/** Everything public, for the explore hub. Anonymous-safe. */
export async function getExplore(): Promise<Explore> {
  const supabase = await createClient();

  const [{ data: userData }, graphsRes, postsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("graphs")
      .select(SUMMARY_SELECT)
      .eq("is_public", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("is_published", true)
      .order("published_at", { ascending: false }),
  ]);
  if (graphsRes.error) throw graphsRes.error;
  if (postsRes.error) throw postsRes.error;

  const user = userData.user;
  const userId = user?.id ?? null;
  const bareGraphs = ((graphsRes.data as SummaryRow[] | null) ?? []).map(
    (row) => toGraphSummary(row, userId),
  );
  const allPosts = ((postsRes.data as PostJoinRow[] | null) ?? []).map((row) =>
    toPost(row, userId),
  );

  // graphs.owner_id has no FK to profiles, so PostgREST can't embed the
  // author — resolve the profiles in a second query instead
  const ownerIds = [
    ...new Set(
      bareGraphs
        .map((graph) => graph.owner_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const [profilesRes, forksRes, previews] = await Promise.all([
    ownerIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
    allPosts.length
      ? supabase.rpc("post_fork_counts", {
          p_post_ids: allPosts.map((post) => post.id),
        })
      : Promise.resolve({ data: [], error: null }),
    getGraphPreviews(
      supabase,
      bareGraphs.map((graph) => graph.id),
    ),
  ]);
  if (profilesRes.error) throw profilesRes.error;

  const profileById = new Map(
    (profilesRes.data ?? []).map((profile) => [
      profile.id,
      {
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
    ]),
  );
  const graphs: ExploreGraph[] = bareGraphs.map((graph) => ({
    ...graph,
    author:
      graph.is_sample || !graph.owner_id
        ? null
        : (profileById.get(graph.owner_id) ?? null),
  }));

  // a missing RPC (migration not applied yet) degrades to zero counts
  const forkCounts: Record<string, number> = {};
  for (const row of forksRes.data ?? []) {
    forkCounts[row.post_id] = row.fork_count;
  }

  return {
    user,
    graphs,
    posts: allPosts.filter((post) => !post.is_official),
    lessons: allPosts
      .filter((post) => post.is_official)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    forkCounts,
    previews,
  };
}
