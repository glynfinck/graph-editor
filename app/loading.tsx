import { ListPageShell } from "@/components/site/list-page";
import {
  CardGridSkeleton,
  ListHeaderSkeleton,
  SectionHeadingSkeleton,
} from "@/components/site/skeletons";

/**
 * Home fallback. Auth state is unknown until the page's getUser() resolves,
 * so this stays neutral — a header plus card sections — and covers both the
 * signed-in dashboard and the brief window before the marketing home.
 */
export default function HomeLoading() {
  return (
    <ListPageShell>
      <ListHeaderSkeleton />
      <section className="mt-8">
        <SectionHeadingSkeleton />
        <div className="mt-3">
          <CardGridSkeleton count={6} />
        </div>
      </section>
      <section className="mt-8">
        <SectionHeadingSkeleton />
        <div className="mt-3">
          <CardGridSkeleton count={3} />
        </div>
      </section>
    </ListPageShell>
  );
}
