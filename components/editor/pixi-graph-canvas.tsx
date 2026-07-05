"use client";

import PixiEditCanvas from "@/components/editor/pixi-edit-canvas";
import PixiViewCanvas from "@/components/editor/pixi-view-canvas";

/**
 * Entry point for the Pixi (WebGL) renderer. Picks the render path: an editable
 * canvas (drag / connect / select / delete, addressable per-object rendering)
 * when `editable`, otherwise the faster read-only batched canvas. Both share the
 * Pixi helpers in lib/editor/pixi/ and read the same editor store.
 */
export default function PixiGraphCanvas({
  editable = false,
  showPlayback = false,
}: {
  /** allow on-canvas editing (owned graphs); read-only otherwise */
  editable?: boolean;
  /** show the floating transport bar (workspace runs code; viewers don't) */
  showPlayback?: boolean;
}) {
  return editable ? (
    <PixiEditCanvas showPlayback={showPlayback} />
  ) : (
    <PixiViewCanvas showPlayback={showPlayback} />
  );
}
