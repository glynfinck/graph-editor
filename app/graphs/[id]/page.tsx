import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GraphViewer } from "@/components/editor/graph-viewer";
import { getGraph } from "@/lib/data/graphs";
import { getOwnProjects } from "@/lib/data/projects";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Graph" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GraphPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [{ user, graph }, { projects }] = await Promise.all([
    getGraph(id),
    getOwnProjects(),
  ]);
  if (!graph) notFound();

  // you can edit a graph you own (samples are ownerless and immutable)
  const canEdit = !!user && graph.owner_id === user.id && !graph.is_sample;

  return (
    <GraphViewer
      graph={{
        id: graph.id,
        name: graph.name,
        description: graph.description,
        is_sample: graph.is_sample,
        is_public: graph.is_public,
        directed: graph.directed,
        doc: graph.doc,
        likeCount: graph.likeCount,
        likedByMe: graph.likedByMe,
      }}
      signedIn={!!user}
      canEdit={canEdit}
      ownProjects={projects.map((project) => ({
        id: project.id,
        name: project.name,
      }))}
    />
  );
}
