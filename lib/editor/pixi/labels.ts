/**
 * Node and edge labels for the Pixi renderer. BitmapText shares ONE glyph
 * atlas across every instance (unlike Text, a texture each), so there's no node
 * cap and labels stay cheap at any zoom. Drawn white and tinted so a single
 * atlas serves every theme color.
 */
import { BitmapText, Container, Graphics } from "pixi.js";

import { R } from "@/lib/editor/pixi/geometry";

const NODE_FONT = {
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 15,
  fontWeight: "700" as const,
  fill: 0xffffff,
};

const EDGE_FONT = {
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 12,
  fontWeight: "600" as const,
  fill: 0xffffff,
};

/** A node's label positioned relative to its center: short names sit inside the
 * circle (the classic look), longer names hang below as a caption. */
export function createNodeLabel(
  name: string,
  cx: number,
  cy: number,
  tint: number,
): BitmapText {
  const inside = name.length <= 4;
  const txt = new BitmapText({ text: name, style: NODE_FONT });
  txt.tint = tint;
  txt.anchor.set(0.5);
  txt.position.set(cx, inside ? cy : cy + R + 12);
  return txt;
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
  const t = new BitmapText({ text, style: EDGE_FONT });
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
