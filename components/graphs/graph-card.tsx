import Link from "next/link";
import { CircleDot, Spline } from "lucide-react";

import { GraphCardActions } from "@/components/graphs/graph-card-actions";
import { GraphLikeButton } from "@/components/graphs/graph-like-button";
import { GraphThumbnail } from "@/components/graphs/graph-thumbnail";
import { TagBadges } from "@/components/site/tag-badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GraphPreview, GraphSummary } from "@/lib/data/graphs";
import type { PostAuthor } from "@/lib/data/posts";
import { formatRelativeTime } from "@/lib/format";

export function GraphCard({
  graph,
  canDelete,
  signedIn,
  preview,
  author,
}: {
  graph: GraphSummary;
  canDelete: boolean;
  signedIn: boolean;
  /** pass (even null) to render the thumbnail strip */
  preview?: GraphPreview | null;
  /** community attribution on explore cards */
  author?: PostAuthor;
}) {
  const authorName = author?.display_name ?? "Anonymous";

  return (
    <Card className="group relative gap-3 transition-colors hover:border-ring/40">
      <CardHeader>
        {preview !== undefined && (
          <GraphThumbnail preview={preview} className="mb-3 h-24 w-full" />
        )}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              <Link href={`/graphs/${graph.id}`} className="hover:underline">
                {/* stretch the click target across the card */}
                <span className="absolute inset-0" aria-hidden />
                {graph.name}
              </Link>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {graph.description || "No description."}
            </CardDescription>
          </div>
          <div className="relative z-10 -mt-1 -mr-2 flex items-center">
            <GraphCardActions
              graphId={graph.id}
              graphName={graph.name}
              canDelete={canDelete}
              signedIn={signedIn}
              isPublic={canDelete ? graph.is_public : undefined}
              tags={canDelete ? graph.tags : undefined}
            />
          </div>
        </div>
        {graph.tags.length > 0 && (
          <div className="mt-2">
            <TagBadges tags={graph.tags} />
          </div>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {author && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar className="size-4">
                <AvatarImage
                  src={author.avatar_url ?? undefined}
                  alt={authorName}
                />
                <AvatarFallback className="text-[9px]">
                  {authorName.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{authorName}</span>
            </span>
          )}
          {graph.is_sample ? (
            <Badge variant="secondary">Sample</Badge>
          ) : (
            <Badge variant="outline">
              {graph.is_public ? "Public" : "Private"}
            </Badge>
          )}
          <span className="flex items-center gap-1">
            <CircleDot className="size-3" /> {graph.nodeCount}
          </span>
          <span className="flex items-center gap-1">
            <Spline className="size-3" /> {graph.edgeCount}
          </span>
          {graph.is_public && (
            <GraphLikeButton
              graphId={graph.id}
              likeCount={graph.likeCount}
              likedByMe={graph.likedByMe}
              signedIn={signedIn}
              className="relative z-10"
            />
          )}
          {!graph.is_sample && (
            <span className="ml-auto">
              {formatRelativeTime(graph.updated_at)}
            </span>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
