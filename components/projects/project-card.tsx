"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderCode, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProject } from "@/lib/actions/projects";
import type { Project } from "@/lib/data/projects";
import { formatRelativeTime } from "@/lib/format";

export function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteProject(project.id);
      if (result.ok) {
        setConfirmOpen(false);
        toast.success("Project deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card className="group relative gap-3 transition-colors hover:border-ring/40">
      <CardHeader>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Project actions"
                  className="text-muted-foreground"
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmOpen(true)}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Updated {formatRelativeTime(project.updated_at)}
        </div>
      </CardHeader>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{project.name}”?</DialogTitle>
            <DialogDescription>
              This permanently deletes the project and all of its files.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
