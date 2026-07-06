import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { AttachedProjectCard } from "@/components/posts/attached-project-card";
import { CommentsSection } from "@/components/posts/comments-section";
import { OpenPostInProjectButton } from "@/components/posts/open-post-in-project-button";
import { PostBody } from "@/components/posts/post-body";
import { PostLikeButton } from "@/components/posts/post-like-button";
import { TagBadges } from "@/components/site/tag-badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPost, getPostEmbeds, getPostProject } from "@/lib/data/posts";
import { getOwnProjects } from "@/lib/data/projects";
import { formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Post" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { user, post, comments } = await getPost(id);
  if (!post) notFound();

  const [embeds, attachedProject, { projects: ownProjects }] =
    await Promise.all([
      getPostEmbeds(post.body, user?.id ?? null),
      post.project_id ? getPostProject(post.project_id) : Promise.resolve(null),
      getOwnProjects(),
    ]);

  const isOwner = !!user && post.owner_id === user.id;
  const authorName = post.is_official
    ? "Graph Editor"
    : (post.author?.display_name ?? "Anonymous");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/explore?type=posts">
            <ArrowLeft /> All posts
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {post.is_published &&
            !post.project_id &&
            Object.keys(embeds.graphs).length > 0 && (
              <OpenPostInProjectButton postId={post.id} />
            )}
          {isOwner && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/posts/${post.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
        </div>
      </div>

      <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-balance">
        {post.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarImage
              src={post.author?.avatar_url ?? undefined}
              alt={authorName}
            />
            <AvatarFallback className="text-[10px]">
              {authorName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {authorName}
        </span>
        {post.is_official && <Badge variant="secondary">Official</Badge>}
        {!post.is_published && <Badge variant="outline">Draft</Badge>}
        {post.tags.length > 0 && <TagBadges tags={post.tags} max={4} />}
        <span>{formatRelativeTime(post.published_at ?? post.updated_at)}</span>
        <PostLikeButton
          postId={post.id}
          likeCount={post.likeCount}
          likedByMe={post.likedByMe}
          signedIn={!!user}
          className="text-sm [&_svg]:size-3.5"
        />
      </div>

      <PostBody
        body={post.body}
        postId={post.id}
        embeds={embeds}
        ownProjects={ownProjects.map((project) => ({
          id: project.id,
          name: project.name,
        }))}
        signedIn={!!user}
        attachedProjectId={post.project_id}
        className="mt-8"
      />

      {attachedProject && post.is_published && (
        <AttachedProjectCard
          postId={post.id}
          project={attachedProject}
          signedIn={!!user}
        />
      )}

      {post.is_published && (
        <CommentsSection
          postId={post.id}
          postOwnerId={post.owner_id}
          comments={comments}
          userId={user?.id ?? null}
        />
      )}
    </div>
  );
}
