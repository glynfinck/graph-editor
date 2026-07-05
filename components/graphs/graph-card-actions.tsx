"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
import { deleteGraph, duplicateGraph, renameGraph } from "@/lib/actions/graphs";

export function GraphCardActions({
  graphId,
  graphName,
  canDelete,
  signedIn,
}: {
  graphId: string;
  graphName: string;
  /** the caller owns this graph (rename/delete are owner-only) */
  canDelete: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(graphName);
  const [pending, startTransition] = useTransition();

  function duplicate() {
    if (!signedIn) {
      router.push(`/login?next=/graphs`);
      return;
    }
    startTransition(async () => {
      const result = await duplicateGraph(graphId);
      if (result.ok && result.id) {
        toast.success("Copied to your graphs");
        router.push(`/graphs/${result.id}`);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  function rename() {
    startTransition(async () => {
      const result = await renameGraph(graphId, newName);
      if (result.ok) {
        setRenameOpen(false);
        toast.success("Graph renamed");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteGraph(graphId);
      if (result.ok) {
        setConfirmOpen(false);
        toast.success("Graph deleted");
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
            aria-label="Graph actions"
            className="text-muted-foreground"
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem
              onSelect={() => {
                setNewName(graphName);
                setRenameOpen(true);
              }}
            >
              <Pencil /> Rename
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename “{graphName}”</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              rename();
            }}
          >
            <Input
              aria-label="Graph name"
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
            <DialogTitle>Delete “{graphName}”?</DialogTitle>
            <DialogDescription>
              This permanently deletes the graph. There is no undo.
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
