"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Globe, Loader2, Save, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { PostBody } from "@/components/posts/post-body";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createPost,
  deletePost,
  publishPost,
  savePost,
  unpublishPost,
} from "@/lib/actions/posts";

export function PostEditor({
  post,
  ownProjects,
}: {
  /** absent = creating a new draft */
  post: {
    id: string;
    title: string;
    body: string;
    project_id: string | null;
    is_published: boolean;
  } | null;
  ownProjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [projectId, setProjectId] = useState<string | null>(
    post?.project_id ?? null,
  );

  const payload = { title, body, projectId };

  function saveDraft() {
    startTransition(async () => {
      const result = post
        ? await savePost(post.id, payload)
        : await createPost(payload);
      if (result.ok && result.id) {
        toast.success(post ? "Post saved" : "Draft created");
        if (post) router.refresh();
        else router.push(`/posts/${result.id}/edit`);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  function publish() {
    if (!post) return;
    startTransition(async () => {
      // persist the latest edits, then flip everything public in one go
      const saved = await savePost(post.id, payload);
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      const result = await publishPost(post.id);
      if (result.ok) {
        toast.success("Published — the attached project and its graphs are now public");
        router.push(`/posts/${post.id}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function unpublish() {
    if (!post) return;
    startTransition(async () => {
      const result = await unpublishPost(post.id);
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
    if (!post) return;
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (result.ok) {
        toast.success("Post deleted");
        router.push("/posts");
      } else {
        toast.error(result.error);
        setConfirmDelete(false);
      }
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="post-title">Title</Label>
        <Input
          id="post-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="How breadth-first search floods a maze"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="post-project">Attached project</Label>
        <Select
          value={projectId ?? "none"}
          onValueChange={(value) => setProjectId(value === "none" ? null : value)}
        >
          <SelectTrigger id="post-project" className="w-full sm:w-80">
            <SelectValue placeholder="No project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No project</SelectItem>
            {ownProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Publishing makes the attached project and its pinned graphs public so
          readers can browse and fork them.
        </p>
      </div>

      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="pt-2">
          <Textarea
            aria-label="Post body (markdown)"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              "Markdown, with GitHub extensions.\n\nPaste a graph or project link on its own line to embed it as a card."
            }
            className="min-h-96 font-mono text-[13px] leading-relaxed"
          />
        </TabsContent>
        <TabsContent value="preview" className="pt-2">
          <div className="rounded-lg border p-6">
            {body.trim() ? (
              <PostBody body={body} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={saveDraft} disabled={pending || !title.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {post ? "Save" : "Create draft"}
        </Button>
        {post &&
          (post.is_published ? (
            <Button variant="outline" onClick={unpublish} disabled={pending}>
              <Undo2 /> Unpublish
            </Button>
          ) : (
            <Button variant="outline" onClick={publish} disabled={pending}>
              <Globe /> Publish
            </Button>
          ))}
        {post && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
          >
            <Trash2 /> Delete
          </Button>
        )}
        {post && (
          <Button variant="ghost" asChild className="ml-auto">
            <Link href={`/posts/${post.id}`}>View post</Link>
          </Button>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              The post, its likes and its comments are permanently deleted.
              The attached project and graphs are untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
