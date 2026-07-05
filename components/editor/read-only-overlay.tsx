"use client";

import { Lock } from "lucide-react";

/**
 * A small on-canvas badge shown when the graph isn't the caller's to edit
 * (a sample, or someone else's). Without it, edit attempts just silently do
 * nothing — this says why and offers the one-click way out. Sits top-left so it
 * clears the playback bar (top-center) and inspectors (top-right).
 */
export function ReadOnlyOverlay({
  isSample,
  canCopy,
  copying,
  onCopy,
  hasPlaybackBar = false,
}: {
  isSample: boolean;
  /** show the "Copy to edit" action (a signed-in user can make their own copy) */
  canCopy: boolean;
  copying: boolean;
  onCopy: () => void;
  /** drop below the top-center playback bar so they don't overlap on a narrow
   * canvas (the bar can reach the corner) */
  hasPlaybackBar?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute left-2 z-20 ${
        hasPlaybackBar ? "top-14" : "top-2"
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1 text-xs shadow-sm backdrop-blur">
        <Lock className="size-3 text-muted-foreground" />
        <span className="text-muted-foreground">
          Read-only{isSample ? " sample" : ""}
        </span>
        {canCopy && (
          <>
            <span aria-hidden className="text-border">
              ·
            </span>
            <button
              type="button"
              onClick={onCopy}
              disabled={copying}
              className="font-medium text-brand hover:underline disabled:opacity-60"
            >
              {copying ? "Copying…" : "Copy to edit"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
