"use client";

import {
  Pause,
  Play,
  Rabbit,
  RotateCcw,
  SkipBack,
  SkipForward,
  Turtle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useEditorStore } from "@/lib/editor/store";

/**
 * Floating playback bar. Always visible so the speed can be set before a
 * run (playback starts live with the stream); the transport controls enable
 * once frames exist.
 */
export function PlaybackControls() {
  const framesCount = useEditorStore((s) => s.frames.length);
  const playhead = useEditorStore((s) => s.playhead);
  const playing = useEditorStore((s) => s.playing);
  const speed = useEditorStore((s) => s.speed);
  const play = useEditorStore((s) => s.play);
  const pause = useEditorStore((s) => s.pause);
  const stepForward = useEditorStore((s) => s.stepForward);
  const stepBack = useEditorStore((s) => s.stepBack);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const setSpeed = useEditorStore((s) => s.setSpeed);
  const resetPlayback = useEditorStore((s) => s.resetPlayback);

  const empty = framesCount === 0;

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1.5 backdrop-blur">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Reset"
        disabled={empty}
        onClick={resetPlayback}
      >
        <RotateCcw />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Step back"
        disabled={playhead === 0}
        onClick={stepBack}
      >
        <SkipBack />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={playing ? "Pause" : "Play"}
        disabled={empty}
        onClick={playing ? pause : play}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Step forward"
        disabled={playhead >= framesCount}
        onClick={stepForward}
      >
        <SkipForward />
      </Button>

      <Slider
        aria-label="Scrub"
        className="mx-2 w-28"
        min={0}
        max={Math.max(framesCount, 1)}
        step={1}
        value={[playhead]}
        disabled={empty}
        onValueChange={([value]) => setPlayhead(value)}
      />
      <span className="w-14 text-center text-xs font-medium tabular-nums text-muted-foreground">
        {playhead}/{framesCount}
      </span>

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <Turtle className="size-4 text-muted-foreground" />
      <Slider
        aria-label="Speed"
        className="w-20"
        min={1}
        max={100}
        step={1}
        value={[speed]}
        onValueChange={([value]) => setSpeed(value)}
      />
      <Rabbit className="size-4 text-muted-foreground" />
    </div>
  );
}
