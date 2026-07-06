/**
 * The fixed topic taxonomy for graphs and posts. Tags drive explore's
 * filtering, so they're a curated algorithm vocabulary rather than
 * free-form text — free tags fragment ("bfs" vs "BFS" vs "breadth-first")
 * and make the filter chips useless.
 */
export const TOPIC_TAGS = [
  { slug: "bfs", label: "BFS" },
  { slug: "dfs", label: "DFS" },
  { slug: "shortest-paths", label: "Shortest paths" },
  { slug: "mst", label: "Minimum spanning tree" },
  { slug: "flow", label: "Network flow" },
  { slug: "dag", label: "DAGs & topological sort" },
  { slug: "trees", label: "Trees" },
  { slug: "connectivity", label: "Connectivity" },
  { slug: "matching", label: "Matching" },
  { slug: "coloring", label: "Coloring" },
] as const;

export type TopicTag = (typeof TOPIC_TAGS)[number]["slug"];

export const TAG_SLUGS = TOPIC_TAGS.map((tag) => tag.slug);

/** Content is capped to a handful of tags so cards stay scannable. */
export const MAX_TAGS = 4;

const LABELS = new Map<string, string>(
  TOPIC_TAGS.map((tag) => [tag.slug, tag.label]),
);

export function tagLabel(slug: string): string {
  return LABELS.get(slug) ?? slug;
}

/** Drop unknown slugs and dupes; used by actions before writing. */
export function sanitizeTags(tags: string[]): string[] {
  return [...new Set(tags.filter((tag) => LABELS.has(tag)))].slice(0, MAX_TAGS);
}
