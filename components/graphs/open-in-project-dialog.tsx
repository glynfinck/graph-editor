"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderOpen, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createProject, setProjectActiveGraph } from "@/lib/actions/projects";

/**
 * Graphs are edited inside a project workspace — this dialog gets a graph
 * there, either as an existing project's test graph or by spinning up a new
 * project around it.
 */
export function OpenInProjectDialog({
  graphId,
  graphName,
  signedIn,
  projects,
}: {
  graphId: string;
  graphName: string;
  signedIn: boolean;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Button size="sm" asChild>
        <Link href={`/login?next=/graphs/${graphId}`}>
          Sign in to open in a project
        </Link>
      </Button>
    );
  }

  function openInExisting(projectId: string) {
    startTransition(async () => {
      const result = await setProjectActiveGraph(projectId, graphId);
      if (result.ok) {
        setOpen(false);
        router.push(`/projects/${projectId}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function openInNew() {
    startTransition(async () => {
      const result = await createProject({
        name: graphName.slice(0, 120),
        activeGraphId: graphId,
      });
      if (result.ok && result.id) {
        setOpen(false);
        router.push(`/projects/${result.id}`);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FolderOpen /> Open in a project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open in a project</DialogTitle>
          <DialogDescription>
            Pick a project to use “{graphName}” as its test graph — projects
            are where graphs are edited.
          </DialogDescription>
        </DialogHeader>
        {projects.length > 0 && (
          <div className="grid max-h-64 gap-1 overflow-y-auto">
            {projects.map((project) => (
              <Button
                key={project.id}
                variant="ghost"
                className="justify-start"
                disabled={pending}
                onClick={() => openInExisting(project.id)}
              >
                <FolderOpen className="text-muted-foreground" />
                <span className="truncate">{project.name}</span>
              </Button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={openInNew}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            New project with this graph
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
