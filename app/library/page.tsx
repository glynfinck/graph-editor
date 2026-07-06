import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  FolderCode,
  Newspaper,
  PenLine,
  Waypoints,
} from "lucide-react";

import { GraphCard } from "@/components/graphs/graph-card";
import { NewGraphDialog } from "@/components/graphs/new-graph-dialog";
import {
  LibraryTable,
  type LibraryRow,
} from "@/components/library/library-table";
import { PostCard } from "@/components/posts/post-card";
import { PostCardActions } from "@/components/posts/post-card-actions";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
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
import { Card, CardHeader } from "@/components/ui/card";
import {
  getLibraryPage,
  GRID_PAGE,
  POSTS_CAP,
  POSTS_PAGE,
  SECTION_CAP,
  TABLE_PAGE,
  type Library,
  type RecentItem,
} from "@/lib/data/library";
import { formatRelativeTime, readingTimeMinutes } from "@/lib/format";
import {
  LIBRARY_SORTS,
  parseParam,
  parsePage,
  sortLibraryItems,
} from "@/lib/list-filters";

export const metadata: Metadata = { title: "Library" };
export const dynamic = "force-dynamic";

const TABS = ["all", "projects", "graphs", "posts"] as const;
const VIEWS = ["grid", "table"] as const;
const SORT_VALUES = LIBRARY_SORTS.map((sort) => sort.value);

function SectionHeading({
  label,
  count,
  cap,
  href,
}: {
  label: string;
  count: number;
  cap: number;
  href: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      {count > cap && (
        <Link
          href={href}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          View all {count} <ArrowRight className="inline size-3" />
        </Link>
      )}
    </div>
  );
}

const RECENT_ICONS = {
  project: FolderCode,
  graph: Waypoints,
  post: Newspaper,
} as const;

function recentHref(item: RecentItem): string {
  switch (item.type) {
    case "project":
      return `/projects/${item.id}`;
    case "graph":
      return `/graphs/${item.id}`;
    default:
      return item.isPublished ? `/posts/${item.id}` : `/posts/${item.id}/edit`;
  }
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = parseParam(params.tab, TABS, "all");
  const view = parseParam(params.view, VIEWS, "grid");
  const sort = parseParam(params.sort, SORT_VALUES, "updated");
  const q = typeof params.q === "string" ? params.q : "";
  const requestedPage = parsePage(params.page);

  const {
    user,
    projects,
    projectsTotal,
    graphs,
    graphsTotal,
    posts,
    postsTotal,
    page,
    previews,
    forkSources,
    recent,
  } = await getLibraryPage({ tab, view, sort, q, page: requestedPage });

  if (!user) {
    return (
      <ListPageShell>
        <ListPageHeader
          title="Library"
          description="Your projects, graphs and posts — all in one place."
        />
        <EmptyStateCard className="mt-8">
          <span className="block">
            The library is where your own work lives.{" "}
            <Link
              href="/login?next=/library"
              className="text-brand underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to see yours, try the{" "}
            <Link
              href="/projects/demo"
              className="text-brand underline underline-offset-4"
            >
              interactive demo
            </Link>
            , or{" "}
            <Link
              href="/explore"
              className="text-brand underline underline-offset-4"
            >
              explore what the community has published
            </Link>
            .
          </span>
        </EmptyStateCard>
      </ListPageShell>
    );
  }

  // canonical URL for the current filters, varying tab and page
  const libHref = (toTab: (typeof TABS)[number], toPage = 1) => {
    const sp = new URLSearchParams();
    if (toTab !== "all") sp.set("tab", toTab);
    if (q) sp.set("q", q);
    if (sort !== "updated") sp.set("sort", sort);
    if (view !== "grid") sp.set("view", view);
    if (toPage > 1) sp.set("page", String(toPage));
    const qs = sp.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  const showProjects =
    (tab === "all" || tab === "projects") && projectsTotal > 0;
  const showGraphs = (tab === "all" || tab === "graphs") && graphsTotal > 0;
  const showPosts = (tab === "all" || tab === "posts") && postsTotal > 0;
  const nothingVisible = !showProjects && !showGraphs && !showPosts;

  // table rows for the current tab. On a single tab the slice already IS the
  // requested page; the combined tab interleaves per-type windows that cover
  // everything up to the requested page, then slices after sorting.
  const rows: LibraryRow[] = sortLibraryItems(
    [
      ...(tab === "all" || tab === "projects"
        ? projects.map(
            (p): LibraryRow => ({
              type: "project",
              id: p.id,
              name: p.name,
              href: `/projects/${p.id}`,
              status: p.is_public ? "Public" : "Private",
              meta: p.description || "—",
              likeCount: null,
              updatedAt: p.updated_at,
              createdAt: p.created_at,
            }),
          )
        : []),
      ...(tab === "all" || tab === "graphs"
        ? graphs.map(
            (g): LibraryRow => ({
              type: "graph",
              id: g.id,
              name: g.name,
              href: `/graphs/${g.id}`,
              status: g.is_public ? "Public" : "Private",
              meta: `${g.nodeCount} nodes · ${g.edgeCount} edges`,
              likeCount: g.likeCount,
              updatedAt: g.updated_at,
              createdAt: g.created_at,
              isPublic: g.is_public,
              tags: g.tags,
            }),
          )
        : []),
      ...(tab === "all" || tab === "posts"
        ? posts.map(
            (p): LibraryRow => ({
              type: "post",
              id: p.id,
              name: p.title,
              href: `/posts/${p.id}`,
              status: p.is_published ? "Published" : "Draft",
              meta: `${p.commentCount} comments · ${readingTimeMinutes(p.body)} min read`,
              likeCount: p.likeCount,
              updatedAt: p.updated_at,
              createdAt: p.created_at,
              isPublished: p.is_published,
            }),
          )
        : []),
    ],
    sort,
    (row) => ({
      name: row.name,
      created: row.createdAt,
      updated: row.updatedAt,
      likes: row.likeCount ?? 0,
    }),
  );

  const activeTotal =
    tab === "projects"
      ? projectsTotal
      : tab === "graphs"
        ? graphsTotal
        : tab === "posts"
          ? postsTotal
          : projectsTotal + graphsTotal + postsTotal;
  const tablePageCount = Math.max(1, Math.ceil(activeTotal / TABLE_PAGE));
  const tablePage = tab === "all" ? Math.min(requestedPage, tablePageCount) : page;
  const tableRows =
    tab === "all"
      ? rows.slice((tablePage - 1) * TABLE_PAGE, tablePage * TABLE_PAGE)
      : rows;

  const gridPageCount = (total: number, perPage: number) =>
    Math.max(1, Math.ceil(total / perPage));

  const projectCard = (project: Library["projects"][number]) => (
    <ProjectCard
      key={project.id}
      project={project}
      preview={
        project.active_graph_id
          ? (previews[project.active_graph_id] ?? null)
          : null
      }
      forkedFrom={
        project.forked_from_post_id
          ? forkSources[project.forked_from_post_id]
            ? {
                id: project.forked_from_post_id,
                title: forkSources[project.forked_from_post_id],
              }
            : null
          : null
      }
    />
  );

  const postCard = (post: Library["posts"][number]) => (
    <PostCard
      key={post.id}
      post={post}
      signedIn
      actions={
        <PostCardActions postId={post.id} isPublished={post.is_published} />
      }
    />
  );

  const headerAction =
    tab === "graphs" ? (
      <NewGraphDialog />
    ) : tab === "posts" ? (
      <Button asChild>
        <Link href="/posts/new">
          <PenLine /> Write a post
        </Link>
      </Button>
    ) : (
      <NewProjectDialog />
    );

  return (
    <ListPageShell>
      <ListPageHeader
        title="Library"
        description="Your projects, graphs and posts — manage everything from here."
        action={headerAction}
      />

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            Jump back in
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {recent.map((item) => {
              const Icon = RECENT_ICONS[item.type];
              const href = recentHref(item);
              return (
                <Card
                  key={href}
                  className="relative gap-0 py-3 transition-colors hover:border-ring/40"
                >
                  <CardHeader className="flex items-center gap-2.5 px-4">
                    <Icon className="size-4 shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={href}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        <span className="absolute inset-0" aria-hidden />
                        {item.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(item.updated)}
                      </span>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <ListNavProvider>
        <div className="mt-8">
          <ListToolbar
            chips={[
              { value: "all", label: "All" },
              { value: "projects", label: "Projects", count: projectsTotal },
              { value: "graphs", label: "Graphs", count: graphsTotal },
              { value: "posts", label: "Posts", count: postsTotal },
            ]}
            chipParam="tab"
            activeChip={tab}
            sorts={LIBRARY_SORTS}
            activeSort={sort}
            defaultSort="updated"
            searchPlaceholder="Search your work…"
            initialQuery={q}
            viewToggle
            activeView={view}
          />
        </div>

        <PendingOverlay>
          {nothingVisible ? (
            <EmptyStateCard className="mt-6">
              {q ? (
                <>No matches for “{q}”.</>
              ) : tab === "graphs" ? (
                <>
                  No graphs yet — create one, or duplicate one from{" "}
                  <Link
                    href="/explore"
                    className="text-brand underline underline-offset-4"
                  >
                    Explore
                  </Link>
                  .
                </>
              ) : tab === "posts" ? (
                <>Nothing written yet — share how an algorithm works.</>
              ) : (
                <>
                  Nothing here yet — create a project to edit code and graphs
                  side by side.
                </>
              )}
            </EmptyStateCard>
          ) : view === "table" ? (
            <div className="mt-6">
              <LibraryTable rows={tableRows} />
              <Pager
                page={tablePage}
                pageCount={tablePageCount}
                prevHref={libHref(tab, tablePage - 1)}
                nextHref={libHref(tab, tablePage + 1)}
              />
            </div>
          ) : tab === "all" ? (
            <>
              {showProjects && (
                <section className="mt-6">
                  <SectionHeading
                    label="Projects"
                    count={projectsTotal}
                    cap={SECTION_CAP}
                    href={libHref("projects")}
                  />
                  <CardGrid>{projects.map(projectCard)}</CardGrid>
                </section>
              )}
              {showGraphs && (
                <section className="mt-6">
                  <SectionHeading
                    label="Graphs"
                    count={graphsTotal}
                    cap={SECTION_CAP}
                    href={libHref("graphs")}
                  />
                  <CardGrid>
                    {graphs.map((graph) => (
                      <GraphCard
                        key={graph.id}
                        graph={graph}
                        canDelete
                        signedIn
                        preview={previews[graph.id] ?? null}
                      />
                    ))}
                  </CardGrid>
                </section>
              )}
              {showPosts && (
                <section className="mt-6">
                  <SectionHeading
                    label="Posts"
                    count={postsTotal}
                    cap={POSTS_CAP}
                    href={libHref("posts")}
                  />
                  <div className="grid gap-3">{posts.map(postCard)}</div>
                </section>
              )}
            </>
          ) : (
            <section className="mt-6">
              {tab === "projects" && (
                <>
                  <CardGrid>{projects.map(projectCard)}</CardGrid>
                  <Pager
                    page={page}
                    pageCount={gridPageCount(projectsTotal, GRID_PAGE)}
                    prevHref={libHref(tab, page - 1)}
                    nextHref={libHref(tab, page + 1)}
                  />
                </>
              )}
              {tab === "graphs" && (
                <>
                  <CardGrid>
                    {graphs.map((graph) => (
                      <GraphCard
                        key={graph.id}
                        graph={graph}
                        canDelete
                        signedIn
                        preview={previews[graph.id] ?? null}
                      />
                    ))}
                  </CardGrid>
                  <Pager
                    page={page}
                    pageCount={gridPageCount(graphsTotal, GRID_PAGE)}
                    prevHref={libHref(tab, page - 1)}
                    nextHref={libHref(tab, page + 1)}
                  />
                </>
              )}
              {tab === "posts" && (
                <>
                  <div className="grid gap-3">{posts.map(postCard)}</div>
                  <Pager
                    page={page}
                    pageCount={gridPageCount(postsTotal, POSTS_PAGE)}
                    prevHref={libHref(tab, page - 1)}
                    nextHref={libHref(tab, page + 1)}
                  />
                </>
              )}
            </section>
          )}
        </PendingOverlay>
      </ListNavProvider>
    </ListPageShell>
  );
}
