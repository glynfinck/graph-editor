import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getDemoWorkspace } from "@/lib/data/demo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demo" };

export default async function ProjectDemoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // signed-in users have real, savable projects — the "sign in to save" demo
  // would only confuse them
  if (user) redirect("/projects");

  const { project, files, graphs, pinnedGraphIds, demoGraphDocs, openPath } =
    await getDemoWorkspace();

  return (
    <ProjectWorkspace
      demo
      project={project}
      initialFiles={files}
      graphs={graphs}
      pinnedGraphIds={pinnedGraphIds}
      demoGraphDocs={demoGraphDocs}
      openPath={openPath ?? undefined}
      forkedFrom={null}
      userId={null}
    />
  );
}
