import { Skeleton } from "@/components/ui/skeleton";

/** Route-level fallback matching the post article layout. */
export default function PostLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="mt-4 h-9 w-3/4" />
      <div className="mt-3 flex items-center gap-3">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-8 grid gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-4 h-40 w-full rounded-xl" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="mt-12">
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 grid gap-4">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-2/3" />
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="mt-3 h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
