"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useListNav } from "@/components/site/list-transition";
import { Button } from "@/components/ui/button";

/**
 * Link-based pagination for the server-rendered list pages — the page
 * number lives in the URL like every other list control, so paged views
 * stay shareable and the back button walks pages. Hrefs arrive as strings
 * (a client component can't take an href-builder function from a server
 * page). Plain left-clicks route through the shared list transition so the
 * results dim while loading; modified clicks keep native link behavior.
 */
export function Pager({
  page,
  pageCount,
  prevHref,
  nextHref,
}: {
  page: number;
  pageCount: number;
  prevHref: string;
  nextHref: string;
}) {
  const nav = useListNav();

  function onClick(event: React.MouseEvent<HTMLAnchorElement>, target: string) {
    if (
      !nav ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    // a page change replaces the whole list — scroll back to the top of it
    nav.navigate(target, { scroll: true });
  }

  if (pageCount <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-center gap-4">
      {page > 1 ? (
        <Button variant="outline" size="sm" asChild>
          <Link
            href={prevHref}
            rel="prev"
            onClick={(event) => onClick(event, prevHref)}
          >
            <ChevronLeft /> Previous
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <ChevronLeft /> Previous
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Button variant="outline" size="sm" asChild>
          <Link
            href={nextHref}
            rel="next"
            onClick={(event) => onClick(event, nextHref)}
          >
            Next <ChevronRight />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Next <ChevronRight />
        </Button>
      )}
    </div>
  );
}
