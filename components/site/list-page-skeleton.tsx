import { ListPageShell } from "@/components/site/list-page";
import {
  CardGridSkeleton,
  ListHeaderSkeleton,
  ToolbarSkeleton,
} from "@/components/site/skeletons";

/** Loading state shared by the library and explore pages. */
export function ListPageSkeleton() {
  return (
    <ListPageShell>
      <ListHeaderSkeleton />
      <div className="mt-8">
        <ToolbarSkeleton />
      </div>
      <div className="mt-6">
        <CardGridSkeleton count={6} />
      </div>
    </ListPageShell>
  );
}
