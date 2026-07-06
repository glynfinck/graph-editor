/**
 * Pure geometry for the Pixi renderer — node radius, edge trimming, arrowheads,
 * fit-to-view bounds, and point-to-segment distance (edge hit-testing). All in
 * world coordinates and free of any Pixi/DOM dependency.
 */
/** Node diameter in world units (the on-screen circle size). */
export const NODE_DIAMETER = 56;
export const R = NODE_DIAMETER / 2; // 28 — node radius
export const AH = 11; // arrowhead length
export const AW = 7; // arrowhead half-width

export type Pt = { x: number; y: number };

/** Endpoints of the visible edge segment: from the source rim to the target
 * rim, pulled back by the arrowhead when directed. Also returns the unit
 * direction for callers that need it. */
export function trimmedEnds(s: Pt, t: Pt, directed: boolean) {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const endGap = directed ? R + AH : R;
  return {
    x1: s.x + ux * R,
    y1: s.y + uy * R,
    x2: t.x - ux * endGap,
    y2: t.y - uy * endGap,
    ux,
    uy,
  };
}

/** Arrowhead triangle at the target rim, as a flat [x0,y0,x1,y1,x2,y2] poly. */
export function arrowheadPoly(s: Pt, t: Pt): number[] {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const tipX = t.x - ux * R;
  const tipY = t.y - uy * R;
  const baseX = t.x - ux * (R + AH);
  const baseY = t.y - uy * (R + AH);
  return [
    tipX, tipY,
    baseX - uy * AW, baseY + ux * AW,
    baseX + uy * AW, baseY - ux * AW,
  ];
}

/** Bounding box of the node centers padded by R, or null for an empty graph. */
export function fitBounds(
  nodes: { position: Pt }[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x);
    maxY = Math.max(maxY, n.position.y);
  }
  return { minX: minX - R, minY: minY - R, maxX: maxX + R, maxY: maxY + R };
}

/** Distance from point (px,py) to segment (ax,ay)-(bx,by). */
export function pointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
