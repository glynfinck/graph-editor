import Link from "next/link";
import { ArrowRight, Compass, Newspaper } from "lucide-react";

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
import { getVisibleGraphs } from "@/lib/data/graphs";
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
            href="/projects"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            All projects <ArrowRight className="inline size-3" />
          </Link>
        </div>
        {projects.length === 0 ? (
          <EmptyStateCard className="mt-3">
            No projects yet — create one to edit code and graphs side by side.
          </EmptyStateCard>
        ) : (
          <CardGrid className="mt-3">
            {projects.slice(0, RECENT_LIMIT).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </CardGrid>
        )}
      </section>

      {mine.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Your graphs
            </h2>
            <Link
              href="/graphs"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All graphs <ArrowRight className="inline size-3" />
            </Link>
          </div>
          <CardGrid className="mt-3">
            {mine.slice(0, RECENT_LIMIT).map((graph) => (
              <GraphCard key={graph.id} graph={graph} canDelete signedIn />
            ))}
          </CardGrid>
        </section>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/explore" className="group">
          <Card className="h-full transition-colors group-hover:border-ring/40">
            <CardHeader>
              <Compass className="mb-2 size-5 text-brand" />
              <CardTitle className="text-base">Explore</CardTitle>
              <CardDescription>
                Browse sample and community-published graphs, and run code
                against them.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/posts" className="group">
          <Card className="h-full transition-colors group-hover:border-ring/40">
            <CardHeader>
              <Newspaper className="mb-2 size-5 text-brand" />
              <CardTitle className="text-base">Posts</CardTitle>
              <CardDescription>
                Community write-ups — algorithms explained, graphs to run them
                on, projects to fork.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </section>
    </ListPageShell>
  );
}
