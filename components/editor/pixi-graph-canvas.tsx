"use client";

import PixiViewCanvas from "@/components/editor/pixi-view-canvas";

/**
 * Entry point for the Pixi (WebGL) renderer. Picks the render path: a view-only
 * canvas today; an editable canvas (drag / connect / select / delete) will be
 * selected here when `editable` is set. Both share the Pixi helpers in
 * lib/editor/pixi/ and read the same editor store.
 */
export default function PixiGraphCanvas({
  showPlayback = false,
}: {
  /** show the floating transport bar (workspace runs code; viewers don't) */
  showPlayback?: boolean;
}) {
  return <PixiViewCanvas showPlayback={showPlayback} />;
}
