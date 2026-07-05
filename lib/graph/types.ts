import { z } from "zod";

/**
 * The canvas document, assembled from the graph_nodes/graph_edges tables on
 * read and swapped atomically on save (replace_graph_doc). Node/edge ids are
 * uuids (36 chars). Per-edge `weight`/`name` are the generalized attributes —
 * a plain graph just leaves them null; `directed` lives on the graph row, not
 * in the document, and is threaded separately (see the editor store).
 */
export const graphDocSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(36),
        name: z.string().min(1).max(40),
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    // generous caps for large graphs; the server-action body limit (~1MB) is
    // the real ceiling on a save
    .max(5000),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(36),
        source: z.string().min(1).max(36),
        target: z.string().min(1).max(36),
        // null = unweighted; coerced from a missing/blank value
        weight: z
          .number()
          .finite()
          .nonnegative()
          .nullish()
          .transform((v) => v ?? null),
        // null = unlabeled; blank strings collapse to null (DB requires 1–40)
        name: z
          .string()
          .trim()
          .max(40)
          .nullish()
          .transform((v) => (v ? v : null)),
      }),
    )
    .max(15000),
});

export type GraphDoc = z.infer<typeof graphDocSchema>;
export type GraphNodeDoc = GraphDoc["nodes"][number];
export type GraphEdgeDoc = GraphDoc["edges"][number];

export const EMPTY_GRAPH_DOC: GraphDoc = { nodes: [], edges: [] };

/** A, B, …, Z, A1, B1, … — first label not already taken. */
export function nextNodeLabel(taken: Iterable<string>): string {
  const used = new Set(taken);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let round = 0; ; round++) {
    for (const letter of alphabet) {
      const label = round === 0 ? letter : `${letter}${round}`;
      if (!used.has(label)) return label;
    }
  }
}
