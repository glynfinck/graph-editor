import {
  getGraphPreviews,
  type GraphPreview,
  type GraphSummary,
} from "@/lib/data/graphs";
import type { Post } from "@/lib/data/posts";
import type { Project } from "@/lib/data/projects";
import type { LibrarySort } from "@/lib/list-filters";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/helpers";

export type LibraryTab = "all" | "projects" | "graphs" | "posts";
export type LibraryView = "grid" | "table";

export const RECENT_LIMIT = 3;
// per-page sizes for the paginated single-tab views and the table
export const GRID_PAGE = 12;
export const POSTS_PAGE = 10;
export const TABLE_PAGE = 20;
// the combined view shows a preview of each type; "View all" opens the tab
export const SECTION_CAP = 6;
export const POSTS_CAP = 4;

export type LibraryPageParams = {
  tab: LibraryTab;
  view: LibraryView;
  sort: LibrarySort;
  q: string;
  page: number;
};

export type RecentItem = {
  type: "project" | "graph" | "post";
  id: string;
  name: string;
  updated: string;
  isPublished?: boolean;
};

export type Library = {
  user: { id: string } | null;
  /** page/section slices under the current filters, with filtered totals */
  projects: Project[];
  projectsTotal: number;
  graphs: GraphSummary[];
  graphsTotal: number;
  posts: Post[];
  postsTotal: number;
  /** requested page, clamped to the active tab's last page */
  page: number;
  /** thumbnails, keyed by graph id — covers graphs AND projects' active graphs */
  previews: Record<string, GraphPreview>;
  /** titles of posts that projects were forked from, keyed by post id */
  forkSources: Record<string, string>;
  /** the most recently touched things across all types (grid all-tab rail) */
  recent: RecentItem[];
};

const EMPTY_LIBRARY: Library = {
  user: null,
  projects: [],
  projectsTotal: 0,
  graphs: [],
  graphsTotal: 0,
  posts: [],
  postsTotal: 0,
  page: 1,
  previews: {},
  forkSources: {},
  recent: [],
};

type Supabase = Awaited<ReturnType<typeof createClient>>;
type GraphSummaryRow = Tables<"graphs"> & {
  node_count: number;
  edge_count: number;
  like_count: number;
};
type PostSummaryRow = Tables<"posts"> & {
  like_count: number;
  comment_count: number;
};

/**
 * PostgREST .or() filter matching the query in any of the fields. Characters
 * that are syntax inside or() are dropped from the needle rather than
 * escaped — a search for them was never useful, and this can't break the
 * filter expression.
 */
function searchOr(fields: string[], q: string): string | null {
  const needle = q.replace(/[\\,()"*]/g, " ").trim();
  if (!needle) return null;
  return fields.map((field) => `${field}.ilike.*${needle}*`).join(",");
}

/** Order columns for a library sort — likes fall back to recency when the
 * type has no likes (projects), matching the old stable in-memory sort. */
function orderKeys(
  sort: LibrarySort,
  nameCol: string,
  likesCol: string | null,
): [string, boolean][] {
  switch (sort) {
    case "name":
      return [[nameCol, true]];
    case "created":
      return [["created_at", false]];
    case "likes":
      return likesCol
        ? [
            [likesCol, false],
            ["updated_at", false],
          ]
        : [["updated_at", false]];
    default:
      return [["updated_at", false]];
  }
}

type PageSlice<T> = { items: T[]; total: number };

async function fetchProjects(
  supabase: Supabase,
  userId: string,
  { sort, q }: { sort: LibrarySort; q: string },
  range: [number, number],
): Promise<PageSlice<Project>> {
  let query = supabase
    .from("projects")
    .select("*", { count: "exact" })
    .eq("owner_id", userId);
  const search = searchOr(["name", "description"], q);
  if (search) query = query.or(search);
  for (const [col, asc] of orderKeys(sort, "name", null)) {
    query = query.order(col, { ascending: asc });
  }
  const { data, count, error } = await query.range(range[0], range[1]);
  if (error) throw error;
  return { items: (data ?? []) as Project[], total: count ?? 0 };
}

async function fetchGraphs(
  supabase: Supabase,
  userId: string,
  { sort, q }: { sort: LibrarySort; q: string },
  range: [number, number],
): Promise<PageSlice<GraphSummaryRow>> {
  let query = supabase
    .from("graph_summaries")
    .select("*", { count: "exact" })
    .eq("owner_id", userId);
  const search = searchOr(["name", "description"], q);
  if (search) query = query.or(search);
  for (const [col, asc] of orderKeys(sort, "name", "like_count")) {
    query = query.order(col, { ascending: asc });
  }
  const { data, count, error } = await query.range(range[0], range[1]);
  if (error) throw error;
  return {
    items: ((data ?? []) as unknown as GraphSummaryRow[]),
    total: count ?? 0,
  };
}

async function fetchPosts(
  supabase: Supabase,
  userId: string,
  { sort, q }: { sort: LibrarySort; q: string },
  range: [number, number],
): Promise<PageSlice<PostSummaryRow>> {
  let query = supabase
    .from("post_summaries")
    .select("*", { count: "exact" })
    .eq("owner_id", userId);
  const search = searchOr(["title", "body"], q);
  if (search) query = query.or(search);
  for (const [col, asc] of orderKeys(sort, "title", "like_count")) {
    query = query.order(col, { ascending: asc });
  }
  const { data, count, error } = await query.range(range[0], range[1]);
  if (error) throw error;
  return {
    items: ((data ?? []) as unknown as PostSummaryRow[]),
    total: count ?? 0,
  };
}

/** Filtered total only, for the inactive tabs' chips. */
async function countOnly(
  supabase: Supabase,
  table: "projects" | "graphs" | "posts",
  userId: string,
  q: string,
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  const search = searchOr(
    table === "posts" ? ["title", "body"] : ["name", "description"],
    q,
  );
  if (search) query = query.or(search);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * One page of the caller's library. The explicit owner filters are
 * load-bearing on every query: RLS also exposes public rows (explore/posts
 * are built on that), which must not appear as "yours".
 */
export async function getLibraryPage(
  params: LibraryPageParams,
): Promise<Library> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_LIBRARY;

  const { tab, view, sort, q } = params;
  const isTable = view === "table";
  const filters = { sort, q };

  // the combined tab previews each type (the table interleaves them, so it
  // fetches everything up to the requested page); a single tab pages itself
  // in the database and the other types just report their filtered totals
  const activeLimit = isTable
    ? TABLE_PAGE
    : tab === "posts"
      ? POSTS_PAGE
      : GRID_PAGE;
  let page = params.page;

  async function fetchTab<T>(
    which: LibraryTab,
    fetcher: (range: [number, number]) => Promise<PageSlice<T>>,
    counter: () => Promise<number>,
    allCap: number,
  ): Promise<PageSlice<T>> {
    if (tab === "all") {
      const cap = isTable ? page * TABLE_PAGE : allCap;
      return fetcher([0, cap - 1]);
    }
    if (tab !== which) {
      return counter().then((total) => ({ items: [], total }));
    }
    const slice = await fetcher([(page - 1) * activeLimit, page * activeLimit - 1]);
    if (slice.items.length === 0 && page > 1 && slice.total > 0) {
      // ?page= ran past the end — land on the real last page
      page = Math.max(1, Math.ceil(slice.total / activeLimit));
      return fetcher([(page - 1) * activeLimit, page * activeLimit - 1]);
    }
    return slice;
  }

  const showRecent = tab === "all" && view === "grid" && !q;

  // kicked off alongside the tab queries; awaited after so they run together
  const recentPromise = showRecent
    ? Promise.all([
        supabase
          .from("projects")
          .select("id, name, updated_at")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(RECENT_LIMIT),
        supabase
          .from("graphs")
          .select("id, name, updated_at")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(RECENT_LIMIT),
        supabase
          .from("posts")
          .select("id, title, updated_at, is_published")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(RECENT_LIMIT),
      ])
    : null;

  const [projectsSlice, graphsSlice, postsSlice, profileRes] =
    await Promise.all([
      fetchTab(
        "projects",
        (range) => fetchProjects(supabase, user.id, filters, range),
        () => countOnly(supabase, "projects", user.id, q),
        SECTION_CAP,
      ),
      fetchTab(
        "graphs",
        (range) => fetchGraphs(supabase, user.id, filters, range),
        () => countOnly(supabase, "graphs", user.id, q),
        SECTION_CAP,
      ),
      fetchTab(
        "posts",
        (range) => fetchPosts(supabase, user.id, filters, range),
        () => countOnly(supabase, "posts", user.id, q),
        POSTS_CAP,
      ),
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
  if (profileRes.error) throw profileRes.error;

  const recentRes = recentPromise ? await recentPromise : null;
  for (const res of recentRes ?? []) {
    if (res.error) throw res.error;
  }

  const graphIds = graphsSlice.items.map((graph) => graph.id);
  const postIds = postsSlice.items.map((post) => post.id);
  const forkedPostIds = [
    ...new Set(
      projectsSlice.items
        .map((project) => project.forked_from_post_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const [previews, forkSourcesRes, myGraphLikesRes, myPostLikesRes] =
    await Promise.all([
      getGraphPreviews(supabase, [
        ...graphIds,
        ...projectsSlice.items
          .map((project) => project.active_graph_id)
          .filter((id): id is string => !!id),
      ]),
      forkedPostIds.length
        ? supabase.from("posts").select("id, title").in("id", forkedPostIds)
        : Promise.resolve({ data: [], error: null }),
      graphIds.length
        ? supabase
            .from("graph_likes")
            .select("graph_id")
            .eq("user_id", user.id)
            .in("graph_id", graphIds)
        : Promise.resolve({ data: [], error: null }),
      postIds.length
        ? supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", postIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (forkSourcesRes.error) throw forkSourcesRes.error;
  if (myGraphLikesRes.error) throw myGraphLikesRes.error;
  if (myPostLikesRes.error) throw myPostLikesRes.error;

  const forkSources: Record<string, string> = {};
  for (const post of forkSourcesRes.data ?? []) {
    forkSources[post.id] = post.title;
  }
  const likedGraphIds = new Set(
    (myGraphLikesRes.data ?? []).map((row) => row.graph_id),
  );
  const likedPostIds = new Set(
    (myPostLikesRes.data ?? []).map((row) => row.post_id),
  );
  const author = profileRes.data
    ? {
        display_name: profileRes.data.display_name,
        avatar_url: profileRes.data.avatar_url,
      }
    : null;

  const graphs: GraphSummary[] = graphsSlice.items.map(
    ({ node_count, edge_count, like_count, ...row }) => ({
      ...row,
      nodeCount: node_count,
      edgeCount: edge_count,
      likeCount: like_count,
      likedByMe: likedGraphIds.has(row.id),
    }),
  );
  const posts: Post[] = postsSlice.items.map(
    ({ like_count, comment_count, ...row }) => ({
      ...row,
      author,
      likeCount: like_count,
      likedByMe: likedPostIds.has(row.id),
      commentCount: comment_count,
    }),
  );

  const recent: RecentItem[] = recentRes
    ? [
        ...(recentRes[0].data ?? []).map(
          (row): RecentItem => ({
            type: "project",
            id: row.id,
            name: row.name,
            updated: row.updated_at,
          }),
        ),
        ...(recentRes[1].data ?? []).map(
          (row): RecentItem => ({
            type: "graph",
            id: row.id,
            name: row.name,
            updated: row.updated_at,
          }),
        ),
        ...(recentRes[2].data ?? []).map(
          (row): RecentItem => ({
            type: "post",
            id: row.id,
            name: row.title,
            updated: row.updated_at,
            isPublished: row.is_published,
          }),
        ),
      ]
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .slice(0, RECENT_LIMIT)
    : [];

  return {
    user,
    projects: projectsSlice.items,
    projectsTotal: projectsSlice.total,
    graphs,
    graphsTotal: graphsSlice.total,
    posts,
    postsTotal: postsSlice.total,
    page,
    previews,
    forkSources,
    recent,
  };
}
