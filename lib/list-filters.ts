/** Pure filter/sort helpers shared by the library and explore list pages. */

export const LIBRARY_SORTS = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Newest first" },
  { value: "name", label: "Name" },
  { value: "likes", label: "Most liked" },
] as const;

export type LibrarySort = (typeof LIBRARY_SORTS)[number]["value"];

export const EXPLORE_SORTS = [
  { value: "trending", label: "Trending" },
  { value: "new", label: "New" },
  { value: "likes", label: "Most liked" },
] as const;

export type ExploreSort = (typeof EXPLORE_SORTS)[number]["value"];

export function parseParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parsePage(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isFinite(page) && page > 1 ? page : 1;
}

/** Slice one page out of a filtered list, clamping past-the-end pages. */
export function paginate<T>(
  items: T[],
  requestedPage: number,
  perPage: number,
): { pageItems: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.min(requestedPage, pageCount);
  return {
    pageItems: items.slice((page - 1) * perPage, page * perPage),
    page,
    pageCount,
  };
}

/** Case-insensitive substring match over any of the given fields. */
export function matchesQuery(
  q: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

/**
 * Likes decayed by age — a week-old post needs ~5× the likes of a day-old
 * one to rank the same. The +1/+2 offsets keep brand-new zero-like content
 * from pinning to the top (or dividing by zero).
 */
export function trendingScore(likeCount: number, iso: string | null): number {
  const ageDays = Math.max(
    0,
    (Date.now() - new Date(iso ?? 0).getTime()) / 86_400_000,
  );
  return (likeCount + 1) / Math.pow(ageDays + 2, 1.5);
}

type SortableFacts = {
  name: string;
  created: string;
  updated: string;
  likes: number;
};

/** Sort a copy of `items` by a library sort key, via a per-shape accessor. */
export function sortLibraryItems<T>(
  items: T[],
  sort: LibrarySort,
  facts: (item: T) => SortableFacts,
): T[] {
  const sorted = [...items];
  switch (sort) {
    case "name":
      return sorted.sort((a, b) => facts(a).name.localeCompare(facts(b).name));
    case "created":
      return sorted.sort((a, b) =>
        facts(b).created.localeCompare(facts(a).created),
      );
    case "likes":
      return sorted.sort((a, b) => facts(b).likes - facts(a).likes);
    default:
      return sorted.sort((a, b) =>
        facts(b).updated.localeCompare(facts(a).updated),
      );
  }
}
