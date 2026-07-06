"use client";

import { MoveRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tip";
import { useEditorStore } from "@/lib/editor/store";

/**
 * Directed/undirected toggle for the graph on the canvas. Shared by every
 * surface that edits a graph (the standalone graph page and the project graph
 * panel) so the control — and anything we add to it — stays identical.
 */
export function DirectedToggle() {
  const directed = useEditorStore((s) => s.directed);
  const setDirected = useEditorStore((s) => s.setDirected);

  const label = directed
    ? "Directed graph — click to make undirected"
    : "Undirected graph — click to make directed";
  return (
    <Tip label={label}>
      <Button
        variant={directed ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label={label}
        aria-pressed={directed}
        onClick={() => setDirected(!directed)}
      >
        <MoveRight />
      </Button>
    </Tip>
  );
}
