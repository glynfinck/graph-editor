"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { OnMount } from "@monaco-editor/react";

import { currentPosAt } from "@/lib/editor/frames";
import { useEditorStore } from "@/lib/editor/store";

type MonacoEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];
type TextModel = NonNullable<ReturnType<MonacoEditor["getModel"]>>;

/** Line the recording is on at the playhead, while `file` is the one shown. */
export function useExecutingLine(file: string | null) {
  return useEditorStore((s) => {
    const pos = currentPosAt(s.frames, s.playhead);
    return pos && pos.file === file ? pos.line : null;
  });
}

/**
 * Whole-line "executing" decoration on a Monaco editor. Decorations belong to
 * a model, so the previous one is removed from the model that owns it —
 * multi-file editors bump `modelVersion` when the model swaps; single-model
 * editors leave it alone.
 */
export function useMonacoLineHighlight({
  editorRef,
  monacoRef,
  line,
  reveal = true,
  modelVersion = 0,
}: {
  editorRef: RefObject<MonacoEditor | null>;
  monacoRef: RefObject<Monaco | null>;
  line: number | null;
  /** auto-scroll to keep the line in view (off = highlight only) */
  reveal?: boolean;
  modelVersion?: number;
}) {
  const highlightRef = useRef<{ model: TextModel; ids: string[] } | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const previous = highlightRef.current;
    if (previous && !previous.model.isDisposed()) {
      previous.model.deltaDecorations(previous.ids, []);
    }
    highlightRef.current = null;

    const model = editor.getModel();
    if (line === null || !model || line > model.getLineCount()) return;
    const ids = model.deltaDecorations(
      [],
      [
        {
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: "algo-line-highlight",
            linesDecorationsClassName: "algo-line-highlight-gutter",
          },
        },
      ],
    );
    highlightRef.current = { model, ids };
    if (reveal) {
      editor.revealLineInCenterIfOutsideViewport(
        line,
        monacoRef.current?.editor.ScrollType.Smooth,
      );
    }
  }, [editorRef, monacoRef, line, reveal, modelVersion]);
}

/**
 * Breakpoint dots in the editor's glyph margin, mirroring the store's
 * `breakpoints[file]`. Same model-ownership rules as the line highlight.
 * Line numbers are best-effort against edits: they mark playback positions
 * in the last run's source, not live debugger breakpoints.
 */
export function useMonacoBreakpoints({
  editorRef,
  file,
  modelVersion = 0,
}: {
  editorRef: RefObject<MonacoEditor | null>;
  file: string | null;
  modelVersion?: number;
}) {
  const decorationsRef = useRef<{ model: TextModel; ids: string[] } | null>(
    null,
  );
  const lines = useEditorStore((s) =>
    file ? s.breakpoints[file] : undefined,
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const previous = decorationsRef.current;
    if (previous && !previous.model.isDisposed()) {
      previous.model.deltaDecorations(previous.ids, []);
    }
    decorationsRef.current = null;

    const model = editor.getModel();
    if (!model || !lines?.length) return;
    const lineCount = model.getLineCount();
    const ids = model.deltaDecorations(
      [],
      lines
        .filter((line) => line <= lineCount)
        .map((line) => ({
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: { glyphMarginClassName: "bp-glyph" },
        })),
    );
    decorationsRef.current = { model, ids };
  }, [editorRef, lines, modelVersion]);
}
