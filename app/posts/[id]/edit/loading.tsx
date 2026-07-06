import { Skeleton } from "@/components/ui/skeleton";

/** Route-level fallback matching the post editor layout. */
export default function EditPostLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Skeleton className="h-7 w-36" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-8 grid gap-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}
