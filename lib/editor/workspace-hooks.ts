"use client";

import { useEffect, useRef } from "react";

import { frameDelayMs, useEditorStore } from "@/lib/editor/store";

/**
 * Playback loop — one graph event per delay while playing in "events" mode
 * (tick absorbs the line frames in between, keeping code + canvas in
 * lockstep); one frame per delay in "statements" mode.
 */
export function usePlaybackLoop() {
  const playing = useEditorStore((s) => s.playing);
  const playhead = useEditorStore((s) => s.playhead);
  const framesCount = useEditorStore((s) => s.frames.length);
  const speed = useEditorStore((s) => s.speed);
  const tick = useEditorStore((s) => s.tick);

  useEffect(() => {
    if (!playing || playhead >= framesCount) return;
    const timer = setTimeout(tick, frameDelayMs(speed));
    return () => clearTimeout(timer);
  }, [playing, playhead, framesCount, speed, tick]);
}

/** Cmd/Ctrl+S runs the latest handler; the listener binds once. */
export function useSaveShortcut(onSave: () => void) {
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Warn before leaving the page while there are unsaved changes. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

type CollapsiblePanelHandle = {
  isCollapsed: () => boolean;
  expand: () => void;
  collapse: () => void;
};

/** Collapse/expand toggle for a resizable panel ref (top-bar buttons). */
export function togglePanel(panel: {
  current: CollapsiblePanelHandle | null;
}) {
  return () => {
    const handle = panel.current;
    if (!handle) return;
    if (handle.isCollapsed()) handle.expand();
    else handle.collapse();
  };
}
