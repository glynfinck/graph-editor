import Link from "next/link";
import { ArrowRight, Compass, LibraryBig } from "lucide-react";

import { GraphCard } from "@/components/graphs/graph-card";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import {
  CardGrid,
  EmptyStateCard,
  ListPageHeader,
  ListPageShell,
} from "@/components/site/list-page";
import { MarketingHome } from "@/components/site/marketing-home";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGraphPreviews, getVisibleGraphs } from "@/lib/data/graphs";
import { getOwnProjects } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 6;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <MarketingHome />;

  const [{ projects }, { mine }] = await Promise.all([
    getOwnProjects(),
    getVisibleGraphs(),
  ]);

  const recentProjects = projects.slice(0, RECENT_LIMIT);
  const recentGraphs = mine.slice(0, RECENT_LIMIT);
  const previews = await getGraphPreviews(supabase, [
    ...recentGraphs.map((graph) => graph.id),
    ...recentProjects
      .map((project) => project.active_graph_id)
      .filter((id): id is string => !!id),
  ]);

  return (
    <ListPageShell>
      <ListPageHeader
        title="Welcome back"
        description="Pick up where you left off, or start something new."
        action={<NewProjectDialog />}
      />

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent projects
          </h2>
          <Link
            href="/library?tab=projects"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            All projects <ArrowRight className="inline size-3" />
          </Link>
        </div>
        {recentProjects.length === 0 ? (
          <EmptyStateCard className="mt-3">
            No projects yet — create one to edit code and graphs side by side.
          </EmptyStateCard>
        ) : (
          <CardGrid className="mt-3">
            {recentProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                preview={
                  project.active_graph_id
                    ? (previews[project.active_graph_id] ?? null)
                    : null
                }
              />
            ))}
          </CardGrid>
        )}
      </section>

      {recentGraphs.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Your graphs
            </h2>
            <Link
              href="/library?tab=graphs"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All graphs <ArrowRight className="inline size-3" />
            </Link>
          </div>
          <CardGrid className="mt-3">
            {recentGraphs.map((graph) => (
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

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/library" className="group">
          <Card className="h-full transition-colors group-hover:border-ring/40">
            <CardHeader>
              <LibraryBig className="mb-2 size-5 text-brand" />
              <CardTitle className="text-base">Library</CardTitle>
              <CardDescription>
                Everything you&apos;ve made — projects, graphs and posts, with
                search and quick management.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/explore" className="group">
          <Card className="h-full transition-colors group-hover:border-ring/40">
            <CardHeader>
              <Compass className="mb-2 size-5 text-brand" />
              <CardTitle className="text-base">Explore</CardTitle>
              <CardDescription>
                Lessons, community write-ups and public graphs — run code
                against them or fork them into your own projects.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </section>
    </ListPageShell>
  );
}
