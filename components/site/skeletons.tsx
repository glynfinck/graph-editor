import { CardGrid } from "@/components/site/list-page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared skeleton primitives, dimension-matched to the real components so
 * the skeleton → content swap doesn't shift layout. Token utilities only
 * (bg-muted, border, rounded-*) so they follow every palette and theme.
 */

/** Mirrors ListPageHeader: title + description, action button on the right. */
export function ListHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

/** Mirrors ListToolbar: filter pills, search input, sort select. */
export function ToolbarSkeleton({ tagRow = false }: { tagRow?: boolean }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="ml-auto h-8 w-56" />
        <Skeleton className="h-8 w-36" />
      </div>
      {tagRow && (
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-full" />
        </div>
      )}
    </div>
  );
}

/** Mirrors GraphCard/ProjectCard: thumbnail strip, title, description, meta. */
export function CardSkeleton({ thumbnail = true }: { thumbnail?: boolean }) {
  return (
    <div className="rounded-xl border p-6">
      {thumbnail && <Skeleton className="h-24 w-full" />}
      <Skeleton className={cn("h-5 w-2/3", thumbnail && "mt-3")} />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-3 h-4 w-1/2" />
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  thumbnail = true,
}: {
  count?: number;
  thumbnail?: boolean;
}) {
  return (
    <CardGrid>
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} thumbnail={thumbnail} />
      ))}
    </CardGrid>
  );
}

/** Mirrors PostCard: no thumbnail — title, excerpt lines, author meta row. */
export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border p-6">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-3/4" />
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
    </div>
  );
}

export function PostListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <PostCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** Mirrors LibraryTable: header + rows of Name/Type/Status/Details/Likes/Updated. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="hidden h-4 w-40 sm:block" />
        <Skeleton className="ml-auto h-4 w-10" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="hidden h-4 w-48 sm:block" />
          <Skeleton className="ml-auto h-4 w-8" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A muted section heading line ("Recent projects", "Community posts", …). */
export function SectionHeadingSkeleton() {
  return <Skeleton className="h-4 w-32" />;
}
