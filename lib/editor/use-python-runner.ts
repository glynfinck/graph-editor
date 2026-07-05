"use client";

import { useCallback, useEffect, useRef } from "react";

import { isFrame, isGraphEvent } from "@/lib/editor/frames";
import { PYTHON_PRELUDE } from "@/lib/editor/python";
import { useEditorStore } from "@/lib/editor/store";

type WorkerMessage =
  | { type: "ready" }
  | { type: "boot-error"; message: string }
  | { type: "stdout" | "stderr"; runId: number; text: string }
  | { type: "frames"; runId: number; frames: unknown[] }
  | { type: "done"; runId: number }
  | { type: "error"; runId: number; message: string };

/**
 * Owns the Pyodide Web Worker. Streams console output and animation frames
 * into the editor store; run() executes the given Python against the current
 * canvas graph, stop() terminates a runaway script and boots a fresh worker.
 */
export function usePythonRunner() {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);

  const boot = useCallback(() => {
    workerRef.current?.terminate();

    const store = useEditorStore.getState();
    store.setStatus("booting");

    const worker = new Worker("/python-worker.js");
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      const state = useEditorStore.getState();

      switch (message.type) {
        case "ready":
          state.setStatus("ready");
          break;
        case "boot-error":
          state.setStatus("failed");
          state.appendConsole({
            kind: "error",
            text: `Failed to load Python: ${message.message}`,
          });
          break;
        case "stdout":
        case "stderr":
          if (message.runId !== runIdRef.current) break;
          state.appendConsole({
            kind: message.type,
            text: message.text,
          });
          break;
        case "frames":
          if (message.runId !== runIdRef.current) break;
          state.pushFrames(message.frames.filter(isFrame));
          break;
        case "done":
          if (message.runId !== runIdRef.current) break;
          state.appendConsole({
            kind: "info",
            text: `Finished — ${state.frames.filter(isGraphEvent).length} animation frames.`,
          });
          state.finishRun(true);
          break;
        case "error":
          if (message.runId !== runIdRef.current) break;
          state.appendConsole({ kind: "error", text: message.message });
          state.finishRun(false);
          break;
      }
    };

    worker.onerror = (event) => {
      const state = useEditorStore.getState();
      state.setStatus("failed");
      state.appendConsole({
        kind: "error",
        text: `Worker error: ${event.message ?? "unknown"}`,
      });
    };
  }, []);

  useEffect(() => {
    boot();
    return () => workerRef.current?.terminate();
  }, [boot]);

  const run = useCallback(
    (
      code: string,
      files?: { path: string; content: string }[],
      entryPath?: string,
    ) => {
      const worker = workerRef.current;
      const state = useEditorStore.getState();
      if (!worker || state.status !== "ready") return;

      state.startRun();
      runIdRef.current += 1;
      worker.postMessage({
        runId: runIdRef.current,
        prelude: PYTHON_PRELUDE,
        code,
        graph: {
          directed: state.directed,
          nodes: state.nodes.map((node) => ({
            id: node.id,
            name: node.data.name,
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
          })),
          edges: state.edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
            weight: edge.data?.weight ?? null,
          })),
        },
        ...(files ? { files } : {}),
        ...(entryPath ? { entryPath } : {}),
      });
    },
    [],
  );

  const stop = useCallback(() => {
    const state = useEditorStore.getState();
    runIdRef.current += 1;
    state.appendConsole({ kind: "info", text: "Stopped — restarting Python…" });
    state.finishRun(false);
    boot();
  }, [boot]);

  return { run, stop };
}
