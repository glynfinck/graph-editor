"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Copy,
  Globe,
  Loader2,
  Lock,
  MoreVertical,
  Pencil,
  Tags,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { TagPicker } from "@/components/site/tag-picker";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  deleteGraph,
  duplicateGraph,
  renameGraph,
  setGraphTags,
  setGraphVisibility,
} from "@/lib/actions/graphs";

export function GraphCardActions({
  graphId,
  graphName,
  canDelete,
  signedIn,
  isPublic,
  tags,
}: {
  graphId: string;
  graphName: string;
  /** the caller owns this graph (rename/delete are owner-only) */
  canDelete: boolean;
  signedIn: boolean;
  /** when provided (owner views), the menu offers a public/private toggle */
  isPublic?: boolean;
  /** when provided (owner views), the menu offers tag editing */
  tags?: string[];
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [newName, setNewName] = useState(graphName);
  const [newTags, setNewTags] = useState<string[]>(tags ?? []);
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

  function toggleVisibility() {
    startTransition(async () => {
      const result = await setGraphVisibility(graphId, !isPublic);
      if (result.ok) {
        toast.success(
          isPublic
            ? "Graph is private again"
            : "Graph is public — it now shows up in Explore",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function saveTags() {
    startTransition(async () => {
      const result = await setGraphTags(graphId, newTags);
      if (result.ok) {
        setTagsOpen(false);
        toast.success("Tags updated");
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
          {canDelete && tags !== undefined && (
            <DropdownMenuItem
              onSelect={() => {
                setNewTags(tags);
                setTagsOpen(true);
              }}
            >
              <Tags /> Edit tags
            </DropdownMenuItem>
          )}
          {canDelete && isPublic !== undefined && (
            <DropdownMenuItem onSelect={toggleVisibility}>
              {isPublic ? (
                <>
                  <Lock /> Make private
                </>
              ) : (
                <>
                  <Globe /> Make public
                </>
              )}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tags for “{graphName}”</DialogTitle>
            <DialogDescription>
              Topics help people find this graph in Explore.
            </DialogDescription>
          </DialogHeader>
          <TagPicker value={newTags} onChange={setNewTags} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTagsOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveTags} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
