/**
 * Server-side graph document plumbing shared by the graph actions and the
 * post-fork flow. Deliberately NOT a "use server" module — these take a
 * Supabase client and are not client-callable endpoints.
 */
import { getGraphDoc } from "@/lib/data/graphs";
import type { GraphDoc } from "@/lib/graph/types";
import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Swap a graph's nodes+edges atomically (see the replace_graph_doc
 * migration). Returns an error message, or null on success.
 */
export async function replaceDoc(
  supabase: Supabase,
  id: string,
  doc: { nodes: Json; edges: Json },
): Promise<string | null> {
  const { data, error } = await supabase.rpc("replace_graph_doc", {
    p_graph_id: id,
    p_nodes: doc.nodes,
    p_edges: doc.edges,
  });
  if (error) return error.message;
  if (!data) return "You can't edit this graph.";
  return null;
}

export const docToJson = (doc: GraphDoc) => ({
  nodes: doc.nodes as unknown as Json,
  edges: doc.edges as unknown as Json,
});

/**
 * Copy one visible graph into `ownerId`'s collection — used by duplicate
 * and fork. Cleans up its own shell on failure; no revalidation here.
 */
export async function copyGraph(
  supabase: Supabase,
  ownerId: string,
  sourceId: string,
  name?: string,
): Promise<{ id: string } | { error: string }> {
  const { data: source, error: readError } = await supabase
    .from("graphs")
    .select("name, description, directed")
    .eq("id", sourceId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!source) return { error: "Graph not found." };

  const { data, error } = await supabase
    .from("graphs")
    .insert({
      owner_id: ownerId,
      name: (name ?? source.name).slice(0, 120),
      description: source.description,
      directed: source.directed,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // page the source doc in (a big graph exceeds a single request's row cap).
  // getGraphDoc throws on a failed page fetch — catch it so the shell insert
  // above is cleaned up and the {id}|{error} contract holds for callers.
  let doc: GraphDoc;
  try {
    doc = await getGraphDoc(supabase, sourceId);
  } catch (error) {
    await supabase.from("graphs").delete().eq("id", data.id);
    return {
      error:
        error instanceof Error ? error.message : "Couldn't copy the graph.",
    };
  }
  const docError = await replaceDoc(supabase, data.id, docToJson(doc));
  if (docError) {
    await supabase.from("graphs").delete().eq("id", data.id);
    return { error: docError };
  }

  return { id: data.id };
}
