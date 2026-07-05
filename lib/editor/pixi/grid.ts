/**
 * The screen-space dot grid drawn behind the graph. It only covers the
 * viewport (cheap) and fades in as you zoom so the dots never crowd.
 */
import type { Container, Graphics } from "pixi.js";

export const GAP = 24; // dot spacing in world units — matches the React Flow canvas

/** Redraw the dot grid for the current view onto `gridG` (a stage-space
 * Graphics behind `world`). Dots sit at GAP*scale spacing, phased by the pan
 * offset so they scroll/zoom with the graph. */
export function drawGrid(
  gridG: Graphics,
  world: Container,
  screenW: number,
  screenH: number,
  color: number,
) {
  gridG.clear();
  const scale = world.scale.x;
  const spacing = GAP * scale;
  // fade in as the dots spread apart (smoothstep over 9→24px) instead of
  // snapping on at a hard threshold
  const t = Math.max(0, Math.min(1, (spacing - 9) / 15));
  const alpha = t * t * (3 - 2 * t);
  if (alpha < 0.03) return; // effectively invisible → skip the work
  const ox = ((world.position.x % spacing) + spacing) % spacing;
  const oy = ((world.position.y % spacing) + spacing) % spacing;
  const r = Math.max(1, Math.min(2, 0.9 * scale));
  for (let x = ox; x <= screenW; x += spacing) {
    for (let y = oy; y <= screenH; y += spacing) gridG.circle(x, y, r);
  }
  gridG.fill({ color, alpha });
}
