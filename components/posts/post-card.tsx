import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { PostLikeButton } from "@/components/posts/post-like-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Post } from "@/lib/data/posts";
import { excerpt, formatRelativeTime } from "@/lib/format";

export function PostCard({
  post,
  signedIn,
}: {
  post: Post;
  signedIn: boolean;
}) {
  const authorName = post.is_official
    ? "Graph Editor"
    : (post.author?.display_name ?? "Anonymous");

  return (
    <Card className="group relative gap-3 transition-colors hover:border-ring/40">
      <CardHeader>
        <CardTitle className="text-base">
          <Link href={`/posts/${post.id}`} className="hover:underline">
            {/* stretch the click target across the card */}
            <span className="absolute inset-0" aria-hidden />
            {post.title}
          </Link>
        </CardTitle>
        <CardDescription className="mt-1 line-clamp-2">
          {excerpt(post.body) || "No content yet."}
        </CardDescription>
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
          <span className="ml-auto">
            {formatRelativeTime(post.published_at ?? post.updated_at)}
          </span>
        </div>
      </CardHeader>
    </Card>
  );
}
