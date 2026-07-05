"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { GitFork, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { forkPostProject } from "@/lib/actions/posts";

/** Copies the post's attached project — files and graphs — into your account. */
export function ForkButton({
  postId,
  signedIn,
}: {
  postId: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function fork() {
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    startTransition(async () => {
      const result = await forkPostProject(postId);
      if (result.ok && result.id) {
        toast.success("Forked — the copy is all yours");
        router.push(`/projects/${result.id}`);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button size="sm" onClick={fork} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <GitFork />}
      Fork project
    </Button>
  );
}
