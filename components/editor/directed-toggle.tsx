"use client";

import { MoveRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/editor/store";

/**
 * Directed/undirected toggle for the graph on the canvas. Shared by every
 * surface that edits a graph (the standalone graph page and the project graph
 * panel) so the control — and anything we add to it — stays identical.
 */
export function DirectedToggle() {
  const directed = useEditorStore((s) => s.directed);
  const setDirected = useEditorStore((s) => s.setDirected);

  return (
    <Button
      variant={directed ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={
        directed
          ? "Directed graph — click to make undirected"
          : "Undirected graph — click to make directed"
      }
      aria-pressed={directed}
      title={directed ? "Directed" : "Undirected"}
      onClick={() => setDirected(!directed)}
    >
      <MoveRight />
    </Button>
  );
}
