/**
 * Post-body embeds without new syntax: a link to a graph or project pasted
 * on its own line becomes a rich card. The server extracts the referenced
 * ids from the markdown, loads what RLS lets the reader see, and the body
 * renderer swaps qualifying links for cards — everything else stays a link.
 */

// loose UUID shape — seeded content uses zero-prefixed ids
const REF_RE =
  /\/(graphs|projects)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/** hard cap on refs fetched per post (two bounded .in() queries) */
export const MAX_EMBED_REFS = 20;

export function extractEmbedRefs(body: string): {
  graphIds: string[];
  projectIds: string[];
} {
  const graphIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const match of body.matchAll(REF_RE)) {
    if (graphIds.size + projectIds.size >= MAX_EMBED_REFS) break;
    const id = match[2].toLowerCase();
    if (match[1].toLowerCase() === "graphs") graphIds.add(id);
    else projectIds.add(id);
  }
  return { graphIds: [...graphIds], projectIds: [...projectIds] };
}

/** Accepts relative hrefs and same-origin absolute URLs. */
export function matchEmbedHref(
  href: string | undefined,
): { kind: "graph" | "project"; id: string } | null {
  if (!href) return null;
  const single = new RegExp(REF_RE.source, "i");
  const match = single.exec(href);
  if (!match) return null;
  // reject links to other hosts — only our own routes embed
  if (!/^(\/|https?:\/\/)/i.test(href)) return null;
  return {
    kind: match[1].toLowerCase() === "graphs" ? "graph" : "project",
    id: match[2].toLowerCase(),
  };
}

export type GraphEmbed = {
  id: string;
  name: string;
  description: string;
  is_sample: boolean;
  nodeCount: number;
  edgeCount: number;
  likeCount: number;
  likedByMe: boolean;
};

export type ProjectEmbed = {
  id: string;
  name: string;
  description: string;
  fileCount: number;
};

export type EmbedMap = {
  graphs: Record<string, GraphEmbed>;
  projects: Record<string, ProjectEmbed>;
};

export const EMPTY_EMBEDS: EmbedMap = { graphs: {}, projects: {} };
