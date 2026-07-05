"use client";

import { useEffect, type RefObject } from "react";
import type { OnMount } from "@monaco-editor/react";

type Monaco = Parameters<OnMount>[1];

export const APP_MONACO_THEME = "graph-editor";

// Resolve any CSS color (oklch, color-mix, …) to #rrggbb by painting a pixel —
// Monaco only accepts hex.
let ctx: CanvasRenderingContext2D | null = null;
function cssToHex(css: string, fallback: string): string {
  if (!css) return fallback;
  if (!ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) return fallback;
  ctx.fillStyle = fallback; // known state; invalid values keep the previous fill
  ctx.fillStyle = css;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Define + activate a Monaco theme derived from the app's palette tokens, so
 * the editor matches whichever palette and light/dark mode is active. Token
 * colors reuse the canvas vocabulary: keywords take the cursor color,
 * strings the path color, numbers the visited color.
 */
export function applyMonacoAppTheme(monaco: Monaco) {
  if (typeof document === "undefined") return;
  const styles = getComputedStyle(document.documentElement);
  const dark = document.documentElement.classList.contains("dark");
  const resolve = (name: string, fallback: string) =>
    cssToHex(styles.getPropertyValue(name).trim(), fallback);

  const foreground = resolve("--foreground", dark ? "#e5e5e5" : "#1f1f1f");
  const background = resolve("--background", dark ? "#141414" : "#ffffff");
  const muted = resolve("--muted-foreground", "#808080");
  const brand = resolve("--brand", "#7c6bd4");
  const current = resolve("--graph-current", "#8b6bd4");
  const path = resolve("--graph-path", "#c98a2d");
  const visited = resolve("--graph-visited-border", "#4a7fa5");

  monaco.editor.defineTheme(APP_MONACO_THEME, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: muted.slice(1), fontStyle: "italic" },
      { token: "keyword", foreground: current.slice(1) },
      { token: "string", foreground: path.slice(1) },
      { token: "string.escape", foreground: visited.slice(1) },
      { token: "number", foreground: visited.slice(1) },
      { token: "type", foreground: brand.slice(1) },
      { token: "identifier", foreground: foreground.slice(1) },
      { token: "delimiter", foreground: muted.slice(1) },
    ],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorGutter.background": background,
      "editorLineNumber.foreground": muted,
      "editorLineNumber.activeForeground": foreground,
      "editorCursor.foreground": current,
      "editor.selectionBackground": brand + "40",
      "editor.inactiveSelectionBackground": brand + "26",
      "editor.lineHighlightBackground": muted + "14",
      "editorWidget.background": background,
    },
  });
  monaco.editor.setTheme(APP_MONACO_THEME);
}

/**
 * Re-derive the theme whenever the palette (`data-palette`) or light/dark
 * class on <html> changes. Call applyMonacoAppTheme in onMount for the
 * initial paint.
 */
export function useMonacoAppTheme(monacoRef: RefObject<Monaco | null>) {
  useEffect(() => {
    const apply = () => {
      if (monacoRef.current) applyMonacoAppTheme(monacoRef.current);
    };
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-palette"],
    });
    return () => observer.disconnect();
  }, [monacoRef]);
}
