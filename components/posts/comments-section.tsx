"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment, deleteComment } from "@/lib/actions/posts";
import type { PostComment } from "@/lib/data/posts";
import { formatRelativeTime } from "@/lib/format";

const MAX_COMMENT = 2000;

export function CommentsSection({
  postId,
  postOwnerId,
  comments,
  userId,
}: {
  postId: string;
  postOwnerId: string | null;
  comments: PostComment[];
  userId: string | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addComment(postId, body);
      if (result.ok) {
        setBody("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteComment(id);
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  }

  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">
        {comments.length === 0
          ? "Comments"
          : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
      </h2>

      <div className="mt-4 grid gap-4">
        {comments.map((comment) => {
          const name = comment.author?.display_name ?? "Anonymous";
          const canDelete =
            !!userId && (userId === comment.user_id || userId === postOwnerId);
          return (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="mt-0.5 size-7">
                <AvatarImage
                  src={comment.author?.avatar_url ?? undefined}
                  alt={name}
                />
                <AvatarFallback className="text-[10px]">
                  {name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{name}</span>
                  <span>{formatRelativeTime(comment.created_at)}</span>
                  {canDelete && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={() => remove(comment.id)}
                      disabled={pending}
                      className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                  {comment.body}
                </p>
              </div>
            </div>
          );
        })}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing yet — start the conversation.
          </p>
        )}
      </div>

      <div className="mt-6">
        {userId ? (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Textarea
              aria-label="Write a comment"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What did you think?"
              maxLength={MAX_COMMENT}
              className="min-h-20"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {body.length}/{MAX_COMMENT}
              </span>
              <Button size="sm" type="submit" disabled={pending || !body.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <Send />}
                Comment
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/login?next=/posts/${postId}`}>Sign in to comment</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
