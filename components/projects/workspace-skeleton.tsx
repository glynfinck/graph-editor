import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback mirroring ProjectWorkspace's frame: toolbar, file
 * tree (~16%), code editor (~42%) and the graph/console column (~42%,
 * split 62/38) — same proportions as the resizable panels' defaults.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-8 w-56" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[16%] shrink-0 border-r p-3 md:block">
          <div className="grid gap-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col border-r">
          <div className="flex h-11 shrink-0 items-center border-b px-3">
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="grid content-start gap-2.5 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="hidden min-h-0 w-[42%] shrink-0 flex-col sm:flex">
          <div className="min-h-0 flex-[62] p-3">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
          <div className="min-h-0 flex-[38] border-t p-3">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
