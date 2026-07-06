"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef, useTransition } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
  ArrowLeft,
  Copy,
  FolderTree,
  GitFork,
  Highlighter,
  Loader2,
  LocateFixed,
  Lock,
  PanelRight,
  PinOff,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  SquareTerminal,
  Waypoints,
} from "lucide-react";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";

import { ConsolePanel } from "@/components/editor/console-panel";
import { DirectedToggle } from "@/components/editor/directed-toggle";

// WebGL (Pixi) renderer, client-only (needs the DOM/WebGL), lazy-loaded so
// pixi.js is code-split out of the initial bundle.
const PixiGraphCanvas = dynamic(
  () => import("@/components/editor/pixi-graph-canvas"),
  { ssr: false },
);
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DemoBanner } from "@/components/projects/demo-banner";
import { FileTree } from "@/components/projects/file-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tip";
import {
  createGraph,
  duplicateGraph,
  loadGraphDoc,
  saveGraph,
} from "@/lib/actions/graphs";
import { saveProject } from "@/lib/actions/projects";
import type { GraphSummary } from "@/lib/data/graphs";
import { EMPTY_GRAPH_DOC, type GraphDoc } from "@/lib/graph/types";
import {
  applyMonacoAppTheme,
  useMonacoAppTheme,
} from "@/lib/editor/monaco-theme";
import { useEditorStore } from "@/lib/editor/store";
import {
  useExecutingLine,
  useMonacoBreakpoints,
  useMonacoLineHighlight,
} from "@/lib/editor/use-monaco-line-highlight";
import { usePythonRunner } from "@/lib/editor/use-python-runner";
import {
  togglePanel,
  usePlaybackLoop,
  useSaveShortcut,
  useUnsavedGuard,
} from "@/lib/editor/workspace-hooks";
import { promptFor, runShellCommand } from "@/lib/projects/shell";
import { useProjectStore } from "@/lib/projects/store";

type MonacoEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

function languageOf(path: string) {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "plaintext";
}

export function ProjectWorkspace({
  project,
  initialFiles,
  graphs,
  pinnedGraphIds,
  forkedFrom,
  userId,
  demo = false,
  demoGraphDocs,
  openPath: initialOpenPath,
}: {
  project: {
    id: string;
    name: string;
    description: string;
    active_graph_id: string | null;
  };
  initialFiles: { path: string; content: string }[];
  graphs: GraphSummary[];
  pinnedGraphIds: string[];
  forkedFrom: { id: string; title: string } | null;
  userId: string | null;
  /** anonymous demo: everything runs in-memory, Save routes to sign-in */
  demo?: boolean;
  /** graph docs supplied inline so demo mode never calls loadGraphDoc */
  demoGraphDocs?: Record<string, GraphDoc>;
  /** file to open on load (demo seeds a specific lesson file) */
  openPath?: string;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [copying, startCopying] = useTransition();
  const [creatingGraph, startCreatingGraph] = useTransition();
  // id of the graph whose document failed to load, and a counter to retry it
  const [graphLoadError, setGraphLoadError] = useState<string | null>(null);
  const [graphLoadRetry, setGraphLoadRetry] = useState(0);

  const initProject = useProjectStore((s) => s.init);
  const name = useProjectStore((s) => s.name);
  const setName = useProjectStore((s) => s.setName);
  const files = useProjectStore((s) => s.files);
  const openPath = useProjectStore((s) => s.openPath);
  const setContent = useProjectStore((s) => s.setContent);
  const activeGraphId = useProjectStore((s) => s.activeGraphId);
  const setActiveGraph = useProjectStore((s) => s.setActiveGraph);
  const graphIds = useProjectStore((s) => s.graphIds);
  const unpinGraph = useProjectStore((s) => s.unpinGraph);
  const dirty = useProjectStore((s) => s.dirty);

  const initEditor = useEditorStore((s) => s.init);
  const status = useEditorStore((s) => s.status);
  const graphDirty = useEditorStore((s) => s.dirty);

  const { run, stop } = usePythonRunner();
  usePlaybackLoop();

  // terminal working directory ("" = project root)
  const [cwd, setCwd] = useState("");
  // recorded line numbers only match the editors until a file is edited
  const [editedSinceRun, setEditedSinceRun] = useState(false);

  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [modelVersion, setModelVersion] = useState(0);

  // the editor holds the id of whichever graph's document is currently live.
  // The active graph's doc is fetched on demand (the picker only carries
  // summaries), so "still loading" is simply: a graph is selected but its
  // document isn't the one in the editor yet.
  const editorGraphId = useEditorStore((s) => s.graphId);

  useMonacoAppTheme(monacoRef);

  // panel handles for the collapse toggles in the top bar
  const filesPanel = usePanelRef();
  const rightPanel = usePanelRef();
  const terminalPanel = usePanelRef();

  useEffect(() => {
    initProject({
      id: project.id,
      name: project.name,
      description: project.description,
      activeGraphId: project.active_graph_id,
      graphIds: pinnedGraphIds,
      files: initialFiles,
      openPath: initialOpenPath,
    });
    // reset only when opening a different project
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const activeGraph = useMemo(
    () => graphs.find((graph) => graph.id === activeGraphId) ?? null,
    [graphs, activeGraphId],
  );
  // picker groups: pinned graphs first (in pin order), then the rest
  const pinnedGraphs = useMemo(
    () =>
      graphIds
        .map((id) => graphs.find((graph) => graph.id === id))
        .filter((graph): graph is GraphSummary => !!graph),
    [graphIds, graphs],
  );
  const unpinnedMine = useMemo(
    () =>
      graphs.filter((graph) => !graph.is_sample && !graphIds.includes(graph.id)),
    [graphs, graphIds],
  );
  const unpinnedSamples = useMemo(
    () =>
      graphs.filter((graph) => graph.is_sample && !graphIds.includes(graph.id)),
    [graphs, graphIds],
  );
  // demo graphs are editable in-memory even without an account
  const canEditGraph = demo
    ? !!activeGraph
    : !!activeGraph && !!userId && activeGraph.owner_id === userId;
  // a graph is selected but its document hasn't been paged in yet
  const graphLoading = !!activeGraphId && editorGraphId !== activeGraphId;

  function copyActiveGraph() {
    if (!activeGraph || copying) return;
    startCopying(async () => {
      const result = await duplicateGraph(activeGraph.id);
      if (result.ok && result.id) {
        setActiveGraph(result.id);
        toast.success("Copied — the copy is now your test graph");
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  function createNewGraph() {
    if (!userId || creatingGraph) return;
    startCreatingGraph(async () => {
      const result = await createGraph({ name: "Untitled graph" });
      if (result.ok && result.id) {
        setActiveGraph(result.id);
        toast.success("Graph created");
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  // load the selected test graph onto the canvas, fetching its document on
  // demand (the picker only knows counts, not the node/edge payload)
  useEffect(() => {
    // a run still streaming frames for the previous graph must not bleed
    // into the newly selected one
    if (useEditorStore.getState().status === "running") stop();

    if (!activeGraphId) {
      initEditor("", "", "", false, { nodes: [], edges: [] });
      return;
    }

    // already the live document — a router.refresh() (fresh `graphs` array) or
    // a metadata edit must not refetch and discard unsaved canvas edits
    if (useEditorStore.getState().graphId === activeGraphId) return;

    // a freshly created/copied graph isn't in `graphs` until the refresh
    // lands; the skeleton (derived from the editor's loaded id) stays up until
    // its summary arrives and we can load it
    const summary = graphs.find((graph) => graph.id === activeGraphId);
    if (!summary) return;

    // demo mode carries every graph's doc inline — no server round-trip, and
    // no load can fail, so graphLoadError stays null on its own
    if (demo) {
      initEditor(
        summary.id,
        summary.name,
        summary.description,
        summary.directed,
        demoGraphDocs?.[activeGraphId] ?? EMPTY_GRAPH_DOC,
      );
      return;
    }

    let cancelled = false;
    loadGraphDoc(activeGraphId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setGraphLoadError(null);
        initEditor(
          summary.id,
          summary.name,
          summary.description,
          summary.directed,
          result.doc,
        );
      } else {
        // Don't init the editor with the failed graph's id: that would both
        // block the refetch (the guard above) and mount an editable EMPTY
        // canvas whose Save would overwrite the real document. Show an error
        // panel instead; the Retry button re-runs this effect.
        toast.error(result.error);
        setGraphLoadError(summary.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeGraphId, graphs, initEditor, stop, graphLoadRetry, demo, demoGraphDocs]);

  const canRun =
    status === "ready" &&
    !!openPath &&
    openPath.endsWith(".py") &&
    !!activeGraph &&
    !graphLoading;

  function runFile(path: string) {
    const state = useProjectStore.getState();
    const content = state.files[path];
    if (content === undefined) return;
    setEditedSinceRun(false);
    run(
      content,
      Object.entries(state.files).map(([p, c]) => ({ path: p, content: c })),
      path,
    );
  }

  function runOpenFile() {
    const state = useProjectStore.getState();
    if (state.openPath) runFile(state.openPath);
  }

  function handleCommand(input: string) {
    const editor = useEditorStore.getState();
    const effect = runShellCommand(useProjectStore.getState().files, cwd, input);
    if (effect.clear) {
      editor.clearConsole();
      setCwd(effect.cwd);
      return;
    }
    editor.appendConsole({ kind: "command", prompt: promptFor(cwd), text: input });
    for (const line of effect.lines) editor.appendConsole(line);
    setCwd(effect.cwd);
    if (!effect.runFile) return;
    if (editor.status !== "ready") {
      editor.appendConsole({
        kind: "stderr",
        text: "python: the runtime is busy — stop the current run first",
      });
    } else if (!activeGraph) {
      editor.appendConsole({
        kind: "stderr",
        text: "python: pick a test graph first (selector in the top bar)",
      });
    } else {
      runFile(effect.runFile);
    }
  }

  // highlight the executing line while the open file matches the recording
  const showExecutingLine = useEditorStore((s) => s.showExecutingLine);
  const followExecutingLine = useEditorStore((s) => s.followExecutingLine);
  const setShowExecutingLine = useEditorStore((s) => s.setShowExecutingLine);
  const setFollowExecutingLine = useEditorStore(
    (s) => s.setFollowExecutingLine,
  );
  const highlightLine = useExecutingLine(openPath);
  useMonacoLineHighlight({
    editorRef,
    monacoRef,
    line: editedSinceRun || !showExecutingLine ? null : highlightLine,
    reveal: followExecutingLine,
    modelVersion,
  });
  useMonacoBreakpoints({ editorRef, file: openPath, modelVersion });

  // one save for the whole surface: the project files always, the test
  // graph's document too when it's the caller's to write
  function saveAll() {
    // demo has nothing to persist to — saving is the nudge to sign in
    if (demo) {
      router.push("/login?next=/projects");
      return;
    }
    if (saving) return;
    const projectState = useProjectStore.getState();
    const editor = useEditorStore.getState();
    const graphToSave = canEditGraph && editor.dirty ? activeGraph : null;
    startSaving(async () => {
      const [projectResult, graphResult] = await Promise.all([
        saveProject(projectState.projectId, projectState.toPayload()),
        graphToSave
          ? saveGraph(graphToSave.id, {
              name: editor.name,
              description: editor.description,
              directed: editor.directed,
              data: editor.toDoc(),
            })
          : Promise.resolve(null),
      ]);

      // each half keeps its own dirty flag so a partial failure stays dirty
      if (projectResult.ok) projectState.markSaved();
      else toast.error(projectResult.error);
      if (graphResult) {
        if (graphResult.ok) editor.markSaved();
        else toast.error(graphResult.error);
      }
      if (projectResult.ok && (!graphResult || graphResult.ok)) {
        toast.success(graphResult ? "Project and graph saved" : "Project saved");
      }
      // the picker's docs come from the server; refresh after a graph write
      if (graphResult?.ok) router.refresh();
    });
  }

  useSaveShortcut(saveAll);
  useUnsavedGuard(!demo && (dirty || graphDirty));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Tip label="All projects">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="All projects"
            asChild
          >
            <Link href="/library?tab=projects">
              <ArrowLeft />
            </Link>
          </Button>
        </Tip>
        <Input
          aria-label="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-8 w-56 border-transparent bg-transparent font-medium shadow-none hover:border-input"
        />
        {forkedFrom && (
          <Link
            href={`/posts/${forkedFrom.id}`}
            className="hidden items-center gap-1 truncate text-xs text-muted-foreground transition-colors hover:text-foreground lg:flex"
          >
            <GitFork className="size-3 shrink-0" />
            forked from “{forkedFrom.title}”
          </Link>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Select
            value={activeGraphId ?? "none"}
            onValueChange={(value) =>
              setActiveGraph(value === "none" ? null : value)
            }
          >
            <SelectTrigger size="sm" className="w-56">
              <Waypoints className="size-3.5 text-brand" />
              <SelectValue placeholder="Test graph" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No graph</SelectItem>
              {pinnedGraphs.length > 0 && (
                <SelectGroup>
                  <SelectLabel>This project</SelectLabel>
                  {pinnedGraphs.map((graph) => (
                    <SelectItem key={graph.id} value={graph.id}>
                      {graph.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {unpinnedMine.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Your graphs</SelectLabel>
                  {unpinnedMine.map((graph) => (
                    <SelectItem key={graph.id} value={graph.id}>
                      {graph.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {unpinnedSamples.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Samples</SelectLabel>
                  {unpinnedSamples.map((graph) => (
                    <SelectItem key={graph.id} value={graph.id}>
                      {graph.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {activeGraph && !canEditGraph && (
            <Badge
              variant="secondary"
              className="gap-1 font-normal whitespace-nowrap"
            >
              <Lock className="size-3" />
              Read-only
            </Badge>
          )}
          {userId && (
            <Tip label="New test graph">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New test graph"
                disabled={creatingGraph}
                onClick={createNewGraph}
              >
                {creatingGraph ? <Loader2 className="animate-spin" /> : <Plus />}
              </Button>
            </Tip>
          )}
          {activeGraph && !canEditGraph && userId && (
            <Tip label="Copy this graph into your graphs">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy this graph into your graphs"
                disabled={copying}
                onClick={copyActiveGraph}
              >
                {copying ? <Loader2 className="animate-spin" /> : <Copy />}
              </Button>
            </Tip>
          )}
          {canEditGraph && <DirectedToggle />}
          {activeGraph && graphIds.includes(activeGraph.id) && (
            <Tip label="Unpin this graph from the project">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Unpin this graph from the project"
                onClick={() => unpinGraph(activeGraph.id)}
              >
                <PinOff />
              </Button>
            </Tip>
          )}
          <div className="flex items-center">
            <Tip label="Toggle the file tree">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle file tree"
                onClick={togglePanel(filesPanel)}
              >
                <FolderTree />
              </Button>
            </Tip>
            <Tip label="Toggle the terminal">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle terminal"
                onClick={togglePanel(terminalPanel)}
              >
                <SquareTerminal />
              </Button>
            </Tip>
            <Tip label="Toggle the canvas column">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle canvas column"
                onClick={togglePanel(rightPanel)}
              >
                <PanelRight />
              </Button>
            </Tip>
          </div>

          {(dirty || graphDirty) && (
            <span className="text-xs text-muted-foreground">
              {dirty || canEditGraph
                ? "Unsaved changes"
                : "Local graph changes — copy to keep them"}
            </span>
          )}
          <Button
            size="sm"
            onClick={saveAll}
            disabled={
              demo ? false : (!dirty && !(canEditGraph && graphDirty)) || saving
            }
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save
          </Button>
        </div>
      </div>

      {demo && <DemoBanner />}

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          panelRef={filesPanel}
          collapsible
          collapsedSize="0%"
          style={{ overflow: "hidden" }}
          defaultSize="16%"
          minSize="10%"
          maxSize="30%"
        >
          <FileTree />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="42%" minSize="25%">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {openPath ?? "no file"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-xs text-muted-foreground xl:block">
                  ⌘⏎ runs the open file
                </span>
                <Tip label="Highlight the executing line during playback">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle executing-line highlight"
                    aria-pressed={showExecutingLine}
                    className={
                      showExecutingLine ? undefined : "text-muted-foreground/50"
                    }
                    onClick={() => setShowExecutingLine(!showExecutingLine)}
                  >
                    <Highlighter />
                  </Button>
                </Tip>
                <Tip label="Scroll the editor to follow the executing line">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle follow execution"
                    aria-pressed={followExecutingLine}
                    className={
                      followExecutingLine
                        ? undefined
                        : "text-muted-foreground/50"
                    }
                    onClick={() => setFollowExecutingLine(!followExecutingLine)}
                  >
                    <LocateFixed />
                  </Button>
                </Tip>
                {status === "running" ? (
                  <Button size="sm" variant="destructive" onClick={stop}>
                    <Square /> Stop
                  </Button>
                ) : (
                  <Button size="sm" disabled={!canRun} onClick={runOpenFile}>
                    {status === "booting" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Play />
                    )}
                    Run
                  </Button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {openPath ? (
                <Editor
                  path={`${project.id}/${openPath}`}
                  language={languageOf(openPath)}
                  value={files[openPath] ?? ""}
                  onChange={(value) => {
                    setContent(openPath, value ?? "");
                    setEditedSinceRun(true);
                  }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    monacoRef.current = monaco;
                    applyMonacoAppTheme(monaco);
                    editor.onDidChangeModel(() => setModelVersion((v) => v + 1));
                    editor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                      () => runOpenFile(),
                    );
                    // click the glyph margin to toggle a playback breakpoint
                    editor.onMouseDown((e) => {
                      if (
                        e.target.type !==
                        monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
                      )
                        return;
                      const line = e.target.position?.lineNumber;
                      // mount-time listener: read the open file from the store
                      const path = useProjectStore.getState().openPath;
                      if (line && path) {
                        useEditorStore
                          .getState()
                          .toggleBreakpoint(path, line);
                      }
                    });
                  }}
                  loading={
                    <span className="text-sm text-muted-foreground">
                      Loading editor…
                    </span>
                  }
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbersMinChars: 3,
                    scrollBeyondLastLine: false,
                    tabSize: 4,
                    wordWrap: "on",
                    automaticLayout: true,
                    padding: { top: 12 },
                    glyphMargin: true,
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Create a file to get started
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          panelRef={rightPanel}
          collapsible
          collapsedSize="0%"
          style={{ overflow: "hidden" }}
          defaultSize="42%"
          minSize="25%"
        >
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="62%" minSize="20%">
              {activeGraphId && graphLoadError === activeGraphId ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <span>Couldn’t load this graph’s document.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setGraphLoadRetry((t) => t + 1)}
                  >
                    <RotateCcw />
                    Retry
                  </Button>
                </div>
              ) : graphLoading ? (
                <div className="h-full w-full p-3">
                  <Skeleton className="h-full w-full rounded-lg" />
                </div>
              ) : activeGraph ? (
                // WebGL (Pixi) renderer with live playback + editing; canvas
                // edits are runnable immediately and Save persists them when
                // the graph is the caller's own
                <PixiGraphCanvas editable={canEditGraph} showPlayback />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Waypoints className="size-6" />
                  Pick a test graph from the selector above
                </div>
              )}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              panelRef={terminalPanel}
              collapsible
              collapsedSize="0%"
              style={{ overflow: "hidden" }}
              defaultSize="38%"
              minSize="15%"
            >
              <ConsolePanel
                shell={{ prompt: promptFor(cwd), onCommand: handleCommand }}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
