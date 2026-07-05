"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Copy, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { DirectedToggle } from "@/components/editor/directed-toggle";
import { GraphCanvas } from "@/components/editor/graph-canvas";

// EXPERIMENT: WebGL renderer, client-only (needs the DOM/WebGL), lazy-loaded so
// pixi.js stays out of the bundle until you flip to it.
const PixiGraphCanvas = dynamic(
  () => import("@/components/editor/pixi-graph-canvas"),
  { ssr: false },
);
import { GraphLikeButton } from "@/components/graphs/graph-like-button";
import { OpenInProjectDialog } from "@/components/graphs/open-in-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { duplicateGraph, saveGraph } from "@/lib/actions/graphs";
import { useEditorStore } from "@/lib/editor/store";
import { useSaveShortcut, useUnsavedGuard } from "@/lib/editor/workspace-hooks";
import type { GraphDoc } from "@/lib/graph/types";

/**
 * A standalone graph page. Graphs you own are editable here and save in
 * place — drag/add/connect nodes, edit edge weights, toggle directed. Graphs
 * you don't own (samples, other people's) stay read-only, but anyone can
 * duplicate one into their own collection or open it in a project.
 */
export function GraphViewer({
  graph,
  signedIn,
  canEdit,
  ownProjects,
}: {
  graph: {
    id: string;
    name: string;
    description: string;
    is_sample: boolean;
    is_public: boolean;
    directed: boolean;
    doc: GraphDoc;
    likeCount: number;
    likedByMe: boolean;
  };
  signedIn: boolean;
  /** the caller owns this graph (and it isn't a sample) — editing is allowed */
  canEdit: boolean;
  ownProjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [copying, startCopying] = useTransition();
  const [saving, startSaving] = useTransition();
  const [pixi, setPixi] = useState(false); // EXPERIMENT: React Flow ↔ Pixi

  const init = useEditorStore((s) => s.init);
  const name = useEditorStore((s) => s.name);
  const setName = useEditorStore((s) => s.setName);
  const dirty = useEditorStore((s) => s.dirty);

  useEffect(() => {
    init(graph.id, graph.name, graph.description, graph.directed, graph.doc);
    // reset only when opening a different graph
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.id]);

  function save() {
    if (saving) return;
    const editor = useEditorStore.getState();
    startSaving(async () => {
      const result = await saveGraph(graph.id, {
        name: editor.name,
        description: editor.description,
        directed: editor.directed,
        data: editor.toDoc(),
      });
      if (result.ok) {
        editor.markSaved();
        toast.success("Graph saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  // hooks run unconditionally; they're inert when the graph isn't editable
  useSaveShortcut(canEdit ? save : () => {});
  useUnsavedGuard(canEdit && dirty);

  function duplicate() {
    if (!signedIn) {
      router.push(`/login?next=/graphs/${graph.id}`);
      return;
    }
    startCopying(async () => {
      const result = await duplicateGraph(graph.id);
      if (result.ok && result.id) {
        toast.success("Copied to your graphs");
        router.push(`/graphs/${result.id}`);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="icon-sm" aria-label="All graphs" asChild>
          <Link href="/graphs">
            <ArrowLeft />
          </Link>
        </Button>
        {canEdit ? (
          <Input
            aria-label="Graph name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8 w-56 border-transparent bg-transparent font-medium shadow-none hover:border-input"
          />
        ) : (
          <span className="truncate text-sm font-medium">{graph.name}</span>
        )}
        {graph.is_sample ? (
          <Badge variant="secondary">Sample</Badge>
        ) : (
          <Badge variant="outline">
            {graph.is_public ? "Public" : "Private"}
          </Badge>
        )}
        {graph.is_public && (
          <GraphLikeButton
            graphId={graph.id}
            likeCount={graph.likeCount}
            likedByMe={graph.likedByMe}
            signedIn={signedIn}
            className="ml-1"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* EXPERIMENT: flip the renderer to compare performance */}
          <Button
            size="sm"
            variant={pixi ? "secondary" : "ghost"}
            aria-pressed={pixi}
            title="Toggle the experimental WebGL (Pixi) renderer"
            onClick={() => setPixi((v) => !v)}
          >
            <Sparkles />
            {pixi ? "Pixi" : "React Flow"}
          </Button>
          {canEdit && <DirectedToggle />}
          <Button
            size="sm"
            variant="outline"
            onClick={duplicate}
            disabled={copying}
          >
            {copying ? <Loader2 className="animate-spin" /> : <Copy />}
            Duplicate
          </Button>
          <OpenInProjectDialog
            graphId={graph.id}
            graphName={graph.name}
            signedIn={signedIn}
            projects={ownProjects}
          />
          {canEdit && (
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {pixi ? (
          <PixiGraphCanvas editable={canEdit} />
        ) : (
          <GraphCanvas editable={canEdit} showPlayback={false} />
        )}
      </div>
    </div>
  );
}
