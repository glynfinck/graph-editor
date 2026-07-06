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
import { Pager } from "@/components/site/pager";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getLibrary, type Library } from "@/lib/data/library";
import { formatRelativeTime, readingTimeMinutes } from "@/lib/format";
import {
  LIBRARY_SORTS,
  matchesQuery,
  paginate,
  parseParam,
  parsePage,
  sortLibraryItems,
} from "@/lib/list-filters";

export const metadata: Metadata = { title: "Library" };
export const dynamic = "force-dynamic";

const TABS = ["all", "projects", "graphs", "posts"] as const;
const VIEWS = ["grid", "table"] as const;
const SORT_VALUES = LIBRARY_SORTS.map((sort) => sort.value);

const RECENT_LIMIT = 3;
// per-page sizes for the paginated single-tab views and the table
const GRID_PAGE = 12;
const POSTS_PAGE = 10;
const TABLE_PAGE = 20;
// the combined view shows a preview of each type; "View all" opens the tab
const SECTION_CAP = 6;
const POSTS_CAP = 4;

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

  const { user, projects, graphs, posts, previews, forkSources } =
    await getLibrary();

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
  const libHref = (toTab: (typeof TABS)[number], page = 1) => {
    const sp = new URLSearchParams();
    if (toTab !== "all") sp.set("tab", toTab);
    if (q) sp.set("q", q);
    if (sort !== "updated") sp.set("sort", sort);
    if (view !== "grid") sp.set("view", view);
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  const filteredProjects = sortLibraryItems(
    projects.filter((p) => matchesQuery(q, p.name, p.description)),
    sort,
    (p) => ({ name: p.name, created: p.created_at, updated: p.updated_at, likes: 0 }),
  );
  const filteredGraphs = sortLibraryItems(
    graphs.filter((g) => matchesQuery(q, g.name, g.description)),
    sort,
    (g) => ({
      name: g.name,
      created: g.created_at,
      updated: g.updated_at,
      likes: g.likeCount,
    }),
  );
  const filteredPosts = sortLibraryItems(
    posts.filter((p) => matchesQuery(q, p.title, p.body)),
    sort,
    (p) => ({
      name: p.title,
      created: p.created_at,
      updated: p.updated_at,
      likes: p.likeCount,
    }),
  );

  const showProjects =
    (tab === "all" || tab === "projects") && filteredProjects.length > 0;
  const showGraphs =
    (tab === "all" || tab === "graphs") && filteredGraphs.length > 0;
  const showPosts =
    (tab === "all" || tab === "posts") && filteredPosts.length > 0;
  const nothingVisible = !showProjects && !showGraphs && !showPosts;

  // "jump back in": the most recently touched things, across all types
  const recent = [
    ...projects.map((p) => ({
      id: p.id,
      name: p.name,
      updated: p.updated_at,
      href: `/projects/${p.id}`,
      Icon: FolderCode,
    })),
    ...graphs.map((g) => ({
      id: g.id,
      name: g.name,
      updated: g.updated_at,
      href: `/graphs/${g.id}`,
      Icon: Waypoints,
    })),
    ...posts.map((p) => ({
      id: p.id,
      name: p.title,
      updated: p.updated_at,
      href: p.is_published ? `/posts/${p.id}` : `/posts/${p.id}/edit`,
      Icon: Newspaper,
    })),
  ]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, RECENT_LIMIT);
  const showRecent =
    tab === "all" && view === "grid" && !q && recent.length > 0;

  const rows: LibraryRow[] = sortLibraryItems(
    [
      ...(tab === "all" || tab === "projects"
        ? filteredProjects.map(
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
        ? filteredGraphs.map(
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
        ? filteredPosts.map(
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
  const pagedRows = paginate(rows, requestedPage, TABLE_PAGE);

  const pagedProjects = paginate(filteredProjects, requestedPage, GRID_PAGE);
  const pagedGraphs = paginate(filteredGraphs, requestedPage, GRID_PAGE);
  const pagedPosts = paginate(filteredPosts, requestedPage, POSTS_PAGE);

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

      {showRecent && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            Jump back in
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {recent.map((item) => (
              <Card
                key={item.href}
                className="relative gap-0 py-3 transition-colors hover:border-ring/40"
              >
                <CardHeader className="flex items-center gap-2.5 px-4">
                  <item.Icon className="size-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={item.href}
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
            ))}
          </div>
        </section>
      )}

      <div className="mt-8">
        <ListToolbar
          chips={[
            { value: "all", label: "All" },
            { value: "projects", label: "Projects", count: filteredProjects.length },
            { value: "graphs", label: "Graphs", count: filteredGraphs.length },
            { value: "posts", label: "Posts", count: filteredPosts.length },
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
              Nothing here yet — create a project to edit code and graphs side
              by side.
            </>
          )}
        </EmptyStateCard>
      ) : view === "table" ? (
        <div className="mt-6">
          <LibraryTable rows={pagedRows.pageItems} />
          <Pager
            page={pagedRows.page}
            pageCount={pagedRows.pageCount}
            href={(page) => libHref(tab, page)}
          />
        </div>
      ) : tab === "all" ? (
        <>
          {showProjects && (
            <section className="mt-6">
              <SectionHeading
                label="Projects"
                count={filteredProjects.length}
                cap={SECTION_CAP}
                href={libHref("projects")}
              />
              <CardGrid>
                {filteredProjects.slice(0, SECTION_CAP).map(projectCard)}
              </CardGrid>
            </section>
          )}
          {showGraphs && (
            <section className="mt-6">
              <SectionHeading
                label="Graphs"
                count={filteredGraphs.length}
                cap={SECTION_CAP}
                href={libHref("graphs")}
              />
              <CardGrid>
                {filteredGraphs.slice(0, SECTION_CAP).map((graph) => (
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
                count={filteredPosts.length}
                cap={POSTS_CAP}
                href={libHref("posts")}
              />
              <div className="grid gap-3">
                {filteredPosts.slice(0, POSTS_CAP).map(postCard)}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="mt-6">
          {tab === "projects" && (
            <>
              <CardGrid>{pagedProjects.pageItems.map(projectCard)}</CardGrid>
              <Pager
                page={pagedProjects.page}
                pageCount={pagedProjects.pageCount}
                href={(page) => libHref(tab, page)}
              />
            </>
          )}
          {tab === "graphs" && (
            <>
              <CardGrid>
                {pagedGraphs.pageItems.map((graph) => (
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
                page={pagedGraphs.page}
                pageCount={pagedGraphs.pageCount}
                href={(page) => libHref(tab, page)}
              />
            </>
          )}
          {tab === "posts" && (
            <>
              <div className="grid gap-3">
                {pagedPosts.pageItems.map(postCard)}
              </div>
              <Pager
                page={pagedPosts.page}
                pageCount={pagedPosts.pageCount}
                href={(page) => libHref(tab, page)}
              />
            </>
          )}
        </section>
      )}
    </ListPageShell>
  );
}
