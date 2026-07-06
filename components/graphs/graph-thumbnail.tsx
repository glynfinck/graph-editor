import { Waypoints } from "lucide-react";

import type { GraphPreview } from "@/lib/data/graphs";
import { cn } from "@/lib/utils";

const W = 240;
const H = 96;
const PAD = 14;

/**
 * Static SVG mini-render of a graph for list cards — node positions and
 * edges scaled uniformly into a small frame. Pure markup (no Pixi): a page
 * of cards must render server-side and cost nothing on the client.
 */
export function GraphThumbnail({
  preview,
  className,
}: {
  preview: GraphPreview | null | undefined;
  className?: string;
}) {
  const nodes = preview?.nodes ?? [];

  if (!nodes.length) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-muted/50 text-muted-foreground/40",
          className,
        )}
        aria-hidden
      >
        <Waypoints className="size-6" />
      </div>
    );
  }

  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1);
  const spanY = Math.max(Math.max(...ys) - minY, 1);
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offsetX = (W - spanX * scale) / 2 - minX * scale;
  const offsetY = (H - spanY * scale) / 2 - minY * scale;
  // one decimal is sub-pixel at this size and keeps the markup lean — a
  // full float per coordinate more than doubles a busy page's HTML
  const px = (x: number) => Math.round((x * scale + offsetX) * 10) / 10;
  const py = (y: number) => Math.round((y * scale + offsetY) * 10) / 10;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  // the preview is row-capped, so edges can reference unsampled nodes
  const edges = (preview?.edges ?? []).filter(
    (edge) => byId.has(edge.source) && byId.has(edge.target),
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("rounded-md bg-muted/50", className)}
      aria-hidden
    >
      <g className="stroke-muted-foreground/35" strokeWidth={1.25}>
        {edges.map((edge, index) => {
          const source = byId.get(edge.source)!;
          const target = byId.get(edge.target)!;
          return (
            <line
              key={index}
              x1={px(source.x)}
              y1={py(source.y)}
              x2={px(target.x)}
              y2={py(target.y)}
            />
          );
        })}
      </g>
      <g className="fill-brand">
        {nodes.map((node) => (
          <circle key={node.id} cx={px(node.x)} cy={py(node.y)} r={3.25} />
        ))}
      </g>
    </svg>
  );
}
