"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/editor/store";
import { cn } from "@/lib/utils";

function StatusIndicator() {
  const status = useEditorStore((s) => s.status);

  const labels = {
    booting: { text: "Loading Python…", dot: "bg-graph-path animate-pulse" },
    ready: { text: "Ready", dot: "bg-brand" },
    running: { text: "Running…", dot: "" },
    failed: { text: "Python failed to load", dot: "bg-destructive" },
  } as const;
  const { text, dot } = labels[status];

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {status === "running" ? (
        <Loader2 className="size-3 animate-spin text-brand" />
      ) : (
        <span className={cn("size-1.5 rounded-full", dot)} />
      )}
      {text}
    </span>
  );
}

/**
 * Terminal-styled console. With a `shell` it's interactive: a prompt line at
 * the bottom accepts commands (see lib/projects/shell.ts) with ↑/↓ history.
 */
export function ConsolePanel({
  shell,
}: {
  shell?: { prompt: string; onCommand: (input: string) => void };
}) {
  const lines = useEditorStore((s) => s.console);
  const clearConsole = useEditorStore((s) => s.clearConsole);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  // index into history while browsing with ↑/↓; null = composing a new command
  const [historyAt, setHistoryAt] = useState<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  function submit() {
    const command = input;
    setInput("");
    setHistoryAt(null);
    if (command.trim()) setHistory((h) => [...h, command]);
    shell?.onCommand(command);
  }

  function browseHistory(direction: -1 | 1) {
    if (history.length === 0) return;
    const at =
      historyAt === null
        ? direction === -1
          ? history.length - 1
          : null
        : Math.max(0, Math.min(history.length - 1, historyAt + direction));
    if (historyAt !== null && direction === 1 && historyAt === history.length - 1) {
      setHistoryAt(null);
      setInput("");
      return;
    }
    if (at === null) return;
    setHistoryAt(at);
    setInput(history[at]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3">
        <span className="text-xs font-medium">
          {shell ? "Terminal" : "Output"}
        </span>
        <StatusIndicator />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear console"
          className="ml-auto"
          onClick={clearConsole}
        >
          <Eraser />
        </Button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto bg-(--terminal-bg) p-3 font-mono text-xs leading-relaxed text-(--terminal-fg)"
        onClick={() => {
          // clicking the pane focuses the prompt, unless the user is selecting text
          if (window.getSelection()?.isCollapsed) inputRef.current?.focus();
        }}
      >
        {lines.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap">
            {line.kind === "command" ? (
              <>
                <span className="font-semibold text-(--terminal-prompt)">
                  {line.prompt}{" "}
                </span>
                {line.text}
              </>
            ) : (
              <span
                className={cn(
                  (line.kind === "stderr" || line.kind === "error") &&
                    "text-(--terminal-error)",
                  line.kind === "info" && "text-(--terminal-muted) italic",
                )}
              >
                {line.text}
              </span>
            )}
          </div>
        ))}
        {shell && (
          <div className="flex items-baseline gap-0">
            <span className="shrink-0 font-semibold text-(--terminal-prompt)">
              {shell.prompt}&nbsp;
            </span>
            <input
              ref={inputRef}
              aria-label="Terminal input"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setHistoryAt(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
                else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  browseHistory(-1);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  browseHistory(1);
                }
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="min-w-0 flex-1 border-none bg-transparent font-mono text-xs text-(--terminal-fg) caret-(--terminal-prompt) outline-none"
            />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
