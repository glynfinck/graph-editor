"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  useInternalNode,
  type ConnectionLineComponentProps,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";

import { NODE_DIAMETER } from "@/components/editor/graph-node";
import type { GraphEdgeData, GraphFlowEdge } from "@/lib/editor/store";

const RADIUS = NODE_DIAMETER / 2;

function centerOf(node: InternalNode) {
  return {
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
  };
}

/** Points on the two circles' rims along the line between their centers. */
function trimToRadius(
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    sourceX: source.x + ux * RADIUS,
    sourceY: source.y + uy * RADIUS,
    targetX: target.x - ux * RADIUS,
    targetY: target.y - uy * RADIUS,
  };
}

/** "name · weight", "name", or "3" — null when the edge carries neither. */
function edgeLabel(data: GraphEdgeData | undefined): string | null {
  const parts: string[] = [];
  if (data?.name) parts.push(data.name);
  if (data?.weight != null) parts.push(String(data.weight));
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Edge for circular nodes: drawn center-to-center (trimmed to the circle
 * rims) so it always meets the node head-on, regardless of direction —
 * instead of snapping to fixed top/bottom handle anchors. Directed graphs pass
 * a `markerEnd` (arrowhead); weighted/labeled edges render a midpoint label.
 */
export function FloatingEdge({
  id,
  source,
  target,
  style,
  markerEnd,
  data,
}: EdgeProps<GraphFlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const [path, labelX, labelY] = getStraightPath(
    trimToRadius(centerOf(sourceNode), centerOf(targetNode)),
  );

  const label = edgeLabel(data);

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded bg-background/85 px-1 py-px text-[11px] font-medium text-foreground tabular-nums shadow-sm ring-1 ring-border"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** The in-progress connection line, drawn from the source node's rim. */
export function FloatingConnectionLine({
  fromNode,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  const from = centerOf(fromNode);
  const { sourceX, sourceY } = trimToRadius(from, { x: toX, y: toY });
  const [path] = getStraightPath({
    sourceX,
    sourceY,
    targetX: toX,
    targetY: toY,
  });

  return (
    <path
      d={path}
      fill="none"
      stroke="var(--brand)"
      strokeWidth={2}
      strokeDasharray="6 3"
    />
  );
}
