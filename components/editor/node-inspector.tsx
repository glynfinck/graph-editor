"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditorStore } from "@/lib/editor/store";

/**
 * Floating panel for the selected node — the node counterpart to the edge
 * inspector. Edits the node's name (its on-canvas label). Subscribes by id so
 * edits re-render it without re-reading the whole canvas.
 */
export function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useEditorStore((s) => s.nodes.find((n) => n.id === nodeId));
  const setNodeName = useEditorStore((s) => s.setNodeName);

  if (!node) return null;

  return (
    <div className="w-52 rounded-lg border bg-background/95 p-3 shadow-md backdrop-blur">
      <div className="mb-2 text-xs font-medium">Node</div>
      <div className="grid gap-1">
        <Label htmlFor="node-name" className="text-xs text-muted-foreground">
          Name
        </Label>
        <Input
          id="node-name"
          maxLength={40}
          className="h-7"
          placeholder="Name"
          value={node.data.name}
          onChange={(event) => setNodeName(node.id, event.target.value)}
        />
      </div>
    </div>
  );
}
