import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PostEditor } from "@/components/posts/post-editor";
import { getOwnProjects } from "@/lib/data/projects";

export const metadata: Metadata = { title: "New post" };
export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const { user, projects } = await getOwnProjects();
  if (!user) redirect("/login?next=/posts/new");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">New post</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Markdown with GitHub extensions. Paste a graph or project link on its
        own line to embed it.
      </p>
      <div className="mt-8">
        <PostEditor
          post={null}
          ownProjects={projects.map((project) => ({
            id: project.id,
            name: project.name,
          }))}
        />
      </div>
    </div>
  );
}
