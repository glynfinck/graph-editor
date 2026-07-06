"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Rows3, Search } from "lucide-react";

import { useListNav } from "@/components/site/list-transition";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ToolbarChip = { value: string; label: string; count?: number };
export type ToolbarSort = { value: string; label: string };

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "text-muted-foreground hover:border-ring/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Search / filter / sort controls for the list pages. All state lives in the
 * URL (replace, no scroll) so views are shareable and the back button works;
 * the server component re-filters on each change.
 */
export function ListToolbar({
  chips,
  chipParam,
  activeChip,
  sorts,
  activeSort,
  defaultSort,
  searchPlaceholder,
  initialQuery,
  viewToggle = false,
  activeView = "grid",
  tagChips,
  activeTag,
}: {
  chips: ToolbarChip[];
  chipParam: string;
  activeChip: string;
  sorts: readonly ToolbarSort[];
  activeSort: string;
  defaultSort: string;
  searchPlaceholder: string;
  initialQuery: string;
  viewToggle?: boolean;
  activeView?: "grid" | "table";
  /** optional second row of topic filters (explore) */
  tagChips?: ToolbarChip[];
  activeTag?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = useListNav();
  const pending = nav?.pending ?? false;
  const [query, setQuery] = useState(initialQuery);
  const skipFirstDebounce = useRef(true);

  function setParams(entries: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    // any filter change restarts pagination — page 5 of a different query
    // is meaningless
    params.delete("page");
    for (const [key, value] of Object.entries(entries)) {
      // defaults live off the URL so the bare path stays canonical
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (nav) nav.navigate(href, { replace: true, scroll: false });
    else router.replace(href, { scroll: false });
  }

  useEffect(() => {
    if (skipFirstDebounce.current) {
      skipFirstDebounce.current = false;
      return;
    }
    const timer = setTimeout(() => setParams({ q: query.trim() || null }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Chip
              key={chip.value}
              active={chip.value === activeChip}
              onClick={() =>
                setParams({
                  [chipParam]: chip.value === chips[0].value ? null : chip.value,
                })
              }
            >
              {chip.label}
              {chip.count !== undefined && (
                <span className="ml-1 opacity-60">{chip.count}</span>
              )}
            </Chip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-44 pl-8 text-sm sm:w-56"
            />
            {pending && (
              <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" />
            )}
          </div>

          <Select
            value={activeSort}
            onValueChange={(value) =>
              setParams({ sort: value === defaultSort ? null : value })
            }
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-36 text-sm"
              aria-label="Sort by"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sorts.map((sort) => (
                <SelectItem key={sort.value} value={sort.value}>
                  {sort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {viewToggle && (
            <div className="flex items-center rounded-md border p-0.5">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={activeView === "grid"}
                onClick={() => setParams({ view: null })}
                className={cn(
                  "rounded-sm p-1.5 transition-colors",
                  activeView === "grid"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Table view"
                aria-pressed={activeView === "table"}
                onClick={() => setParams({ view: "table" })}
                className={cn(
                  "rounded-sm p-1.5 transition-colors",
                  activeView === "table"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Rows3 className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {tagChips && tagChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tagChips.map((tag) => (
            <Chip
              key={tag.value}
              active={tag.value === activeTag}
              onClick={() =>
                setParams({ tag: tag.value === activeTag ? null : tag.value })
              }
            >
              {tag.label}
              {tag.count !== undefined && (
                <span className="ml-1 opacity-60">{tag.count}</span>
              )}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
