import { Skeleton } from "@/components/ui/skeleton";

/** Route-level fallback matching the settings layout. */
export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-8 rounded-xl border p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
        <Skeleton className="mt-4 h-9 w-full" />
        <Skeleton className="mt-4 h-9 w-28" />
      </div>
      <div className="mt-4 rounded-xl border p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-56" />
        <Skeleton className="mt-4 h-9 w-28" />
      </div>
    </div>
  );
}
