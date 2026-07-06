import Link from "next/link";
import { FolderCode, GitFork } from "lucide-react";

import { GraphThumbnail } from "@/components/graphs/graph-thumbnail";
import { ProjectCardActions } from "@/components/projects/project-card-actions";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GraphPreview } from "@/lib/data/graphs";
import type { Project } from "@/lib/data/projects";
import { formatRelativeTime } from "@/lib/format";

export function ProjectCard({
  project,
  preview,
  forkedFrom,
}: {
  project: Project;
  /** the active test graph's thumbnail; pass (even null) to render the strip */
  preview?: GraphPreview | null;
  /** the source post, when this project was forked from one */
  forkedFrom?: { id: string; title: string } | null;
}) {
  return (
    <Card className="group relative gap-3 transition-colors hover:border-ring/40">
      <CardHeader>
        {preview !== undefined && (
          <GraphThumbnail preview={preview} className="mb-3 h-24 w-full" />
        )}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 truncate text-base">
              <FolderCode className="size-4 shrink-0 text-brand" />
              <Link
                href={`/projects/${project.id}`}
                className="truncate hover:underline"
              >
                <span className="absolute inset-0" aria-hidden />
                {project.name}
              </Link>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {project.description || "No description."}
            </CardDescription>
          </div>
          <div className="relative z-10 -mt-1 -mr-2">
            <ProjectCardActions
              projectId={project.id}
              projectName={project.name}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {project.forked_from_post_id &&
            (forkedFrom ? (
              <Link
                href={`/posts/${forkedFrom.id}`}
                className="relative z-10 flex min-w-0 items-center gap-1 hover:text-foreground"
              >
                <GitFork className="size-3 shrink-0" />
                <span className="truncate">
                  Forked from “{forkedFrom.title}”
                </span>
              </Link>
            ) : (
              <span className="flex items-center gap-1">
                <GitFork className="size-3" /> Forked
              </span>
            ))}
          <span className="ml-auto shrink-0">
            Updated {formatRelativeTime(project.updated_at)}
          </span>
        </div>
      </CardHeader>
    </Card>
  );
}
