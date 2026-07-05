"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  Folder,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/lib/projects/store";
import {
  buildFileTree,
  filePathSchema,
  MAX_PROJECT_FILES,
  type FileTreeNode,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

type DialogState =
  | { mode: "new" }
  | { mode: "rename"; from: string }
  | { mode: "delete"; path: string }
  | null;

function FileIcon({ path }: { path: string }) {
  return path.endsWith(".py") ? (
    <FileCode className="size-3.5 shrink-0 text-brand" />
  ) : (
    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
  );
}

function TreeLevel({
  nodes,
  depth,
  collapsed,
  toggle,
  onRename,
  onDelete,
}: {
  nodes: FileTreeNode[];
  depth: number;
  collapsed: Set<string>;
  toggle: (path: string) => void;
  onRename: (from: string) => void;
  onDelete: (path: string) => void;
}) {
  const openPath = useProjectStore((s) => s.openPath);
  const fileCount = useProjectStore((s) => Object.keys(s.files).length);
  const openFile = useProjectStore((s) => s.openFile);

  return (
    <>
      {nodes.map((node) =>
        node.kind === "folder" ? (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggle(node.path)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted/60"
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {collapsed.has(node.path) ? (
                <ChevronRight className="size-3 shrink-0" />
              ) : (
                <ChevronDown className="size-3 shrink-0" />
              )}
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
            {!collapsed.has(node.path) && (
              <TreeLevel
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                toggle={toggle}
                onRename={onRename}
                onDelete={onDelete}
              />
            )}
          </div>
        ) : (
          <div
            key={node.path}
            className={cn(
              "group flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs",
              openPath === node.path
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <button
              type="button"
              onClick={() => openFile(node.path)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <FileIcon path={node.path} />
              <span className="truncate">{node.name}</span>
            </button>
            <span className="invisible flex shrink-0 items-center group-hover:visible">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename ${node.path}`}
                onClick={() => onRename(node.path)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${node.path}`}
                disabled={fileCount <= 1}
                onClick={() => onDelete(node.path)}
              >
                <Trash2 />
              </Button>
            </span>
          </div>
        ),
      )}
    </>
  );
}

export function FileTree() {
  const files = useProjectStore((s) => s.files);
  const addFile = useProjectStore((s) => s.addFile);
  const renameFile = useProjectStore((s) => s.renameFile);
  const deleteFile = useProjectStore((s) => s.deleteFile);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  // what the dialog shows — retained while closing so the exit animation
  // doesn't flash a different dialog's content
  const [view, setView] = useState<Exclude<DialogState, null>>({ mode: "new" });
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openDialog(state: Exclude<DialogState, null>) {
    setView(state);
    setOpen(true);
  }

  const paths = Object.keys(files);
  const tree = buildFileTree(paths);

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function submit() {
    const parsed = filePathSchema.safeParse(pathInput.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const path = parsed.data;
    if (view.mode === "new") {
      if (path in files) {
        setError("A file with that path already exists");
        return;
      }
      addFile(path);
    } else if (view.mode === "rename") {
      if (path in files && path !== view.from) {
        setError("A file with that path already exists");
        return;
      }
      renameFile(view.from, path);
    }
    setOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-xs font-medium">Files</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New file"
          className="ml-auto"
          disabled={paths.length >= MAX_PROJECT_FILES}
          onClick={() => {
            setPathInput("");
            setError(null);
            openDialog({ mode: "new" });
          }}
        >
          <Plus />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <TreeLevel
          nodes={tree}
          depth={0}
          collapsed={collapsed}
          toggle={toggle}
          onRename={(from) => {
            setPathInput(from);
            setError(null);
            openDialog({ mode: "rename", from });
          }}
          onDelete={(path) => openDialog({ mode: "delete", path })}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          {view.mode === "delete" ? (
            <div className="grid gap-4">
              <DialogHeader>
                <DialogTitle>Delete file</DialogTitle>
                <DialogDescription>
                  Delete <span className="font-mono">{view.path}</span>? The
                  file is removed from the project when you save.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  autoFocus
                  onClick={() => {
                    deleteFile(view.path);
                    toast(`Removed ${view.path} — save to persist`);
                    setOpen(false);
                  }}
                >
                  <Trash2 /> Delete
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {view.mode === "rename" ? "Rename file" : "New file"}
                </DialogTitle>
                <DialogDescription>
                  Use <span className="font-mono">/</span> for folders, e.g.{" "}
                  <span className="font-mono">algos/bfs.py</span>
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Input
                  autoFocus
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  placeholder="path/to/file.py"
                  className="font-mono"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="submit">
                  {view.mode === "rename" ? "Rename" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
