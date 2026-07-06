"use server";

import { createClient } from "@/lib/supabase/server";

/** One row in the ⌘K palette results. */
export type SearchHit = {
  type: "project" | "graph" | "post";
  id: string;
  name: string;
  /** small qualifier shown next to the name, e.g. "Draft" or "Sample" */
  hint: string;
  href: string;
};

const PER_TYPE = 6;

// escape ilike wildcards so a literal "%" in the query stays literal
const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

/**
 * Name/title search across everything the caller can see (their own work
 * plus public content — RLS does the scoping). Powers the ⌘K palette.
 */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pattern = `%${escapeLike(q)}%`;

  const [projectsRes, graphsRes, postsRes] = await Promise.all([
    user
      ? supabase
          .from("projects")
          .select("id, name")
          .eq("owner_id", user.id)
          .ilike("name", pattern)
          .order("updated_at", { ascending: false })
          .limit(PER_TYPE)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("graphs")
      .select("id, name, is_sample, owner_id")
      .ilike("name", pattern)
      .order("updated_at", { ascending: false })
      .limit(PER_TYPE),
    supabase
      .from("posts")
      .select("id, title, is_published, is_official, owner_id")
      .ilike("title", pattern)
      .order("updated_at", { ascending: false })
      .limit(PER_TYPE),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (graphsRes.error) throw graphsRes.error;
  if (postsRes.error) throw postsRes.error;

  const userId = user?.id ?? null;
  return [
    ...(projectsRes.data ?? []).map(
      (project): SearchHit => ({
        type: "project",
        id: project.id,
        name: project.name,
        hint: "Project",
        href: `/projects/${project.id}`,
      }),
    ),
    ...(graphsRes.data ?? []).map(
      (graph): SearchHit => ({
        type: "graph",
        id: graph.id,
        name: graph.name,
        hint: graph.is_sample
          ? "Sample"
          : graph.owner_id === userId
            ? "Your graph"
            : "Community graph",
        href: `/graphs/${graph.id}`,
      }),
    ),
    ...(postsRes.data ?? []).map(
      (post): SearchHit => ({
        type: "post",
        id: post.id,
        name: post.title,
        hint: post.is_official
          ? "Lesson"
          : post.is_published
            ? "Post"
            : "Draft",
        href: `/posts/${post.id}`,
      }),
    ),
  ];
}
