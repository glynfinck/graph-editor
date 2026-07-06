# Graph Editor Documentation

This document explains how to use the [Graph Editor](https://graph-editor.glyn.dev) web application: an interactive graph editor where **real Python drives the canvas**. Draw a graph, write a traversal in Python (networkx included), press Run, and watch every step of the algorithm animate, with play / pause / step / scrub controls.

Graph Editor is a ground-up rewrite of [graph-editor-react](https://github.com/glynfinck/graph-editor-react), the prototype I built by hand in 2021. The part that was always right, Python executing in the browser and talking to the canvas, is preserved and hardened; everything around it is new.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Notes on Usage](#notes-on-usage)
3. [The Graph Canvas](#the-graph-canvas)
   - [Creating Nodes](#creating-nodes)
   - [Creating Edges](#creating-edges)
   - [Moving and Selecting](#moving-and-selecting)
   - [Deleting Nodes and Edges](#deleting-nodes-and-edges)
   - [Renaming a Node](#renaming-a-node)
   - [Edge Weights and Labels](#edge-weights-and-labels)
   - [Node and Edge Attributes](#node-and-edge-attributes)
   - [Directed Graphs](#directed-graphs)
   - [Panning and Zooming](#panning-and-zooming)
4. [Running Code](#running-code)
   - [Playback](#playback)
   - [Breakpoints](#breakpoints)
   - [The Terminal](#the-terminal)
5. [The `graph` Python API](#the-graph-python-api)
6. [Projects](#projects)
7. [Library and Explore](#library-and-explore)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [Development](#development)

## Getting Started

There is nothing to install. Open the web app:

**<https://graph-editor.glyn.dev>**

- **Try it without an account.** The [interactive demo](https://graph-editor.glyn.dev/projects/demo) is a full workspace running entirely in your browser: edit the graph, edit the code, and run the bundled `bfs.py`, `dfs.py`, `dijkstra.py`, and `astar.py`.
- **Sign in with GitHub or Google** to save graphs and projects, duplicate public graphs into your own library, and publish posts.

## Notes on Usage

- Graphs can be **undirected or directed** (toggled per graph); edges can carry **weights** and **labels**, and both nodes and edges can carry custom **attributes** your algorithm reads.
- Your Python runs **entirely client-side** in a web worker (Pyodide, CPython on WebAssembly). Code and graphs are never executed on a server.
- The app is designed for **desktop browsers**; there is no dedicated mobile or touch support yet.
- Pick your look from the palette menu in the navbar (Gouache, Sea Glass, Riso Print, Clay & Moss), each in light and dark.
- Limits: 5,000 nodes and 15,000 edges per graph; 50 files per project.

## The Graph Canvas

The canvas caption sums it up: **double-click to add, drag from a rim to connect, ⌫ deletes.**

### Creating Nodes

Double-click any empty spot on the canvas. New nodes are named automatically (A, B, C, ...); rename them from the node inspector.

### Creating Edges

Press on a node's **rim** (the outer ring of the circle) and drag to another node; the edge snaps to the target when you get close and is created on release. Self-loops and duplicate edges are rejected.

### Moving and Selecting

Drag a node by its **body** (the center) to move it. A single click selects a node or an edge; clicking empty space clears the selection.

### Deleting Nodes and Edges

Select an element and press `DELETE` or `BACKSPACE`. Deleting a node also deletes every edge connected to it.

### Renaming a Node

Select a node and use the **Name** field in the node inspector that appears in the top-right corner of the canvas.

### Edge Weights and Labels

Select an edge to open the edge inspector (top-right corner). Set a numeric **Weight** (leave it blank for an unweighted edge) and an optional text **Label**. `graph.getWeight(a, b)` reads the weight from Python.

### Node and Edge Attributes

Weight and label are the built-in edge fields, but algorithms often need other per-element data — a max-flow's `capacity`, a graph-colouring's `color`, a scheduler's `duration`. The node and edge inspectors have an **Attributes** section for exactly this: click **Add** to create a `name → value` pair, and pick each value's type — **text**, **number**, or **boolean**. Up to 32 attributes per element.

Attributes are edited only here in the UI; your Python code **reads** them (it never writes them back). They travel with the graph, so duplicating or forking a graph carries its attributes along. Read them with `graph.getAttr(node, key)` / `graph.getEdgeAttr(a, b, key)`, or in bulk via `graph.getNodes(data=True)` / `graph.getEdges(data=True)`.

### Directed Graphs

Direction is a property of the whole graph. Toggle it with the **arrow button** in the editor top bar, or the **Directed** switch when creating a graph. In a directed graph, A → B and B → A are distinct edges and arrowheads are drawn; `graph.getNeighbors` follows successors only.

### Panning and Zooming

Drag empty canvas to pan and scroll to zoom at the cursor. Zoom in / zoom out / fit-to-view buttons sit in the bottom-right corner.

## Running Code

Code runs inside a **project workspace** (or the demo). Open a `.py` file, pick a test graph from the graph selector in the top bar, and press **Run** (or `CTRL/⌘ + ENTER`). While code is running the button becomes **Stop**, which terminates the Python worker and boots a fresh one, so a runaway `while True:` can never wedge the page.

### Playback

The animation streams live as your code runs, then stays scrubbable:

- **Play / pause**, **step forward**, **step back**, and **reset to start**
- A **scrub slider** showing the current frame out of the total
- A **speed slider** (turtle to rabbit)
- An **Events / Steps** toggle: rest on graph events only, or on every executed statement

### Breakpoints

Click a line's glyph margin in the editor to toggle a breakpoint. When breakpoints exist, playback gains **run to next breakpoint** and a **pause-at-breakpoints** toggle. The editor can also highlight the currently executing line and follow execution as it moves.

### The Terminal

`print()` output lands in the terminal panel under the canvas, along with run status and tracebacks that point at your own line numbers. In a project the terminal is interactive: `ls`, `cd`, `pwd`, `cat`, `python <file>`, `clear`, and `help`, with arrow-key history.

## The `graph` Python API

Your code gets a `graph` object already wired to the canvas. Helper files can import it too: `from graph_editor import graph`.

| Method | Effect |
| --- | --- |
| `graph.getNodes(data=False)` | node names (with attributes if `data=True`) |
| `graph.getEdges(data=False)` | edge pairs (with attributes if `data=True`) |
| `graph.getNeighbors(n)` | adjacent names; successors only when directed |
| `graph.hasNode(n)` / `graph.hasEdge(a, b)` | membership checks |
| `graph.getWeight(a, b, default=1)` | edge weight, or `default` when unweighted |
| `graph.getAttr(n, key, default=None)` | a node's attribute (set in the inspector), or `default` |
| `graph.getEdgeAttr(a, b, key, default=None)` | an edge's attribute, or `default` |
| `graph.getPosition(n)` | canvas `(x, y)` of a node (y grows downward), handy for A* heuristics |
| `graph.markPath(nodes)` | paint a node sequence as the final path |
| `graph.setCurrentNode(n, peek=False, path=False)` | move the cursor; mark visited (or path) |
| `graph.setCurrentEdge(a, b, peek=False, path=False)` | same for an edge |
| `graph.directed` | whether the graph is directed |
| `graph.G` | the underlying `networkx.Graph` / `networkx.DiGraph` |

Animation is automatic by default: calls like `graph.getNeighbors(n)` animate the visit as they execute. The moment you call `setCurrentNode` / `setCurrentEdge` yourself, implicit animation turns off and you control the cursor manually. `peek=True` highlights without marking visited; `path=True` paints the element as part of the final path.

```python
from collections import deque

def bfs(start):
    visited, queue = set(), deque([start])
    while queue:
        node = queue.popleft()
        if node in visited:
            continue
        visited.add(node)
        graph.setCurrentNode(node)              # highlight as visited
        for neighbor in graph.getNeighbors(node):
            graph.setCurrentEdge(node, neighbor, peek=True)
            queue.append(neighbor)

bfs(graph.getNodes()[0])
```

## Projects

A project is a multi-file Python workspace. New projects start with `main.py` and `helpers.py`.

- **Files**: add from the file tree header; slash-separated paths (`algos/bfs.py`) create folders implicitly. Rename and delete from the tree; deletions and renames are staged and take effect on Save.
- **Real imports work across files** (`from helpers import bfs`): before each run your files are written into `/project` on Pyodide's virtual filesystem and put on `sys.path`. Data files are readable with `open("/project/data.txt")`.
- **Test graphs**: the top-bar graph selector offers pinned project graphs, your graphs, and the samples; Run executes the open file against the selected graph. You can pin up to 10 graphs per project, copy a read-only graph into your own account, or create a new test graph in place.
- **Save** (`CTRL/⌘ + S`) persists the project files and, if you own it, the test graph in one go. The app warns before you close a tab with unsaved changes.

Projects and their files are private to their owner, enforced by row-level security in Postgres.

## Library and Explore

- **Library** is your home base: your graphs, projects, and posts, with search, sort, and grid/table views.
- **Explore** is the public side: community graphs, official lessons (BFS, DFS, Dijkstra, A*), and posts. Lessons can be forked straight into a project.
- Graphs are **private by default**; make one public from its card menu and it shows up in Explore. Samples are ownerless and immutable; **Duplicate** copies any visible graph into your account.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `CTRL/⌘ + K` | command palette (search your projects, graphs, posts) |
| `CTRL/⌘ + ENTER` | run the open file |
| `CTRL/⌘ + S` | save project + test graph |
| `DELETE` / `BACKSPACE` | delete the selected node or edge |
| `↑` / `↓` | terminal history |

## Development

The stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui · Pixi.js (WebGL canvas) · Monaco (editor) · Zustand (editor state) · Pyodide + networkx (Python runtime) · Supabase (Postgres, Auth, RLS) · Vercel + GitHub Actions.

```bash
npm install
supabase start          # local Postgres + Auth
supabase db reset       # apply migrations + seed sample graphs
cp .env.example .env.local   # fill keys from `supabase status`
npm run dev
```

`npm test` runs the unit tests (frame/playback semantics); `npm run test:integration` runs the RLS isolation matrix against the local Supabase. Migrations apply to production from GitHub Actions on push to `main`.
