import type { Metadata } from "next";
import Link from "next/link";

import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import {
  CardGrid,
  EmptyStateCard,
  ListPageHeader,
  ListPageShell,
} from "@/components/site/list-page";
import { Button } from "@/components/ui/button";
import { getOwnProjects } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { user, projects } = await getOwnProjects();

  return (
    <ListPageShell>
      <ListPageHeader
        title="Projects"
        description="Multi-file Python workspaces — edit code and graphs side by side."
        action={
          user ? (
            <NewProjectDialog />
          ) : (
            <Button asChild>
              <Link href="/login?next=/projects">Sign in to create</Link>
            </Button>
          )
        }
      />

      <section className="mt-8">
        {!user ? (
          <EmptyStateCard>
            Projects are private to your account — sign in to see yours.
          </EmptyStateCard>
        ) : projects.length === 0 ? (
          <EmptyStateCard>
            No projects yet — create one to organize algorithms across multiple
            files.
          </EmptyStateCard>
        ) : (
          <CardGrid>
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </CardGrid>
        )}
      </section>
    </ListPageShell>
  );
}
