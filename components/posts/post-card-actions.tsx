"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Globe,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePost, publishPost, unpublishPost } from "@/lib/actions/posts";

/** Owner actions for a post, shared by the library card list and table. */
export function PostCardActions({
  postId,
  isPublished,
}: {
  postId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function publish() {
    startTransition(async () => {
      const result = await publishPost(postId);
      if (result.ok) {
        toast.success(
          "Published — the attached project and its graphs are now public",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function unpublish() {
    startTransition(async () => {
      const result = await unpublishPost(postId);
      if (result.ok) {
        toast.success(
          "Back to draft — anything already made public stays public",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePost(postId);
      if (result.ok) {
        setConfirmOpen(false);
        toast.success("Post deleted");
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
            aria-label="Post actions"
            className="text-muted-foreground"
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/posts/${postId}/edit`}>
              <Pencil /> Edit
            </Link>
          </DropdownMenuItem>
          {isPublished ? (
            <DropdownMenuItem onSelect={unpublish}>
              <Undo2 /> Unpublish
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={publish}>
              <Globe /> Publish
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              The post, its likes and its comments are permanently deleted.
              The attached project and graphs are untouched.
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
