"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Compass,
  FolderCode,
  LibraryBig,
  Loader2,
  Newspaper,
  PenLine,
  Search,
  Waypoints,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { searchEverything, type SearchHit } from "@/lib/actions/search";
import { cn } from "@/lib/utils";

type PaletteItem = {
  key: string;
  name: string;
  hint: string;
  href: string;
  Icon: typeof Search;
};

const TYPE_ICONS = {
  project: FolderCode,
  graph: Waypoints,
  post: Newspaper,
} as const;

const QUICK_LINKS: PaletteItem[] = [
  { key: "nav-library", name: "Library", hint: "Your work", href: "/library", Icon: LibraryBig },
  { key: "nav-explore", name: "Explore", hint: "Community", href: "/explore", Icon: Compass },
  { key: "nav-new-post", name: "Write a post", hint: "New draft", href: "/posts/new", Icon: PenLine },
];

/**
 * ⌘K quick-open over everything the caller can see. Results come from a
 * debounced server action (RLS scopes them); an empty query shows nav
 * shortcuts instead of results.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // reset per open so a stale query doesn't flash
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setHits([]);
      setActive(0);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handleOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setHits([]);
      setActive(0);
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const results = await searchEverything(q);
          setHits(results);
          setActive(0);
        } catch {
          setHits([]);
        }
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const items = useMemo<PaletteItem[]>(
    () =>
      query.trim().length < 2
        ? QUICK_LINKS
        : hits.map((hit) => ({
            key: `${hit.type}-${hit.id}`,
            name: hit.name,
            hint: hit.hint,
            href: hit.href,
            Icon: TYPE_ICONS[hit.type],
          })),
    [query, hits],
  );

  function go(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && items[active]) {
      event.preventDefault();
      go(items[active]);
    }
  }

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="hidden h-8 w-44 items-center gap-2 rounded-md border px-2.5 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground sm:flex lg:w-56"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            {pending ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" />
            )}
            <input
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search projects, graphs and posts…"
              aria-label="Search projects, graphs and posts"
              autoFocus
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                {pending ? "Searching…" : "No matches."}
              </p>
            ) : (
              items.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  data-active={index === active}
                  onClick={() => go(item)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                    index === active && "bg-accent text-accent-foreground",
                  )}
                >
                  <item.Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
