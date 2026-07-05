"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { GraphFlowNode } from "@/lib/editor/store";
import { cn } from "@/lib/utils";

/** Node circle diameter in px (size-14). Floating edges trim to its radius. */
export const NODE_DIAMETER = 56;

/** Selector for the part of the node that moves it when dragged. */
export const NODE_DRAG_HANDLE = ".node-drag";

/**
 * A node on the canvas. The whole rim is a connection handle (drag from the
 * edge of a node to another node to connect); the inner body is the drag
 * handle that moves the node. `visual` / `isCurrent` are driven by playback.
 */
export const GraphNode = memo(function GraphNode({
  data,
  selected,
}: NodeProps<GraphFlowNode>) {
  const visual = data.visual ?? "idle";
  const name = data.name;
  // Short names (A, SFO, USD) sit inside the circle — the classic look. Longer
  // names would be clipped, so they render as a caption below instead. The
  // caption is out of normal flow (absolute), so the node's measured box stays
  // the 56px circle and the floating edges keep anchoring to the true rim.
  const inside = name.length <= 4;

  return (
    <div
      title={name}
      className={cn(
        "group relative size-14 rounded-full border-2 font-bold transition-all duration-150 ease-out",
        visual === "idle" && "border-graph-node-border bg-graph-node",
        visual === "visited" && "border-graph-visited-border bg-graph-visited",
        visual === "path" &&
          "border-graph-path bg-graph-path-fill text-stone-900",
        data.isCurrent &&
          "scale-110 !border-graph-current ring-4 ring-graph-current/30",
        selected && "outline-2 outline-offset-2 outline-ring",
      )}
    >
      {/* Connection handle: sized to size-16 (64px = the 56px node + 4px each
          side) and pulled out to -inset-1 so the connect cursor/zone lines up
          with the hover ring below. The explicit size is required — React
          Flow's default handle is only 6px. Sits under the drag body, so only
          the ring band is exposed. */}
      <Handle
        type="source"
        position={Position.Top}
        isConnectable={data.editable ?? false}
        className="!absolute !-inset-1 !size-16 !transform-none !rounded-full !border-0 !bg-transparent"
      />
      {/* rim affordance: on hovering an editable node the ring lights up and
          gently pulses, hinting you can drag from here to connect */}
      {(data.editable ?? false) && (
        <span
          aria-hidden
          className="node-connect-ring pointer-events-none absolute -inset-1 rounded-full border-2 border-transparent transition-colors group-hover:border-brand/60"
        />
      )}
      <div className="node-drag absolute inset-[5px] flex cursor-grab items-center justify-center rounded-full active:cursor-grabbing">
        {inside && (
          <span
            className={cn(
              "px-0.5 leading-none",
              name.length <= 1 ? "text-sm" : "text-xs",
            )}
          >
            {name}
          </span>
        )}
      </div>
      {!inside && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[calc(100%+6px)] left-1/2 max-w-40 -translate-x-1/2 truncate rounded bg-background/85 px-1.5 py-0.5 text-center text-[11px] leading-tight font-medium text-foreground shadow-sm ring-1 ring-border"
        >
          {name}
        </span>
      )}
    </div>
  );
});
