import Link from "next/link";
import { Suspense } from "react";
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
import { CardGridSkeleton } from "@/components/site/skeletons";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGraphPreviews, getRecentOwnGraphs } from "@/lib/data/graphs";
import { getRecentProjects } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 6;

function SectionHeading({
  label,
  href,
  linkLabel,
}: {
  label: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <Link
        href={href}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {linkLabel} <ArrowRight className="inline size-3" />
      </Link>
    </div>
  );
}

async function RecentProjects({ userId }: { userId: string }) {
  const supabase = await createClient();
  const projects = await getRecentProjects(userId, RECENT_LIMIT);
  const previews = await getGraphPreviews(
    supabase,
    projects
      .map((project) => project.active_graph_id)
      .filter((id): id is string => !!id),
  );

  if (projects.length === 0) {
    return (
      <EmptyStateCard className="mt-3">
        No projects yet — create one to edit code and graphs side by side.
      </EmptyStateCard>
    );
  }
  return (
    <CardGrid className="mt-3">
      {projects.map((project) => (
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
  );
}

async function RecentGraphs({ userId }: { userId: string }) {
  const supabase = await createClient();
  const graphs = await getRecentOwnGraphs(userId, RECENT_LIMIT);
  if (graphs.length === 0) return null;
  const previews = await getGraphPreviews(
    supabase,
    graphs.map((graph) => graph.id),
  );

  return (
    <section className="mt-8">
      <SectionHeading
        label="Your graphs"
        href="/library?tab=graphs"
        linkLabel="All graphs"
      />
      <CardGrid className="mt-3">
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
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <MarketingHome />;

  return (
    <ListPageShell>
      <ListPageHeader
        title="Welcome back"
        description="Pick up where you left off, or start something new."
        action={<NewProjectDialog />}
      />

      <section className="mt-8">
        <SectionHeading
          label="Recent projects"
          href="/library?tab=projects"
          linkLabel="All projects"
        />
        <Suspense
          fallback={
            <div className="mt-3">
              <CardGridSkeleton count={3} />
            </div>
          }
        >
          <RecentProjects userId={user.id} />
        </Suspense>
      </section>

      <Suspense
        fallback={
          <section className="mt-8">
            <div className="mt-3">
              <CardGridSkeleton count={3} />
            </div>
          </section>
        }
      >
        <RecentGraphs userId={user.id} />
      </Suspense>

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
