import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";

import { GraphCard } from "@/components/graphs/graph-card";
import { PostCard } from "@/components/posts/post-card";
import {
  CardGrid,
  EmptyStateCard,
  ListPageHeader,
  ListPageShell,
} from "@/components/site/list-page";
import { ListToolbar } from "@/components/site/list-toolbar";
import {
  ListNavProvider,
  PendingOverlay,
} from "@/components/site/list-transition";
import { Pager } from "@/components/site/pager";
import { Button } from "@/components/ui/button";
import {
  getExplorePage,
  GRAPHS_CAP,
  GRAPHS_PAGE,
  LESSONS_CAP,
  LESSONS_PAGE,
  POSTS_CAP,
  POSTS_PAGE,
} from "@/lib/data/explore";
import type { Post } from "@/lib/data/posts";
import {
  EXPLORE_SORTS,
  matchesQuery,
  paginate,
  parseParam,
  parsePage,
} from "@/lib/list-filters";
import { TAG_SLUGS, tagLabel } from "@/lib/tags";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

const TYPES = ["all", "lessons", "posts", "graphs"] as const;
const SORT_VALUES = EXPLORE_SORTS.map((sort) => sort.value);

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const type = parseParam(params.type, TYPES, "all");
  const sort = parseParam(params.sort, SORT_VALUES, "trending");
  const q = typeof params.q === "string" ? params.q : "";
  const tag =
    typeof params.tag === "string" && (TAG_SLUGS as string[]).includes(params.tag)
      ? params.tag
      : undefined;
  const requestedPage = parsePage(params.page);

  const {
    user,
    lessons,
    posts,
    postsTotal,
    postsPage,
    graphs,
    graphsTotal,
    graphsPage,
    forkCounts,
    previews,
    tagCounts,
  } = await getExplorePage({ type, q, tag, sort, page: requestedPage });

  // canonical URL for the current filters, varying type and page
  const exploreHref = (toType: (typeof TYPES)[number], page = 1) => {
    const sp = new URLSearchParams();
    if (toType !== "all") sp.set("type", toType);
    if (q) sp.set("q", q);
    if (sort !== "trending") sp.set("sort", sort);
    if (tag) sp.set("tag", tag);
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    return qs ? `/explore?${qs}` : "/explore";
  };

  // lesson numbers stay canonical (creation order) no matter how the
  // current view is filtered — "Lesson 3" is a name, not a list position
  const lessonNumbers = new Map(
    lessons.map((lesson, index) => [lesson.id, index + 1]),
  );
  const filteredLessons = lessons.filter(
    (lesson) =>
      matchesQuery(q, lesson.title, lesson.body) &&
      (!tag || lesson.tags.includes(tag)),
  );
  const pagedLessons = paginate(filteredLessons, requestedPage, LESSONS_PAGE);

  // topic chips only for topics that actually have public content
  const tagChips = TAG_SLUGS.filter((slug) => tagCounts[slug]).map((slug) => ({
    value: slug,
    label: tagLabel(slug),
    count: tagCounts[slug],
  }));

  const showLessonsRail = type === "all" && !q && !tag && lessons.length > 0;
  const showPosts = (type === "all" || type === "posts") && postsTotal > 0;
  const showGraphs = (type === "all" || type === "graphs") && graphsTotal > 0;
  const nothingVisible =
    type === "lessons"
      ? filteredLessons.length === 0
      : !showPosts && !showGraphs;

  const postCard = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      signedIn={!!user}
      forkCount={forkCounts[post.id]}
    />
  );

  return (
    <ListPageShell>
      <ListPageHeader
        title="Explore"
        description="Lessons, write-ups and public graphs from the community — open one to run code against it."
        action={
          <Button asChild>
            <Link href={user ? "/posts/new" : "/login?next=/posts/new"}>
              <PenLine /> Write a post
            </Link>
          </Button>
        }
      />

      {showLessonsRail && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Official lessons
            </h2>
            {lessons.length > LESSONS_CAP && (
              <Link
                href={exploreHref("lessons")}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View all {lessons.length}{" "}
                <ArrowRight className="inline size-3" />
              </Link>
            )}
          </div>
          <div className="mt-3 grid gap-3">
            {lessons.slice(0, LESSONS_CAP).map((lesson) => (
              <PostCard
                key={lesson.id}
                post={lesson}
                signedIn={!!user}
                lessonNumber={lessonNumbers.get(lesson.id)}
                forkCount={forkCounts[lesson.id]}
              />
            ))}
          </div>
        </section>
      )}

      <ListNavProvider>
        <div className="mt-8">
          <ListToolbar
            chips={[
              { value: "all", label: "All" },
              {
                value: "lessons",
                label: "Lessons",
                count: filteredLessons.length,
              },
              { value: "posts", label: "Posts", count: postsTotal },
              { value: "graphs", label: "Graphs", count: graphsTotal },
            ]}
            chipParam="type"
            activeChip={type}
            sorts={EXPLORE_SORTS}
            activeSort={sort}
            defaultSort="trending"
            searchPlaceholder="Search the community…"
            initialQuery={q}
            tagChips={tagChips}
            activeTag={tag}
          />
        </div>

        <PendingOverlay>
          {nothingVisible ? (
            <EmptyStateCard className="mt-6">
              {q || tag
                ? "Nothing matches those filters yet."
                : "Nothing published yet — public posts and graphs show up here for everyone to explore."}
            </EmptyStateCard>
          ) : type === "lessons" ? (
            <section className="mt-6">
              <div className="grid gap-3">
                {pagedLessons.pageItems.map((lesson) => (
                  <PostCard
                    key={lesson.id}
                    post={lesson}
                    signedIn={!!user}
                    lessonNumber={lessonNumbers.get(lesson.id)}
                    forkCount={forkCounts[lesson.id]}
                  />
                ))}
              </div>
              <Pager
                page={pagedLessons.page}
                pageCount={pagedLessons.pageCount}
                prevHref={exploreHref(type, pagedLessons.page - 1)}
                nextHref={exploreHref(type, pagedLessons.page + 1)}
              />
            </section>
          ) : type === "all" ? (
            <>
              {showPosts && (
                <section className="mt-6">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      Community posts
                    </h2>
                    {postsTotal > POSTS_CAP && (
                      <Link
                        href={exploreHref("posts")}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        View all {postsTotal}{" "}
                        <ArrowRight className="inline size-3" />
                      </Link>
                    )}
                  </div>
                  <div className="grid gap-3">{posts.map(postCard)}</div>
                </section>
              )}
              {showGraphs && (
                <section className="mt-6">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      Public graphs
                    </h2>
                    {graphsTotal > GRAPHS_CAP && (
                      <Link
                        href={exploreHref("graphs")}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        View all {graphsTotal}{" "}
                        <ArrowRight className="inline size-3" />
                      </Link>
                    )}
                  </div>
                  <CardGrid>
                    {graphs.map((graph) => (
                      <GraphCard
                        key={graph.id}
                        graph={graph}
                        canDelete={false}
                        signedIn={!!user}
                        preview={previews[graph.id] ?? null}
                        author={graph.author}
                      />
                    ))}
                  </CardGrid>
                </section>
              )}
            </>
          ) : type === "posts" ? (
            <section className="mt-6">
              <div className="grid gap-3">{posts.map(postCard)}</div>
              <Pager
                page={postsPage}
                pageCount={Math.max(1, Math.ceil(postsTotal / POSTS_PAGE))}
                prevHref={exploreHref(type, postsPage - 1)}
                nextHref={exploreHref(type, postsPage + 1)}
              />
            </section>
          ) : (
            <section className="mt-6">
              <CardGrid>
                {graphs.map((graph) => (
                  <GraphCard
                    key={graph.id}
                    graph={graph}
                    canDelete={false}
                    signedIn={!!user}
                    preview={previews[graph.id] ?? null}
                    author={graph.author}
                  />
                ))}
              </CardGrid>
              <Pager
                page={graphsPage}
                pageCount={Math.max(1, Math.ceil(graphsTotal / GRAPHS_PAGE))}
                prevHref={exploreHref(type, graphsPage - 1)}
                nextHref={exploreHref(type, graphsPage + 1)}
              />
            </section>
          )}
        </PendingOverlay>
      </ListNavProvider>
    </ListPageShell>
  );
}
