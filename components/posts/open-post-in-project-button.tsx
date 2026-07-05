"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createProjectFromPost } from "@/lib/actions/posts";
import { createClient } from "@/lib/supabase/client";

/**
 * Seeds a project from a post's code + first embedded graph. Auth is checked
 * in the browser at click time (mirrors the old lesson button).
 */
export function OpenPostInProjectButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push(`/login?next=/posts/${postId}`);
        return;
      }
      const result = await createProjectFromPost(postId);
      if (result.ok && result.id) {
        router.push(`/projects/${result.id}`);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button size="sm" onClick={open} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <FolderOpen />}
      Open in a project
    </Button>
  );
}
