import { ListPageShell } from "@/components/site/list-page";
import {
  CardGridSkeleton,
  ListHeaderSkeleton,
  PostListSkeleton,
  SectionHeadingSkeleton,
  ToolbarSkeleton,
} from "@/components/site/skeletons";

/** Mirrors explore's default view: lessons rail, toolbar, posts, graph grid. */
export default function ExploreLoading() {
  return (
    <ListPageShell>
      <ListHeaderSkeleton />
      <section className="mt-8">
        <SectionHeadingSkeleton />
        <div className="mt-3">
          <PostListSkeleton count={2} />
        </div>
      </section>
      <div className="mt-8">
        <ToolbarSkeleton tagRow />
      </div>
      <section className="mt-6">
        <SectionHeadingSkeleton />
        <div className="mt-3">
          <PostListSkeleton count={3} />
        </div>
      </section>
      <section className="mt-6">
        <SectionHeadingSkeleton />
        <div className="mt-3">
          <CardGridSkeleton count={6} />
        </div>
      </section>
    </ListPageShell>
  );
}
