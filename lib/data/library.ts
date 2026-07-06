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
  type PostJoinRow,
} from "@/lib/data/posts";
import type { Project } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";

export type Library = {
  user: { id: string } | null;
  projects: Project[];
  graphs: GraphSummary[];
  posts: Post[];
  /** thumbnails, keyed by graph id — covers graphs AND projects' active graphs */
  previews: Record<string, GraphPreview>;
  /** titles of posts that projects were forked from, keyed by post id */
  forkSources: Record<string, string>;
};

/**
 * Everything the caller owns, for the library page. The explicit owner
 * filters are load-bearing on every table: RLS also exposes public rows
 * (explore/posts are built on that), which must not appear as "yours".
 */
export async function getLibrary(): Promise<Library> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      projects: [],
      graphs: [],
      posts: [],
      previews: {},
      forkSources: {},
    };
  }

  const [projectsRes, graphsRes, postsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("graphs")
      .select(SUMMARY_SELECT)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (graphsRes.error) throw graphsRes.error;
  if (postsRes.error) throw postsRes.error;

  const projects = projectsRes.data ?? [];
  const graphs = ((graphsRes.data as SummaryRow[] | null) ?? []).map((row) =>
    toGraphSummary(row, user.id),
  );
  const posts = ((postsRes.data as PostJoinRow[] | null) ?? []).map((row) =>
    toPost(row, user.id),
  );

  // fork lineage: the source posts' titles for "Forked from …" credits.
  // RLS may hide a since-unpublished source — those cards degrade to "Forked".
  const forkedPostIds = [
    ...new Set(
      projects
        .map((project) => project.forked_from_post_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const [previews, forkSourcesRes] = await Promise.all([
    getGraphPreviews(supabase, [
      ...graphs.map((graph) => graph.id),
      ...projects
        .map((project) => project.active_graph_id)
        .filter((id): id is string => !!id),
    ]),
    forkedPostIds.length
      ? supabase.from("posts").select("id, title").in("id", forkedPostIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (forkSourcesRes.error) throw forkSourcesRes.error;

  const forkSources: Record<string, string> = {};
  for (const post of forkSourcesRes.data ?? []) {
    forkSources[post.id] = post.title;
  }

  return { user, projects, graphs, posts, previews, forkSources };
}
