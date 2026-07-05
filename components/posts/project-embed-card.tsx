import { FileCode, FolderOpen } from "lucide-react";

import { ForkButton } from "@/components/posts/fork-button";
import { Card, CardContent } from "@/components/ui/card";
import type { ProjectEmbed } from "@/lib/posts/embeds";

/**
 * A project link on its own line renders as this card. Forking goes through
 * the post (lineage), so the button needs the post id.
 */
export function ProjectEmbedCard({
  embed,
  postId,
  canFork,
  signedIn,
}: {
  embed: ProjectEmbed;
  postId: string;
  /** forking only works for the post's own attached project */
  canFork: boolean;
  signedIn: boolean;
}) {
  return (
    <Card className="mt-4 py-3">
      <CardContent className="flex flex-wrap items-center gap-3 px-4">
        <FolderOpen className="size-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{embed.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <FileCode className="size-3" /> {embed.fileCount}{" "}
            {embed.fileCount === 1 ? "file" : "files"}
            {embed.description && (
              <span className="truncate">· {embed.description}</span>
            )}
          </div>
        </div>
        {canFork && <ForkButton postId={postId} signedIn={signedIn} />}
      </CardContent>
    </Card>
  );
}
