"use client";

import { useMemo, useState } from "react";
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";
import markdownLang from "highlight.js/lib/languages/markdown";
import pythonLang from "highlight.js/lib/languages/python";
import { FileCode } from "lucide-react";

import { cn } from "@/lib/utils";

hljs.registerLanguage("python", pythonLang);
hljs.registerLanguage("json", jsonLang);
hljs.registerLanguage("markdown", markdownLang);

function languageOf(path: string) {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return null;
}

/**
 * Read-only file browser for a post's attached project — no workspace, no
 * Monaco. Highlighting reuses the hljs token classes from globals.css, which
 * mirror the Monaco theme, so the files read like the real editor.
 */
export function ProjectFilesViewer({
  files,
}: {
  files: { path: string; content: string }[];
}) {
  const [openPath, setOpenPath] = useState(
    () => files.find((file) => file.path === "main.py")?.path ?? files[0]?.path,
  );
  const open = files.find((file) => file.path === openPath);

  // hljs escapes the source while tokenizing — the output is safe HTML
  const highlighted = useMemo(() => {
    if (!open) return null;
    const language = languageOf(open.path);
    if (!language) return null;
    return hljs.highlight(open.content, { language }).value;
  }, [open]);

  if (!files.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground">This project is empty.</p>
    );
  }

  return (
    <div className="flex h-80 min-h-0 text-sm">
      <div className="w-44 shrink-0 overflow-y-auto border-r p-2">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => setOpenPath(file.path)}
            className={cn(
              "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left font-mono text-xs text-muted-foreground hover:bg-muted",
              file.path === openPath && "bg-muted text-foreground",
            )}
          >
            <FileCode className="size-3 shrink-0" />
            <span className="truncate">{file.path}</span>
          </button>
        ))}
      </div>
      <pre className="min-w-0 flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed">
        {highlighted ? (
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          (open?.content ?? "")
        )}
      </pre>
    </div>
  );
}
