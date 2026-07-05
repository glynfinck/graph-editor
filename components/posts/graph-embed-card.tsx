import Link from "next/link";
import { CircleDot, Spline } from "lucide-react";

import { GraphLikeButton } from "@/components/graphs/graph-like-button";
import { OpenInProjectDialog } from "@/components/graphs/open-in-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { GraphEmbed } from "@/lib/posts/embeds";

/** A graph link on its own line in a post body renders as this card. */
export function GraphEmbedCard({
  embed,
  signedIn,
  ownProjects,
}: {
  embed: GraphEmbed;
  signedIn: boolean;
  ownProjects: { id: string; name: string }[];
}) {
  return (
    <Card className="mt-4 py-3">
      <CardContent className="flex flex-wrap items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{embed.name}</span>
            {embed.is_sample && <Badge variant="secondary">Sample</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CircleDot className="size-3" /> {embed.nodeCount}
            </span>
            <span className="flex items-center gap-1">
              <Spline className="size-3" /> {embed.edgeCount}
            </span>
            <GraphLikeButton
              graphId={embed.id}
              likeCount={embed.likeCount}
              likedByMe={embed.likedByMe}
              signedIn={signedIn}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/graphs/${embed.id}`}>Open</Link>
          </Button>
          <OpenInProjectDialog
            graphId={embed.id}
            graphName={embed.name}
            signedIn={signedIn}
            projects={ownProjects}
          />
        </div>
      </CardContent>
    </Card>
  );
}
