"use client";

import {
  CirclePause,
  FastForward,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tip } from "@/components/ui/tip";
import { type StepGranularity, useEditorStore } from "@/lib/editor/store";

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
  const stepGranularity = useEditorStore((s) => s.stepGranularity);
  const setStepGranularity = useEditorStore((s) => s.setStepGranularity);
  const runToBreakpoint = useEditorStore((s) => s.runToBreakpoint);
  const hasBreakpoints = useEditorStore((s) =>
    Object.values(s.breakpoints).some((lines) => lines.length > 0),
  );
  const pauseOnBreakpoint = useEditorStore((s) => s.pauseOnBreakpoint);
  const setPauseOnBreakpoint = useEditorStore((s) => s.setPauseOnBreakpoint);
  const resetPlayback = useEditorStore((s) => s.resetPlayback);

  const empty = framesCount === 0;

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1.5 backdrop-blur">
        <Tip label="Reset to the start">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset"
            disabled={empty}
            onClick={resetPlayback}
          >
            <RotateCcw />
          </Button>
        </Tip>
        <Tip label="Step back">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Step back"
            disabled={playhead === 0}
            onClick={stepBack}
          >
            <SkipBack />
          </Button>
        </Tip>
        <Tip label={playing ? "Pause" : "Play"}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={playing ? "Pause" : "Play"}
            disabled={empty}
            onClick={playing ? pause : play}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
        </Tip>
        <Tip label="Step forward">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Step forward"
            disabled={playhead >= framesCount}
            onClick={stepForward}
          >
            <SkipForward />
          </Button>
        </Tip>
        {hasBreakpoints && (
          <>
            <Tip label="Jump to the next breakpoint">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Run to next breakpoint"
                disabled={playhead >= framesCount}
                onClick={runToBreakpoint}
              >
                <FastForward />
              </Button>
            </Tip>
            <Tip
              label={
                pauseOnBreakpoint
                  ? "Breakpoints pause playback — click to animate through them instead"
                  : "Breakpoints filter the animation — click to pause on them instead"
              }
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Pause at breakpoints"
                aria-pressed={pauseOnBreakpoint}
                className={
                  pauseOnBreakpoint ? undefined : "text-muted-foreground/50"
                }
                onClick={() => setPauseOnBreakpoint(!pauseOnBreakpoint)}
              >
                <CirclePause />
              </Button>
            </Tip>
          </>
        )}

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
        <span className="min-w-14 px-1 text-center text-xs font-medium tabular-nums whitespace-nowrap text-muted-foreground">
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

        <Separator orientation="vertical" className="mx-1 !h-5" />

        {/* stepping granularity — Events rests on graph events (canvas-smooth
            lockstep), Steps stops on every traced statement */}
        <Tabs
          value={stepGranularity}
          onValueChange={(value) =>
            setStepGranularity(value as StepGranularity)
          }
        >
          <TabsList className="!h-7">
            <TabsTrigger
              value="events"
              className="px-2 text-xs"
              title="Rest on graph events (canvas stays smooth)"
            >
              Events
            </TabsTrigger>
            <TabsTrigger
              value="statements"
              className="px-2 text-xs"
              title="Step through every statement"
            >
              Steps
            </TabsTrigger>
          </TabsList>
        </Tabs>
    </div>
  );
}
