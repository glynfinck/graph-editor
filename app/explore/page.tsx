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
import { Pager } from "@/components/site/pager";
import { Button } from "@/components/ui/button";
import { getExplore } from "@/lib/data/explore";
import type { Post } from "@/lib/data/posts";
import {
  EXPLORE_SORTS,
  matchesQuery,
  paginate,
  parseParam,
  parsePage,
  trendingScore,
  type ExploreSort,
} from "@/lib/list-filters";
import { TAG_SLUGS, tagLabel } from "@/lib/tags";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

const TYPES = ["all", "lessons", "posts", "graphs"] as const;
const SORT_VALUES = EXPLORE_SORTS.map((sort) => sort.value);

// per-page sizes for the single-type views
const LESSONS_PAGE = 10;
const POSTS_PAGE = 10;
const GRAPHS_PAGE = 12;
// the combined view previews each type; "View all" opens the type filter
const LESSONS_CAP = 4;
const POSTS_CAP = 5;
const GRAPHS_CAP = 9;

function sortPosts(posts: Post[], sort: ExploreSort): Post[] {
  const sorted = [...posts];
  switch (sort) {
    case "likes":
      return sorted.sort((a, b) => b.likeCount - a.likeCount);
    case "trending":
      return sorted.sort(
        (a, b) =>
          trendingScore(b.likeCount, b.published_at) -
          trendingScore(a.likeCount, a.published_at),
      );
    default:
      return sorted; // already published_at desc
  }
}

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

  const { user, graphs, posts, lessons, forkCounts, previews } =
    await getExplore();

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

  const filteredPosts = sortPosts(
    posts.filter(
      (post) =>
        matchesQuery(q, post.title, post.body) &&
        (!tag || post.tags.includes(tag)),
    ),
    sort,
  );

  const filteredGraphsRaw = graphs.filter(
    (graph) =>
      matchesQuery(q, graph.name, graph.description) &&
      (!tag || graph.tags.includes(tag)),
  );
  const filteredGraphs =
    sort === "likes"
      ? [...filteredGraphsRaw].sort((a, b) => b.likeCount - a.likeCount)
      : sort === "trending"
        ? [...filteredGraphsRaw].sort(
            (a, b) =>
              trendingScore(b.likeCount, b.updated_at) -
              trendingScore(a.likeCount, a.updated_at),
          )
        : filteredGraphsRaw; // already updated_at desc

  const pagedLessons = paginate(filteredLessons, requestedPage, LESSONS_PAGE);
  const pagedPosts = paginate(filteredPosts, requestedPage, POSTS_PAGE);
  const pagedGraphs = paginate(filteredGraphs, requestedPage, GRAPHS_PAGE);

  // topic chips only for topics that actually have public content
  const tagCounts = new Map<string, number>();
  for (const post of posts) {
    for (const slug of post.tags) {
      tagCounts.set(slug, (tagCounts.get(slug) ?? 0) + 1);
    }
  }
  for (const graph of graphs) {
    for (const slug of graph.tags) {
      tagCounts.set(slug, (tagCounts.get(slug) ?? 0) + 1);
    }
  }
  const tagChips = TAG_SLUGS.filter((slug) => tagCounts.has(slug)).map(
    (slug) => ({
      value: slug,
      label: tagLabel(slug),
      count: tagCounts.get(slug),
    }),
  );

  const showLessonsRail = type === "all" && !q && !tag && lessons.length > 0;
  const showPosts =
    (type === "all" || type === "posts") && filteredPosts.length > 0;
  const showGraphs =
    (type === "all" || type === "graphs") && filteredGraphs.length > 0;
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

      <div className="mt-8">
        <ListToolbar
          chips={[
            { value: "all", label: "All" },
            {
              value: "lessons",
              label: "Lessons",
              count: filteredLessons.length,
            },
            { value: "posts", label: "Posts", count: filteredPosts.length },
            { value: "graphs", label: "Graphs", count: filteredGraphs.length },
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
            href={(page) => exploreHref(type, page)}
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
                {filteredPosts.length > POSTS_CAP && (
                  <Link
                    href={exploreHref("posts")}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View all {filteredPosts.length}{" "}
                    <ArrowRight className="inline size-3" />
                  </Link>
                )}
              </div>
              <div className="grid gap-3">
                {filteredPosts.slice(0, POSTS_CAP).map(postCard)}
              </div>
            </section>
          )}
          {showGraphs && (
            <section className="mt-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Public graphs
                </h2>
                {filteredGraphs.length > GRAPHS_CAP && (
                  <Link
                    href={exploreHref("graphs")}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View all {filteredGraphs.length}{" "}
                    <ArrowRight className="inline size-3" />
                  </Link>
                )}
              </div>
              <CardGrid>
                {filteredGraphs.slice(0, GRAPHS_CAP).map((graph) => (
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
          <div className="grid gap-3">
            {pagedPosts.pageItems.map(postCard)}
          </div>
          <Pager
            page={pagedPosts.page}
            pageCount={pagedPosts.pageCount}
            href={(page) => exploreHref(type, page)}
          />
        </section>
      ) : (
        <section className="mt-6">
          <CardGrid>
            {pagedGraphs.pageItems.map((graph) => (
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
            page={pagedGraphs.page}
            pageCount={pagedGraphs.pageCount}
            href={(page) => exploreHref(type, page)}
          />
        </section>
      )}
    </ListPageShell>
  );
}
