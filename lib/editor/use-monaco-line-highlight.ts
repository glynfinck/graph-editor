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
  modelVersion = 0,
}: {
  editorRef: RefObject<MonacoEditor | null>;
  monacoRef: RefObject<Monaco | null>;
  line: number | null;
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
    editor.revealLineInCenterIfOutsideViewport(
      line,
      monacoRef.current?.editor.ScrollType.Smooth,
    );
  }, [editorRef, monacoRef, line, modelVersion]);
}
