import {
  GRAPH_SELECT,
  toGraph,
  type GraphJoinRow,
} from "@/lib/data/graphs";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/helpers";

export type Project = Tables<"projects">;
export type ProjectFile = Tables<"project_files">;

/**
 * The caller's projects. RLS also exposes other people's PUBLIC projects
 * (for the posts platform), so the owner filter here is load-bearing — a
 * bare select would list strangers' published projects as "yours".
 */
export async function getOwnProjects() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, projects: [] };

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return { user, projects: data ?? [] };
}

/**
 * A project with its files, plus every graph the caller can see (for the
 * test-graph picker). Null project when it doesn't exist or isn't theirs.
 */
export async function getProjectWorkspace(id: string) {
  const supabase = await createClient();

  // the workspace is owner-only: public projects are readable via RLS (for
  // the posts platform's file viewer), but they are not editable here, so
  // anyone else gets a notFound
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      project: null,
      files: [],
      graphs: [],
      pinnedGraphIds: [] as string[],
    };
  }

  const [projectRes, filesRes, graphsRes, pinsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", id)
      .order("path"),
    supabase
      .from("graphs")
      .select(GRAPH_SELECT)
      .order("is_sample", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase
      .from("project_graphs")
      .select("graph_id, position")
      .eq("project_id", id)
      .order("position"),
  ]);
  if (projectRes.error) throw projectRes.error;
  if (filesRes.error) throw filesRes.error;
  if (graphsRes.error) throw graphsRes.error;
  if (pinsRes.error) throw pinsRes.error;

  // fork lineage: resolve the source post's title for the credit line
  let forkedFrom: { id: string; title: string } | null = null;
  if (projectRes.data?.forked_from_post_id) {
    const { data: post } = await supabase
      .from("posts")
      .select("id, title")
      .eq("id", projectRes.data.forked_from_post_id)
      .maybeSingle();
    forkedFrom = post ?? null;
  }

  return {
    user,
    project: projectRes.data ?? null,
    files: filesRes.data ?? [],
    graphs: ((graphsRes.data as GraphJoinRow[] | null) ?? []).map((row) =>
      toGraph(row, user.id),
    ),
    pinnedGraphIds: (pinsRes.data ?? []).map((pin) => pin.graph_id),
    forkedFrom,
  };
}
