"use client";

import { useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The four product palettes. `id` is stamped as data-palette on <html>
 * (Gouache is the default — no attribute) and persisted to localStorage;
 * an inline script in the root layout re-applies it before first paint.
 */
const PALETTES = [
  {
    id: "gouache",
    name: "Gouache",
    hint: "warm ivory · sage",
    swatch: ["oklch(0.55 0.07 150)", "oklch(0.6 0.1 300)", "oklch(0.66 0.12 62)"],
  },
  {
    id: "sea-glass",
    name: "Sea Glass",
    hint: "cool mist · teal",
    swatch: ["oklch(0.55 0.07 200)", "oklch(0.58 0.1 278)", "oklch(0.65 0.11 40)"],
  },
  {
    id: "riso",
    name: "Riso Print",
    hint: "warm white · rose",
    swatch: ["oklch(0.62 0.1 15)", "oklch(0.58 0.1 285)", "oklch(0.68 0.12 78)"],
  },
  {
    id: "clay",
    name: "Clay & Moss",
    hint: "linen · moss",
    swatch: ["oklch(0.52 0.07 130)", "oklch(0.55 0.1 330)", "oklch(0.65 0.11 72)"],
  },
] as const;

const DEFAULT_PALETTE = "gouache";

// Tiny external store over the <html data-palette> attribute so the picker
// stays hydration-safe (server snapshot = default) without effects.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readPalette() {
  return (
    document.documentElement.getAttribute("data-palette") ?? DEFAULT_PALETTE
  );
}

function applyPalette(id: string) {
  if (id === DEFAULT_PALETTE) {
    document.documentElement.removeAttribute("data-palette");
  } else {
    document.documentElement.setAttribute("data-palette", id);
  }
  try {
    if (id === DEFAULT_PALETTE) localStorage.removeItem("palette");
    else localStorage.setItem("palette", id);
  } catch {
    // localStorage unavailable — the palette still applies for this visit
  }
  listeners.forEach((listener) => listener());
}

export function PalettePicker() {
  const palette = useSyncExternalStore(
    subscribe,
    readPalette,
    () => DEFAULT_PALETTE,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Choose palette">
          <Palette />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Palette</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PALETTES.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => applyPalette(option.id)}
          >
            <span className="flex -space-x-1">
              {option.swatch.map((color) => (
                <span
                  key={color}
                  className="size-3 rounded-full border border-black/15"
                  style={{ background: color }}
                />
              ))}
            </span>
            <span className="flex-1">
              {option.name}
              <span className="block text-xs text-muted-foreground">
                {option.hint}
              </span>
            </span>
            {palette === option.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
