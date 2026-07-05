import Link from "next/link";
import { CircleDot, Spline } from "lucide-react";

import { GraphCardActions } from "@/components/graphs/graph-card-actions";
import { GraphLikeButton } from "@/components/graphs/graph-like-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GraphSummary } from "@/lib/data/graphs";
import { formatRelativeTime } from "@/lib/format";

export function GraphCard({
  graph,
  canDelete,
  signedIn,
}: {
  graph: GraphSummary;
  canDelete: boolean;
  signedIn: boolean;
}) {
  return (
    <Card className="group relative gap-3 transition-colors hover:border-ring/40">
      <CardHeader>
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
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
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
