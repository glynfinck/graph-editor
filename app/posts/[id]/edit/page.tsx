import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PostEditor } from "@/components/posts/post-editor";
import { getPost } from "@/lib/data/posts";
import { getOwnProjects } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Edit post" };
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [{ user, post }, { projects }] = await Promise.all([
    getPost(id),
    getOwnProjects(),
  ]);
  if (!user) redirect(`/login?next=/posts/${id}/edit`);
  if (!post || post.owner_id !== user.id) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Edit post</h1>
      <div className="mt-8">
        <PostEditor
          post={{
            id: post.id,
            title: post.title,
            body: post.body,
            project_id: post.project_id,
            is_published: post.is_published,
          }}
          ownProjects={projects.map((project) => ({
            id: project.id,
            name: project.name,
          }))}
        />
      </div>
    </div>
  );
}
