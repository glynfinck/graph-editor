"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { deleteProject, renameProject } from "@/lib/actions/projects";

/** Owner actions for a project, shared by the card grid and the table view. */
export function ProjectCardActions({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(projectName);
  const [pending, startTransition] = useTransition();

  function rename() {
    startTransition(async () => {
      const result = await renameProject(projectId, newName);
      if (result.ok) {
        setRenameOpen(false);
        toast.success("Project renamed");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteProject(projectId);
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
    <>
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
            onSelect={() => {
              setNewName(projectName);
              setRenameOpen(true);
            }}
          >
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename “{projectName}”</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              rename();
            }}
          >
            <Input
              aria-label="Project name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={120}
              required
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{projectName}”?</DialogTitle>
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
    </>
  );
}
