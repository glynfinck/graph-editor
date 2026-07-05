"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getGraphDoc } from "@/lib/data/graphs";
import { copyGraph, docToJson, replaceDoc } from "@/lib/graph/copy";
import {
  graphDocSchema,
  EMPTY_GRAPH_DOC,
  MAX_EDGES,
  MAX_NODES,
  type GraphDoc,
} from "@/lib/graph/types";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/** A clear message when a doc exceeds the node/edge caps (vs the generic
 *  "invalid document" a shape error would give). */
function graphSizeError(data: unknown): string | null {
  const doc = data as { nodes?: unknown[]; edges?: unknown[] } | null;
  if (Array.isArray(doc?.nodes) && doc.nodes.length > MAX_NODES) {
    return `Graphs are limited to ${MAX_NODES.toLocaleString()} nodes.`;
  }
  if (Array.isArray(doc?.edges) && doc.edges.length > MAX_EDGES) {
    return `Graphs are limited to ${MAX_EDGES.toLocaleString()} edges.`;
  }
  return null;
}

const metaSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).default(""),
});

/** Signed-in Supabase client + user, or a typed failure. */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null } as const;
  return { supabase, user } as const;
}

export async function createGraph(input: {
  name: string;
  description?: string;
  /** directed graphs draw arrowheads and traverse successors only */
  directed?: boolean;
  /** optional initial document, e.g. local edits of a graph being copied */
  data?: unknown;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to create graphs." };

  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  let doc = EMPTY_GRAPH_DOC;
  if (input.data !== undefined) {
    const sizeError = graphSizeError(input.data);
    if (sizeError) return { ok: false, error: sizeError };
    const parsedDoc = graphDocSchema.safeParse(input.data);
    if (!parsedDoc.success) {
      return { ok: false, error: "Invalid graph document." };
    }
    doc = parsedDoc.data;
  }

  const { data, error } = await supabase
    .from("graphs")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      directed: input.directed ?? false,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (doc.nodes.length || doc.edges.length) {
    const docError = await replaceDoc(supabase, data.id, docToJson(doc));
    if (docError) {
      // don't leave an empty shell behind
      await supabase.from("graphs").delete().eq("id", data.id);
      return { ok: false, error: docError };
    }
  }

  revalidatePath("/graphs");
  revalidatePath("/explore");
  revalidatePath("/");
  return { ok: true, id: data.id };
}

export async function saveGraph(
  id: string,
  input: {
    name: string;
    description?: string;
    directed?: boolean;
    data: unknown;
  },
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to save changes." };

  const meta = metaSchema.safeParse(input);
  if (!meta.success) return { ok: false, error: meta.error.issues[0].message };

  const sizeError = graphSizeError(input.data);
  if (sizeError) return { ok: false, error: sizeError };
  const doc = graphDocSchema.safeParse(input.data);
  if (!doc.success) return { ok: false, error: "Invalid graph document." };

  const update: { name: string; description: string; directed?: boolean } = {
    name: meta.data.name,
    description: meta.data.description,
  };
  if (typeof input.directed === "boolean") update.directed = input.directed;

  // RLS restricts the update to rows the caller owns.
  const { data, error } = await supabase
    .from("graphs")
    .update(update)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You can't edit this graph." };

  const docError = await replaceDoc(supabase, id, docToJson(doc.data));
  if (docError) return { ok: false, error: docError };

  revalidatePath("/graphs");
  revalidatePath("/explore");
  revalidatePath("/");
  revalidatePath(`/graphs/${id}`);
  return { ok: true, id };
}

/** Metadata-only rename — the document isn't touched. */
export async function renameGraph(
  id: string,
  name: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const parsed = metaSchema.shape.name.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // RLS restricts the update to rows the caller owns.
  const { data, error } = await supabase
    .from("graphs")
    .update({ name: parsed.data })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You can't edit this graph." };

  revalidatePath("/graphs");
  revalidatePath("/explore");
  revalidatePath("/");
  revalidatePath(`/graphs/${id}`);
  return { ok: true, id };
}

export async function deleteGraph(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data, error } = await supabase
    .from("graphs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "You can't delete this graph." };
  }

  revalidatePath("/graphs");
  revalidatePath("/explore");
  revalidatePath("/");
  return { ok: true };
}

/** Like/unlike a visible graph. Returns the caller's new liked state. */
export async function toggleGraphLike(
  id: string,
): Promise<ActionResult & { liked?: boolean }> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to like graphs." };

  const { data: existing, error: readError } = await supabase
    .from("graph_likes")
    .select("graph_id")
    .eq("graph_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };

  if (existing) {
    const { error } = await supabase
      .from("graph_likes")
      .delete()
      .eq("graph_id", id)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // RLS rejects likes on graphs the caller can't see
    const { error } = await supabase
      .from("graph_likes")
      .insert({ graph_id: id, user_id: user.id });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/explore");
  revalidatePath("/graphs");
  revalidatePath(`/graphs/${id}`);
  return { ok: true, id, liked: !existing };
}

/**
 * Load a visible graph's full document, paged in. Used by the project
 * workspace, which lists graph summaries (counts only) and fetches the active
 * graph's nodes/edges on demand. RLS governs visibility — no user required.
 */
export async function loadGraphDoc(
  id: string,
): Promise<{ ok: true; doc: GraphDoc } | { ok: false; error: string }> {
  const supabase = await createClient();
  try {
    const doc = await getGraphDoc(supabase, id);
    return { ok: true, doc };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't load the graph.",
    };
  }
}

/** Copy any visible graph (e.g. a sample) into the caller's own collection. */
export async function duplicateGraph(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to save a copy." };

  const { data: source } = await supabase
    .from("graphs")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!source) return { ok: false, error: "Graph not found." };

  const copied = await copyGraph(
    supabase,
    user.id,
    id,
    `${source.name} (copy)`,
  );
  if ("error" in copied) return { ok: false, error: copied.error };

  revalidatePath("/graphs");
  revalidatePath("/explore");
  revalidatePath("/");
  return { ok: true, id: copied.id };
}
