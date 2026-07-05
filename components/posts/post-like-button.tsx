"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { togglePostLike } from "@/lib/actions/posts";
import { cn } from "@/lib/utils";

/** Heart toggle for posts — same optimistic shape as the graph one. */
export function PostLikeButton({
  postId,
  likeCount,
  likedByMe,
  signedIn,
  className,
}: {
  postId: string;
  likeCount: number;
  likedByMe: boolean;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic({
    count: likeCount,
    liked: likedByMe,
  });

  function toggle() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    startTransition(async () => {
      setOptimistic((state) => ({
        count: state.count + (state.liked ? -1 : 1),
        liked: !state.liked,
      }));
      const result = await togglePostLike(postId);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={optimistic.liked ? "Unlike this post" : "Like this post"}
      aria-pressed={optimistic.liked}
      className={cn(
        "flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
        optimistic.liked && "text-brand hover:text-brand",
        className,
      )}
    >
      <Heart
        className={cn("size-3", optimistic.liked && "fill-current")}
        aria-hidden
      />
      {optimistic.count}
    </button>
  );
}
