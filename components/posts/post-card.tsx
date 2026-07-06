import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, GitFork, MessageSquare } from "lucide-react";

import { PostLikeButton } from "@/components/posts/post-like-button";
import { TagBadges } from "@/components/site/tag-badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Post } from "@/lib/data/posts";
import { excerpt, formatRelativeTime, readingTimeMinutes } from "@/lib/format";

export function PostCard({
  post,
  signedIn,
  actions,
  forkCount,
  lessonNumber,
}: {
  post: Post;
  signedIn: boolean;
  /** owner menu (library) rendered top-right, above the stretched link */
  actions?: ReactNode;
  /** forks of the attached project, shown when > 0 */
  forkCount?: number;
  /** numbers the official lessons on explore ("Lesson 2") */
  lessonNumber?: number;
}) {
  const authorName = post.is_official
    ? "Graph Editor"
    : (post.author?.display_name ?? "Anonymous");

  return (
    <Card className="group relative gap-3 transition-colors hover:border-ring/40">
      <CardHeader>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              <Link href={`/posts/${post.id}`} className="hover:underline">
                {/* stretch the click target across the card */}
                <span className="absolute inset-0" aria-hidden />
                {lessonNumber !== undefined && (
                  <span className="mr-2 text-muted-foreground">
                    Lesson {lessonNumber}.
                  </span>
                )}
                {post.title}
              </Link>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {excerpt(post.body) || "No content yet."}
            </CardDescription>
          </div>
          {actions && (
            <div className="relative z-10 -mt-1 -mr-2 flex items-center">
              {actions}
            </div>
          )}
        </div>
        {post.tags.length > 0 && (
          <div className="mt-2">
            <TagBadges tags={post.tags} />
          </div>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar className="size-4">
              <AvatarImage
                src={post.author?.avatar_url ?? undefined}
                alt={authorName}
              />
              <AvatarFallback className="text-[9px]">
                {authorName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{authorName}</span>
          </span>
          {post.is_official && <Badge variant="secondary">Official</Badge>}
          {!post.is_published && <Badge variant="outline">Draft</Badge>}
          <PostLikeButton
            postId={post.id}
            likeCount={post.likeCount}
            likedByMe={post.likedByMe}
            signedIn={signedIn}
            className="relative z-10"
          />
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3" /> {post.commentCount}
          </span>
          {forkCount !== undefined && forkCount > 0 && (
            <span className="flex items-center gap-1">
              <GitFork className="size-3" /> {forkCount}
            </span>
          )}
          <span className="hidden items-center gap-1 sm:flex">
            <Clock className="size-3" /> {readingTimeMinutes(post.body)} min
          </span>
          <span className="ml-auto">
            {formatRelativeTime(post.published_at ?? post.updated_at)}
          </span>
        </div>
      </CardHeader>
    </Card>
  );
}
