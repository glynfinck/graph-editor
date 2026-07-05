import { Skeleton } from "@/components/ui/skeleton";

/** Route-level fallback while the graph (and its paged-in nodes/edges) load. */
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <Skeleton className="h-full w-full rounded-xl" />
      </div>
    </div>
  );
}
