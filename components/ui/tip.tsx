"use client";

import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Library tooltip for icon-only controls, naming what they do on hover.
 * Self-contained (carries its own provider) so it can wrap a control on any
 * surface without per-page wiring.
 */
export function Tip({
  label,
  children,
  side,
}: {
  label: string;
  children: ReactNode;
  /** which side of the trigger to show on (defaults to the tooltip's own) */
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
