"use client";

import { AttributesEditor } from "@/components/editor/attributes-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditorStore } from "@/lib/editor/store";

/**
 * Floating panel for the selected edge: set its weight, label, and attribute
 * bag. Weight/label live on the edge (not the graph), so a plain edge just
 * leaves them empty. Subscribes by id so edits re-render it without re-reading
 * the whole canvas.
 */
export function EdgeInspector({
  edgeId,
  directed,
}: {
  edgeId: string;
  directed: boolean;
}) {
  const edge = useEditorStore((s) => s.edges.find((e) => e.id === edgeId));
  const nodes = useEditorStore((s) => s.nodes);
  const setEdgeWeight = useEditorStore((s) => s.setEdgeWeight);
  const setEdgeName = useEditorStore((s) => s.setEdgeName);
  const setEdgeAttr = useEditorStore((s) => s.setEdgeAttr);
  const renameEdgeAttr = useEditorStore((s) => s.renameEdgeAttr);
  const removeEdgeAttr = useEditorStore((s) => s.removeEdgeAttr);

  if (!edge) return null;

  const nameOf = (id: string) =>
    nodes.find((node) => node.id === id)?.data.name ?? "?";
  const weight = edge.data?.weight ?? null;
  const name = edge.data?.name ?? "";

  return (
    <div className="w-64 rounded-lg border bg-background/95 p-3 shadow-md backdrop-blur">
      <div className="mb-2 flex items-center gap-1 text-xs font-medium">
        <span className="min-w-0 flex-1 truncate">{nameOf(edge.source)}</span>
        <span className="shrink-0 text-muted-foreground">
          {directed ? "→" : "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-right">
          {nameOf(edge.target)}
        </span>
      </div>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label
              htmlFor="edge-weight"
              className="text-xs text-muted-foreground"
            >
              Weight
            </Label>
            <Input
              id="edge-weight"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className="h-7"
              placeholder="unweighted"
              value={weight ?? ""}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (raw === "") {
                  setEdgeWeight(edge.id, null);
                  return;
                }
                const parsed = Number(raw);
                if (Number.isFinite(parsed) && parsed >= 0) {
                  setEdgeWeight(edge.id, parsed);
                }
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="edge-name" className="text-xs text-muted-foreground">
              Label
            </Label>
            <Input
              id="edge-name"
              maxLength={40}
              className="h-7"
              placeholder="none"
              value={name}
              onChange={(event) =>
                setEdgeName(edge.id, event.target.value || null)
              }
            />
          </div>
        </div>
        <AttributesEditor
          key={edge.id}
          attributes={edge.data?.attributes ?? {}}
          onSet={(key, value) => setEdgeAttr(edge.id, key, value)}
          onRename={(oldKey, newKey) => renameEdgeAttr(edge.id, oldKey, newKey)}
          onRemove={(key) => removeEdgeAttr(edge.id, key)}
        />
      </div>
    </div>
  );
}
