import {
  getGraphPreviews,
  type GraphPreview,
  type GraphSummary,
} from "@/lib/data/graphs";
import type { Post, PostAuthor } from "@/lib/data/posts";
import type { ExploreSort } from "@/lib/list-filters";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/** A public graph with its author resolved (no FK to profiles, see below). */
export type ExploreGraph = GraphSummary & { author: PostAuthor };

export type ExploreType = "all" | "lessons" | "posts" | "graphs";

// per-page sizes for the single-type views
export const LESSONS_PAGE = 10;
export const POSTS_PAGE = 10;
export const GRAPHS_PAGE = 12;
// the combined view previews each type; "View all" opens the type filter
export const LESSONS_CAP = 4;
export const POSTS_CAP = 5;
export const GRAPHS_CAP = 9;

export type ExplorePageParams = {
  type: ExploreType;
  q: string;
  tag?: string;
  sort: ExploreSort;
  page: number;
};

export type Explore = {
  user: { id: string } | null;
  /** every official lesson, oldest first — they read as Lesson 1, 2, … */
  lessons: Post[];
  /** the requested page (or combined-view cap) of community posts */
  posts: Post[];
  /** total community posts under the current q/tag filters */
  postsTotal: number;
  /** the requested page, clamped to the last one when it ran past the end */
  postsPage: number;
  graphs: ExploreGraph[];
  graphsTotal: number;
  graphsPage: number;
  /** forks per post id (security-definer aggregate; private forks count) */
  forkCounts: Record<string, number>;
  previews: Record<string, GraphPreview>;
  /** public content per tag slug, for the topic chips */
  tagCounts: Record<string, number>;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ExplorePostRow =
  Database["public"]["Functions"]["explore_posts"]["Returns"][number];
type ExploreGraphRow =
  Database["public"]["Functions"]["explore_graphs"]["Returns"][number];

// official lessons are few and need canonical numbering, so they load whole —
// with count embeds, not like rows, so the payload stays bounded
const LESSON_SELECT = "*, post_likes(count), post_comments(count)";
type LessonRow = Database["public"]["Tables"]["posts"]["Row"] & {
  post_likes: { count: number }[];
  post_comments: { count: number }[];
};

/**
 * One page of a paged explore RPC, clamped: a ?page= beyond the end lands on
 * the real last page (mirrors lib/list-filters.ts paginate).
 */
async function fetchRpcPage<
  Fn extends "explore_posts" | "explore_graphs",
  Row extends { total_count: number },
>(
  supabase: Supabase,
  fn: Fn,
  args: { p_q: string | undefined; p_tag: string | undefined; p_sort: string },
  limit: number,
  requestedPage: number,
): Promise<{ rows: Row[]; total: number; page: number }> {
  const call = async (p_limit: number, p_offset: number) => {
    const { data, error } = await supabase.rpc(fn, {
      ...args,
      p_limit,
      p_offset,
    });
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  };

  let rows = await call(limit, (requestedPage - 1) * limit);
  if (rows.length > 0) {
    return { rows, total: rows[0].total_count, page: requestedPage };
  }
  if (requestedPage > 1) {
    // ran past the end — probe the total, then land on the last page
    const probe = await call(1, 0);
    const total = probe[0]?.total_count ?? 0;
    if (total > 0) {
      const lastPage = Math.ceil(total / limit);
      rows = await call(limit, (lastPage - 1) * limit);
      return { rows, total, page: lastPage };
    }
  }
  return { rows: [], total: 0, page: 1 };
}

/** total_count is pager metadata riding along on the rows — not row data. */
function omitTotal<T extends { total_count: number }>(
  row: T,
): Omit<T, "total_count"> {
  const { total_count, ...rest } = row;
  void total_count;
  return rest;
}

function countTags(rowSets: { tags: string[] }[][]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rows of rowSets) {
    for (const row of rows) {
      for (const slug of row.tags) {
        counts[slug] = (counts[slug] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/** One page of everything public, for the explore hub. Anonymous-safe. */
export async function getExplorePage({
  type,
  q,
  tag,
  sort,
  page,
}: ExplorePageParams): Promise<Explore> {
  const supabase = await createClient();

  // the off-view types still fetch one row: the type chips need each type's
  // filtered total, and total_count rides along on any non-empty page
  const postsLimit = type === "posts" ? POSTS_PAGE : type === "all" ? POSTS_CAP : 1;
  const graphsLimit =
    type === "graphs" ? GRAPHS_PAGE : type === "all" ? GRAPHS_CAP : 1;
  const rpcArgs = { p_q: q || undefined, p_tag: tag, p_sort: sort };

  const [{ data: userData }, postsPage, graphsPage, lessonsRes, postTagsRes, graphTagsRes] =
    await Promise.all([
      supabase.auth.getUser(),
      fetchRpcPage<"explore_posts", ExplorePostRow>(
        supabase,
        "explore_posts",
        rpcArgs,
        postsLimit,
        type === "posts" ? page : 1,
      ),
      fetchRpcPage<"explore_graphs", ExploreGraphRow>(
        supabase,
        "explore_graphs",
        rpcArgs,
        graphsLimit,
        type === "graphs" ? page : 1,
      ),
      supabase
        .from("posts")
        .select(LESSON_SELECT)
        .eq("is_official", true)
        .order("created_at", { ascending: true }),
      supabase.from("posts").select("tags").eq("is_published", true).eq("is_official", false),
      supabase.from("graphs").select("tags").eq("is_public", true),
    ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (postTagsRes.error) throw postTagsRes.error;
  if (graphTagsRes.error) throw graphTagsRes.error;

  const user = userData.user;
  const userId = user?.id ?? null;
  const lessonRows = (lessonsRes.data as LessonRow[] | null) ?? [];

  const postIds = [
    ...lessonRows.map((row) => row.id),
    ...postsPage.rows.map((row) => row.id),
  ];
  const graphIds = graphsPage.rows.map((row) => row.id);
  const ownerIds = [
    ...new Set(
      [
        ...postsPage.rows.map((row) => row.owner_id),
        ...graphsPage.rows.map((row) => row.owner_id),
      ].filter((id): id is string => !!id),
    ),
  ];

  const [profilesRes, forksRes, previews, myPostLikesRes, myGraphLikesRes] =
    await Promise.all([
      ownerIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
      postIds.length
        ? supabase.rpc("post_fork_counts", { p_post_ids: postIds })
        : Promise.resolve({ data: [], error: null }),
      getGraphPreviews(supabase, graphIds),
      userId && postIds.length
        ? supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", postIds)
        : Promise.resolve({ data: [], error: null }),
      userId && graphIds.length
        ? supabase
            .from("graph_likes")
            .select("graph_id")
            .eq("user_id", userId)
            .in("graph_id", graphIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (profilesRes.error) throw profilesRes.error;
  if (myPostLikesRes.error) throw myPostLikesRes.error;
  if (myGraphLikesRes.error) throw myGraphLikesRes.error;

  const profileById = new Map(
    (profilesRes.data ?? []).map((profile) => [
      profile.id,
      {
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
    ]),
  );
  const likedPostIds = new Set(
    (myPostLikesRes.data ?? []).map((row) => row.post_id),
  );
  const likedGraphIds = new Set(
    (myGraphLikesRes.data ?? []).map((row) => row.graph_id),
  );

  const lessons: Post[] = lessonRows.map(
    ({ post_likes, post_comments, ...row }) => ({
      ...row,
      author: null,
      likeCount: post_likes[0]?.count ?? 0,
      likedByMe: likedPostIds.has(row.id),
      commentCount: post_comments[0]?.count ?? 0,
    }),
  );

  const posts: Post[] = postsPage.rows.map(
    ({ like_count, comment_count, ...row }) => ({
      ...omitTotal(row),
      author: row.owner_id ? (profileById.get(row.owner_id) ?? null) : null,
      likeCount: like_count,
      likedByMe: likedPostIds.has(row.id),
      commentCount: comment_count,
    }),
  );

  const graphs: ExploreGraph[] = graphsPage.rows.map(
    ({ node_count, edge_count, like_count, ...row }) => ({
      ...omitTotal(row),
      nodeCount: node_count,
      edgeCount: edge_count,
      likeCount: like_count,
      likedByMe: likedGraphIds.has(row.id),
      author:
        row.is_sample || !row.owner_id
          ? null
          : (profileById.get(row.owner_id) ?? null),
    }),
  );

  // a missing RPC (migration not applied yet) degrades to zero counts
  const forkCounts: Record<string, number> = {};
  for (const row of forksRes.data ?? []) {
    forkCounts[row.post_id] = row.fork_count;
  }

  return {
    user,
    lessons,
    posts,
    postsTotal: postsPage.total,
    postsPage: postsPage.page,
    graphs,
    graphsTotal: graphsPage.total,
    graphsPage: graphsPage.page,
    forkCounts,
    previews,
    tagCounts: countTags([
      ((postTagsRes.data as { tags: string[] }[] | null) ?? []),
      ((graphTagsRes.data as { tags: string[] }[] | null) ?? []),
    ]),
  };
}
