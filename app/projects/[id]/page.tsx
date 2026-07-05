import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getProjectWorkspace } from "@/lib/data/projects";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { user, project, files, graphs, pinnedGraphIds, forkedFrom } =
    await getProjectWorkspace(id);
  if (!project) notFound();

  return (
    <ProjectWorkspace
      project={project}
      initialFiles={files.map((file) => ({
        path: file.path,
        content: file.content,
      }))}
      graphs={graphs}
      pinnedGraphIds={pinnedGraphIds}
      forkedFrom={forkedFrom}
      userId={user?.id ?? null}
    />
  );
}
