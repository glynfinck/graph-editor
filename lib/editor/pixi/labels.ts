/**
 * Node and edge labels for the Pixi renderer. BitmapText shares ONE glyph
 * atlas across every instance (unlike Text, a texture each), so there's no node
 * cap and labels stay cheap at any zoom. Drawn white and tinted so a single
 * atlas serves every theme color.
 */
import { BitmapText, Container, Graphics } from "pixi.js";

const FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";
const NODE_FONT = {
  fontFamily: FONT_FAMILY,
  fontSize: 15,
  fontWeight: "700" as const,
  fill: 0xffffff,
};
// the below-node caption + edge labels (React Flow: 11px, medium)
const CAPTION_FONT = {
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  fontWeight: "500" as const,
  fill: 0xffffff,
};

/** A node's label, built at the origin (the caller positions it at the node
 * center for short names, or below the node for long ones). Short names sit
 * inside the circle; longer names hang below in a pill so they stay readable
 * over the graph — matching the React Flow node caption. */
export function createNodeLabel(
  name: string,
  tint: number,
  bg: number,
  border: number,
): Container {
  const inside = name.length <= 4;
  const c = new Container();
  const t = new BitmapText({ text: name, style: inside ? NODE_FONT : CAPTION_FONT });
  t.tint = tint;
  t.anchor.set(0.5);
  if (!inside) {
    const padX = 5;
    const padY = 1;
    const rect = new Graphics()
      .roundRect(
        -t.width / 2 - padX,
        -t.height / 2 - padY,
        t.width + padX * 2,
        t.height + padY * 2,
        4,
      )
      .fill({ color: bg, alpha: 0.85 })
      .stroke({ width: 1, color: border });
    c.addChild(rect);
  }
  c.addChild(t);
  return c;
}

/** React Flow's edge label: "name · weight", "name", the weight alone, or null
 * when the edge is plain (mirrors floating-edge.tsx `edgeLabel`). */
export function edgeLabelString(
  weight: number | null | undefined,
  name: string | null | undefined,
): string | null {
  const hasWeight = typeof weight === "number";
  if (name && hasWeight) return `${name} · ${weight}`;
  if (name) return name;
  if (hasWeight) return String(weight);
  return null;
}

/** A pill-backed edge label (bg + ring mimics React Flow's HTML label), anchored
 * at its center; the caller positions it at the edge midpoint. */
export function createEdgeLabel(
  text: string,
  tint: number,
  bg: number,
  border: number,
): Container {
  const c = new Container();
  const t = new BitmapText({ text, style: CAPTION_FONT });
  t.tint = tint;
  t.anchor.set(0.5);
  const padX = 4;
  const padY = 2;
  const rect = new Graphics();
  rect
    .roundRect(
      -t.width / 2 - padX,
      -t.height / 2 - padY,
      t.width + padX * 2,
      t.height + padY * 2,
      4,
    )
    .fill({ color: bg, alpha: 0.88 })
    .stroke({ width: 1, color: border });
  c.addChild(rect, t);
  return c;
}
