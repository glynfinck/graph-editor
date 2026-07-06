"use client";

import type { RefObject } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tip";

/** Imperative viewport handle both Pixi canvases expose to the controls. */
export type PixiViewControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

/**
 * Bottom-right zoom-in / zoom-out / fit-view buttons, mirroring React Flow's
 * <Controls>. Restores a way to recover the viewport (or zoom without a scroll
 * wheel) after the migration off React Flow, which had these built in.
 */
export function PixiCanvasControls({
  controlsRef,
}: {
  controlsRef: RefObject<PixiViewControls | null>;
}) {
  return (
    <div className="absolute right-2 bottom-10 z-10">
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card/90 backdrop-blur">
        <Tip label="Zoom in" side="left">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            className="rounded-none"
            onClick={() => controlsRef.current?.zoomIn()}
          >
            <ZoomIn />
          </Button>
        </Tip>
        <Tip label="Zoom out" side="left">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            className="rounded-none"
            onClick={() => controlsRef.current?.zoomOut()}
          >
            <ZoomOut />
          </Button>
        </Tip>
        <Tip label="Fit to view" side="left">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fit to view"
            className="rounded-none"
            onClick={() => controlsRef.current?.fit()}
          >
            <Maximize />
          </Button>
        </Tip>
      </div>
    </div>
  );
}
