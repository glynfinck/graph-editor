import {
  EMPTY_EMBEDS,
  extractEmbedRefs,
  type EmbedMap,
} from "@/lib/posts/embeds";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/helpers";

type PostRow = Tables<"posts">;

export type PostAuthor = {
  display_name: string | null;
  avatar_url: string | null;
} | null;

/** A post row with author, like and comment facts joined in. */
export type Post = PostRow & {
  author: PostAuthor;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
};

export type PostComment = Tables<"post_comments"> & {
  author: PostAuthor;
};

export const POST_SELECT =
  "*, profiles(display_name, avatar_url), post_likes(user_id), post_comments(count)";

export type PostJoinRow = PostRow & {
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  post_likes: { user_id: string }[];
  post_comments: { count: number }[];
};

export function toPost(row: PostJoinRow, userId: string | null = null): Post {
  const { profiles, post_likes, post_comments, ...post } = row;
  return {
    ...post,
    author: profiles,
    likeCount: post_likes.length,
    likedByMe: !!userId && post_likes.some((like) => like.user_id === userId),
    commentCount: post_comments[0]?.count ?? 0,
  };
}

/**
 * Everything the feed needs in one query — RLS returns published posts plus
 * the caller's own drafts, split and ordered here.
 */
export async function getPostsIndex() {
  const supabase = await createClient();

  const [{ data: userData }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("posts").select(POST_SELECT),
  ]);
  if (error) throw error;

  const user = userData.user;
  const posts = ((data as PostJoinRow[] | null) ?? []).map((row) =>
    toPost(row, user?.id ?? null),
  );
  return {
    user,
    published: posts
      .filter((post) => post.is_published)
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")),
    drafts: posts
      .filter((post) => !post.is_published)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  };
}

/**
 * Load the graphs/projects a post body links to, so qualifying links render
 * as cards. RLS silently drops what the reader can't see — those stay links.
 */
export async function getPostEmbeds(
  body: string,
  userId: string | null,
): Promise<EmbedMap> {
  const { graphIds, projectIds } = extractEmbedRefs(body);
  if (!graphIds.length && !projectIds.length) return EMPTY_EMBEDS;

  const supabase = await createClient();
  const [graphsRes, projectsRes] = await Promise.all([
    graphIds.length
      ? supabase
          .from("graphs")
          .select(
            "id, name, description, is_sample, graph_nodes(count), graph_edges(count), graph_likes(user_id)",
          )
          .in("id", graphIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase
          .from("projects")
          .select("id, name, description, project_files(count)")
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (graphsRes.error) throw graphsRes.error;
  if (projectsRes.error) throw projectsRes.error;

  const embeds: EmbedMap = { graphs: {}, projects: {} };
  for (const graph of graphsRes.data ?? []) {
    embeds.graphs[graph.id] = {
      id: graph.id,
      name: graph.name,
      description: graph.description,
      is_sample: graph.is_sample,
      nodeCount: graph.graph_nodes[0]?.count ?? 0,
      edgeCount: graph.graph_edges[0]?.count ?? 0,
      likeCount: graph.graph_likes.length,
      likedByMe:
        !!userId && graph.graph_likes.some((like) => like.user_id === userId),
    };
  }
  for (const project of projectsRes.data ?? []) {
    embeds.projects[project.id] = {
      id: project.id,
      name: project.name,
      description: project.description,
      fileCount: project.project_files[0]?.count ?? 0,
    };
  }
  return embeds;
}

/** A post's attached project with files, for the read-only viewer + fork. */
export async function getPostProject(projectId: string) {
  const supabase = await createClient();

  const [projectRes, filesRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, owner_id")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId)
      .order("path"),
  ]);
  if (projectRes.error) throw projectRes.error;
  if (filesRes.error) throw filesRes.error;

  if (!projectRes.data) return null;
  return { ...projectRes.data, files: filesRes.data ?? [] };
}

/** Single post with its comments — nulls when invisible (RLS). */
export async function getPost(id: string) {
  const supabase = await createClient();

  const [{ data: userData }, postRes, commentsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("posts").select(POST_SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("post_comments")
      .select("*, profiles(display_name, avatar_url)")
      .eq("post_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (postRes.error) throw postRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const user = userData.user;
  return {
    user,
    post: postRes.data
      ? toPost(postRes.data as PostJoinRow, user?.id ?? null)
      : null,
    comments: (commentsRes.data ?? []).map((row) => {
      const { profiles, ...comment } = row as Tables<"post_comments"> & {
        profiles: { display_name: string | null; avatar_url: string | null } | null;
      };
      return { ...comment, author: profiles } satisfies PostComment;
    }),
  };
}
