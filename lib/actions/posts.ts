"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { excerpt } from "@/lib/format";
import { copyGraph } from "@/lib/graph/copy";
import { extractEmbedRefs } from "@/lib/posts/embeds";
import { STARTER_MAIN_PY } from "@/lib/projects/types";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

// UUID shape only — official seeded posts use zero-prefixed ids that
// z.uuid()'s RFC version check rejects (same story as the sample graphs).
const uuidShape =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const postSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  body: z.string().max(50_000),
  projectId: z.string().regex(uuidShape).nullable(),
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user } as const;
}

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/**
 * FK checks ignore RLS, so ownership of an attached project is asserted
 * here (and again by a DB trigger — see the posts migration).
 */
async function assertOwnProject(
  supabase: Supabase,
  userId: string,
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "You can only attach your own projects.";
  return null;
}

export async function createPost(input: {
  title: string;
  body: string;
  projectId: string | null;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to write posts." };

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (parsed.data.projectId) {
    const ownError = await assertOwnProject(
      supabase,
      user.id,
      parsed.data.projectId,
    );
    if (ownError) return { ok: false, error: ownError };
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      owner_id: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      project_id: parsed.data.projectId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/posts");
  return { ok: true, id: data.id };
}

export async function savePost(
  id: string,
  input: { title: string; body: string; projectId: string | null },
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (parsed.data.projectId) {
    const ownError = await assertOwnProject(
      supabase,
      user.id,
      parsed.data.projectId,
    );
    if (ownError) return { ok: false, error: ownError };
  }

  // RLS restricts the update to the caller's own posts.
  const { data, error } = await supabase
    .from("posts")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      project_id: parsed.data.projectId,
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You can't edit this post." };

  revalidatePath("/posts");
  revalidatePath(`/posts/${id}`);
  return { ok: true, id };
}

/**
 * Publishing is one action: the post goes live, and everything a reader
 * needs follows it — the attached project becomes public, and so do the
 * project's pinned graphs (the ones the author owns). A pinned graph that
 * is neither public nor the author's blocks the publish with a clear error,
 * before anything is flipped.
 */
export async function publishPost(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id, project_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (postError) return { ok: false, error: postError.message };
  if (!post) return { ok: false, error: "You can't publish this post." };

  let pinnedToPublish: string[] = [];
  if (post.project_id) {
    const { data: pins, error: pinsError } = await supabase
      .from("project_graphs")
      .select("graph_id")
      .eq("project_id", post.project_id);
    if (pinsError) return { ok: false, error: pinsError.message };

    const pinIds = (pins ?? []).map((pin) => pin.graph_id);
    if (pinIds.length) {
      const { data: graphs, error: graphsError } = await supabase
        .from("graphs")
        .select("id, name, is_public, owner_id")
        .in("id", pinIds);
      if (graphsError) return { ok: false, error: graphsError.message };

      const blocker = (graphs ?? []).find(
        (graph) => !graph.is_public && graph.owner_id !== user.id,
      );
      if (blocker) {
        return {
          ok: false,
          error: `The project's graph “${blocker.name}” isn't yours to publish — copy it into your graphs first.`,
        };
      }
      pinnedToPublish = (graphs ?? [])
        .filter((graph) => !graph.is_public && graph.owner_id === user.id)
        .map((graph) => graph.id);
    }
  }

  // flip the supporting pieces first, the post itself last
  if (pinnedToPublish.length) {
    const { error } = await supabase
      .from("graphs")
      .update({ is_public: true })
      .in("id", pinnedToPublish);
    if (error) return { ok: false, error: error.message };
  }
  if (post.project_id) {
    const { data: updated, error } = await supabase
      .from("projects")
      .update({ is_public: true })
      .eq("id", post.project_id)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!updated?.length) {
      return { ok: false, error: "The attached project couldn't be published." };
    }
  }

  const { error: publishError } = await supabase
    .from("posts")
    .update({ is_published: true })
    .eq("id", id);
  if (publishError) return { ok: false, error: publishError.message };

  revalidatePath("/posts");
  revalidatePath(`/posts/${id}`);
  revalidatePath("/explore");
  return { ok: true, id };
}

/**
 * Back to draft. The attached project and graphs STAY public — forks and
 * copies may already exist; the UI copy says as much.
 */
export async function unpublishPost(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data, error } = await supabase
    .from("posts")
    .update({ is_published: false })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You can't edit this post." };

  revalidatePath("/posts");
  revalidatePath(`/posts/${id}`);
  return { ok: true, id };
}

export async function deletePost(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You can't delete this post." };

  revalidatePath("/posts");
  return { ok: true };
}

/** Like/unlike a post. Returns the caller's new liked state. */
export async function togglePostLike(
  id: string,
): Promise<ActionResult & { liked?: boolean }> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to like posts." };

  const { data: existing, error: readError } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };

  if (existing) {
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", id)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // RLS rejects likes on posts the caller can't see
    const { error } = await supabase
      .from("post_likes")
      .insert({ post_id: id, user_id: user.id });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/posts");
  revalidatePath(`/posts/${id}`);
  return { ok: true, id, liked: !existing };
}

/**
 * Turn a post without an attached project into a runnable one: the first
 * fenced Python block becomes main.py and the first visible embedded graph
 * becomes the pinned test graph. This is how the official lesson posts (and
 * any code+graph write-up) open in a project.
 */
export async function createProjectFromPost(
  postId: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to create projects." };
  if (!uuidShape.test(postId)) return { ok: false, error: "Invalid post." };

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("title, body")
    .eq("id", postId)
    .maybeSingle();
  if (postError) return { ok: false, error: postError.message };
  if (!post) return { ok: false, error: "Post not found." };

  const fence = /```python\s*\n([\s\S]*?)```/i.exec(post.body);
  const mainPy = fence?.[1].trim() ? fence[1] : STARTER_MAIN_PY;

  // first embedded graph the caller can actually see (in body order)
  const { graphIds } = extractEmbedRefs(post.body);
  let graphId: string | null = null;
  if (graphIds.length) {
    const { data: visible } = await supabase
      .from("graphs")
      .select("id")
      .in("id", graphIds);
    const visibleIds = new Set((visible ?? []).map((graph) => graph.id));
    graphId = graphIds.find((id) => visibleIds.has(id)) ?? null;
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: post.title.slice(0, 120),
      description: excerpt(post.body, 500),
      active_graph_id: graphId,
    })
    .select("id")
    .single();
  if (projectError) return { ok: false, error: projectError.message };

  const { error: fileError } = await supabase
    .from("project_files")
    .insert({ project_id: project.id, path: "main.py", content: mainPy });
  if (fileError) return { ok: false, error: fileError.message };

  if (graphId) {
    const { error: pinError } = await supabase
      .from("project_graphs")
      .insert({ project_id: project.id, graph_id: graphId });
    if (pinError) return { ok: false, error: pinError.message };
  }

  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true, id: project.id };
}

/**
 * GitHub-style fork of a post's attached project: the files AND every pinned
 * graph are copied into the caller's account (pins whose graph is no longer
 * visible are skipped), lineage is recorded via forked_from_post_id.
 */
export async function forkPostProject(postId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to fork." };
  if (!uuidShape.test(postId)) return { ok: false, error: "Invalid post." };

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id, project_id, is_published")
    .eq("id", postId)
    .maybeSingle();
  if (postError) return { ok: false, error: postError.message };
  if (!post?.is_published || !post.project_id) {
    return { ok: false, error: "This post has no forkable project." };
  }

  const [projectRes, filesRes, pinsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("name, description, active_graph_id")
      .eq("id", post.project_id)
      .maybeSingle(),
    supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", post.project_id),
    supabase
      .from("project_graphs")
      .select("graph_id, position")
      .eq("project_id", post.project_id)
      .order("position"),
  ]);
  if (projectRes.error) return { ok: false, error: projectRes.error.message };
  if (filesRes.error) return { ok: false, error: filesRes.error.message };
  if (pinsRes.error) return { ok: false, error: pinsRes.error.message };

  const source = projectRes.data;
  if (!source) return { ok: false, error: "The attached project is gone." };

  const { data: fork, error: forkError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: `${source.name} (fork)`.slice(0, 120),
      description: source.description,
      forked_from_post_id: postId,
    })
    .select("id")
    .single();
  if (forkError) return { ok: false, error: forkError.message };

  // best-effort cleanup so a failed fork doesn't strand half a project
  const createdGraphIds: string[] = [];
  const fail = async (message: string): Promise<ActionResult> => {
    await supabase.from("projects").delete().eq("id", fork.id);
    if (createdGraphIds.length) {
      await supabase.from("graphs").delete().in("id", createdGraphIds);
    }
    return { ok: false, error: message };
  };

  const files = filesRes.data ?? [];
  if (files.length) {
    const { error } = await supabase.from("project_files").insert(
      files.map((file) => ({
        project_id: fork.id,
        path: file.path,
        content: file.content,
      })),
    );
    if (error) return fail(error.message);
  }

  const pins = pinsRes.data ?? [];
  const idMap = new Map<string, string>();
  for (const pin of pins) {
    const copied = await copyGraph(supabase, user.id, pin.graph_id);
    if ("error" in copied) continue; // vanished or invisible — skip the pin
    idMap.set(pin.graph_id, copied.id);
    createdGraphIds.push(copied.id);
  }

  if (idMap.size) {
    const { error } = await supabase.from("project_graphs").insert(
      pins
        .filter((pin) => idMap.has(pin.graph_id))
        .map((pin) => ({
          project_id: fork.id,
          graph_id: idMap.get(pin.graph_id)!,
          position: pin.position,
        })),
    );
    if (error) return fail(error.message);
  }

  const remappedActive = source.active_graph_id
    ? (idMap.get(source.active_graph_id) ?? null)
    : null;
  const firstPin = idMap.values().next().value ?? null;
  const { error: activeError } = await supabase
    .from("projects")
    .update({ active_graph_id: remappedActive ?? firstPin })
    .eq("id", fork.id);
  if (activeError) return fail(activeError.message);

  revalidatePath("/projects");
  revalidatePath("/graphs");
  revalidatePath("/");
  return { ok: true, id: fork.id };
}

const commentSchema = z
  .string()
  .trim()
  .min(1, "Say something first.")
  .max(2000, "Comments are capped at 2000 characters.");

export async function addComment(
  postId: string,
  body: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to comment." };

  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // RLS allows commenting on published posts only
  const { error } = await supabase.from("post_comments").insert({
    post_id: postId,
    user_id: user.id,
    body: parsed.data,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/posts/${postId}`);
  return { ok: true };
}

export async function deleteComment(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  // RLS: the comment's author or the post's owner
  const { data, error } = await supabase
    .from("post_comments")
    .delete()
    .eq("id", id)
    .select("post_id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "You can't delete this comment." };
  }

  revalidatePath(`/posts/${data[0].post_id}`);
  return { ok: true };
}
