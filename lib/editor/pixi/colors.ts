/**
 * Color plumbing for the Pixi renderer. CSS custom properties resolve to
 * whatever the browser serializes (rgb / oklch / color()), so we normalize to a
 * packed 0xRRGGBB by round-tripping through a 1px canvas rather than parsing
 * color strings — robust to any format.
 */

/** The computed color a CSS var resolves to, read from inside `scope` so
 * ancestor-scoped palettes ([data-palette]) apply. */
export function resolveColor(scope: HTMLElement, varName: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${varName})`;
  probe.style.display = "none";
  scope.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** Normalize ANY CSS color string to 0xRRGGBB by painting one pixel and reading
 * it back. A magenta sentinel detects colors the canvas can't parse. */
export function toHex(cssColorString: string, fallback: number): number {
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = "#ff00ff";
  ctx.fillStyle = cssColorString; // ignored if unparseable → sentinel remains
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  if (r === 255 && g === 0 && b === 255) return fallback;
  return (r << 16) | (g << 8) | b;
}

export function cssColor(
  scope: HTMLElement,
  varName: string,
  fallback: number,
): number {
  return toHex(resolveColor(scope, varName), fallback);
}

/** Like cssColor, but flattens a (possibly translucent) color onto `bgHex` —
 * the visited node fill is semi-transparent in some themes and composites over
 * the canvas background on screen, so bake that composite in for an opaque tint
 * that matches what React Flow shows. */
export function cssColorOver(
  scope: HTMLElement,
  varName: string,
  bgHex: number,
  fallback: number,
): number {
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = `#${bgHex.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = resolveColor(scope, varName); // ignored if unparseable → bg
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}

/** Linear blend of two packed 0xRRGGBB colors (t=0 → a, t=1 → b). */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** The full graph palette resolved from CSS vars (mirrors graph-node.tsx /
 * graph-decoration.ts), shared by both render paths. */
export type GraphPalette = {
  bg: number;
  node: number;
  border: number;
  edge: number;
  text: number;
  visitedFill: number;
  visitedBorder: number;
  pathFill: number;
  pathBorder: number;
  current: number;
  grid: number;
  ring: number;
  /** connect/hover affordance color (React Flow uses --brand for this) */
  brand: number;
};

export function resolvePalette(el: HTMLElement): GraphPalette {
  const bg = cssColor(el, "--background", 0xffffff);
  const text = cssColor(el, "--foreground", 0x1a1f2b);
  // grid dots blend from bg toward text; a dark dot on a light bg needs a
  // bigger step to read as strongly as a light dot on a dark bg, so scale the
  // blend by bg luminance.
  const bgLum =
    (0.299 * ((bg >> 16) & 255) +
      0.587 * ((bg >> 8) & 255) +
      0.114 * (bg & 255)) /
    255;
  return {
    bg,
    text,
    node: cssColor(el, "--graph-node", 0xffffff),
    border: cssColor(el, "--graph-node-border", 0xaeb9d2),
    edge: cssColor(el, "--graph-edge", 0xc9d0dd),
    visitedFill: cssColorOver(el, "--graph-visited", bg, 0xdde8f5),
    visitedBorder: cssColor(el, "--graph-visited-border", 0x5b7aa8),
    pathFill: cssColor(el, "--graph-path-fill", 0xe7c9a0),
    pathBorder: cssColor(el, "--graph-path", 0xc98a3c),
    current: cssColor(el, "--graph-current", 0x8a63d2),
    grid: mix(bg, text, bgLum > 0.5 ? 0.4 : 0.34),
    ring: cssColor(el, "--ring", 0x8a63d2),
    brand: cssColor(el, "--brand", 0x6366f1),
  };
}
