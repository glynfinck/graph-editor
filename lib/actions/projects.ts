"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  fileSchema,
  MAX_PROJECT_FILES,
  MAX_PROJECT_GRAPHS,
  STARTER_HELPERS_PY,
  STARTER_MAIN_PY,
} from "@/lib/projects/types";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const metaSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).default(""),
});

// UUID shape only — z.uuid() enforces RFC version bits, which rejects the
// all-zero-prefixed ids used for seeded sample graphs
const uuidShape =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const savePayloadSchema = z
  .object({
    name: metaSchema.shape.name,
    description: metaSchema.shape.description,
    activeGraphId: z.string().regex(uuidShape).nullable(),
    graphIds: z.array(z.string().regex(uuidShape)).max(MAX_PROJECT_GRAPHS),
    files: z.array(fileSchema).min(1).max(MAX_PROJECT_FILES),
  })
  .refine(
    (p) => p.activeGraphId === null || p.graphIds.includes(p.activeGraphId),
    { message: "The active graph must be one of the project's graphs." },
  );

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user } as const;
}

export async function createProject(input: {
  name: string;
  description?: string;
  /** test graph selected from the start, e.g. "open in a project" flows */
  activeGraphId?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to create projects." };

  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const activeGraphId =
    input.activeGraphId && uuidShape.test(input.activeGraphId)
      ? input.activeGraphId
      : null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      active_graph_id: activeGraphId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { error: filesError } = await supabase.from("project_files").insert([
    { project_id: data.id, path: "main.py", content: STARTER_MAIN_PY },
    { project_id: data.id, path: "helpers.py", content: STARTER_HELPERS_PY },
  ]);
  if (filesError) return { ok: false, error: filesError.message };

  if (activeGraphId) {
    const { error: pinError } = await supabase
      .from("project_graphs")
      .insert({ project_id: data.id, graph_id: activeGraphId });
    if (pinError) return { ok: false, error: pinError.message };
  }

  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true, id: data.id };
}

/** Point a project at a different test graph (the "open in a project" flow). */
export async function setProjectActiveGraph(
  projectId: string,
  graphId: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  if (!uuidShape.test(projectId) || !uuidShape.test(graphId)) {
    return { ok: false, error: "Invalid id." };
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ active_graph_id: graphId })
    .eq("id", projectId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "You can't edit this project." };
  }

  // the active graph is always among the project's pins
  const { error: pinError } = await supabase
    .from("project_graphs")
    .upsert(
      { project_id: projectId, graph_id: graphId },
      { onConflict: "project_id,graph_id", ignoreDuplicates: true },
    );
  if (pinError) return { ok: false, error: pinError.message };

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, id: projectId };
}

/**
 * Persist the whole workspace in one call: meta, the selected test graph and
 * the full file set. Files use replace semantics (delete all, insert the
 * working tree) — an upsert would try to write `project_id` on conflict,
 * which the column-level grants deliberately forbid. RLS restricts every
 * statement to the caller's own project.
 */
export async function saveProject(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to save." };

  const parsed = savePayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const payload = parsed.data;

  const { data: updated, error: metaError } = await supabase
    .from("projects")
    .update({
      name: payload.name,
      description: payload.description,
      active_graph_id: payload.activeGraphId,
    })
    .eq("id", id)
    .select("id");
  if (metaError) return { ok: false, error: metaError.message };
  if (!updated?.length) {
    return { ok: false, error: "You can't edit this project." };
  }

  const { error: clearError } = await supabase
    .from("project_files")
    .delete()
    .eq("project_id", id);
  if (clearError) return { ok: false, error: clearError.message };

  const { error: insertError } = await supabase.from("project_files").insert(
    payload.files.map((file) => ({
      project_id: id,
      path: file.path,
      content: file.content,
    })),
  );
  if (insertError) return { ok: false, error: insertError.message };

  // pins use the same replace semantics as files
  const { error: clearPinsError } = await supabase
    .from("project_graphs")
    .delete()
    .eq("project_id", id);
  if (clearPinsError) return { ok: false, error: clearPinsError.message };

  if (payload.graphIds.length) {
    const { error: pinsError } = await supabase.from("project_graphs").insert(
      payload.graphIds.map((graph_id, position) => ({
        project_id: id,
        graph_id,
        position,
      })),
    );
    if (pinsError) return { ok: false, error: pinsError.message };
  }

  revalidatePath("/projects");
  revalidatePath("/");
  revalidatePath(`/projects/${id}`);
  return { ok: true, id };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "You can't delete this project." };
  }

  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true };
}
