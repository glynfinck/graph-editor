/**
 * The Python side of the bridge. This prelude runs (in a fresh namespace)
 * before the user's code and defines the `graph` object — a networkx graph
 * mirroring the canvas whose reads stream animation frames back to the
 * editor.
 *
 * Animation is implicit: graph.getNeighbors(node) marks the node visited
 * (promoting the edge it was discovered through) and highlights each edge as
 * the caller's loop consumes it, so plain textbook traversals animate with no
 * editor-specific calls. The explicit setCurrentNode/setCurrentEdge methods
 * remain as a manual override — the first explicit call switches implicit
 * animation off for the rest of the run.
 *
 * A sys.settrace hook scoped to the user's code emits a "line" frame per
 * executed statement and stamps every graph frame with the file + line that
 * produced it — this is what lets the code panels step in sync with the
 * canvas. Traced files are the editor buffer (compiled as USER_CODE_FILENAME)
 * and project modules under /project/.
 */

/** Filename the worker compiles single-buffer code under; the tracer keys off it. */
export const USER_CODE_FILENAME = "algorithm.py";

export const PYTHON_PRELUDE = `import json as _json
import networkx as nx
from graph_bridge import graph_json as _graph_json, emit_frame as _emit_frame

_current_line = None
_current_file = None


def _emit(**frame):
    if _current_line is not None and "line" not in frame:
        frame["line"] = _current_line
        if _current_file is not None:
            frame["file"] = _current_file
    _emit_frame(_json.dumps(frame))


class Graph:
    """The graph on the canvas. Nodes are addressed by their name (e.g. "A").
    It's a networkx DiGraph when the graph is directed, otherwise a Graph, so
    getNeighbors() follows successors only on a directed graph. Edge weights
    (when set) are read with getWeight(source, target); each node's canvas
    (x, y) is read with getPosition(node) — handy for A*-style heuristics.

    The canvas animates implicitly as the algorithm reads the graph:
      getNeighbors(node)   marks node visited (and promotes the edge it was
                           discovered through), then highlights each edge as
                           the loop consumes a neighbour
      markPath(nodes)      paints a node sequence as the final path

    For manual control call the explicit methods — the first call switches
    implicit animation off for the rest of the run:
      setCurrentNode(node, peek=False, path=False)
      setCurrentEdge(source, target, peek=False, path=False)
    peek=True highlights without marking visited; path=True marks the
    element as part of the final path.
    """

    def __init__(self, data):
        name_of = {n["id"]: n["name"] for n in data["nodes"]}
        self._id_of = {n["name"]: n["id"] for n in data["nodes"]}
        self.directed = bool(data.get("directed"))
        # a directed graph traverses successors only; an undirected one both ways
        self.G = nx.DiGraph() if self.directed else nx.Graph()
        self._pos = {}
        for node in data["nodes"]:
            self.G.add_node(node["name"], id=node["id"])
            self._pos[node["name"]] = (
                float(node.get("x", 0.0)),
                float(node.get("y", 0.0)),
            )
        for edge in data["edges"]:
            u, v = name_of[edge["source"]], name_of[edge["target"]]
            weight = edge.get("weight")
            # unweighted edges carry no weight attr; getWeight() defaults them
            if weight is None:
                self.G.add_edge(u, v)
            else:
                self.G.add_edge(u, v, weight=weight)
        self._implicit = True
        self._expanded = set()
        self._discovered_via = {}

    def getNodes(self, data=False):
        return self.G.nodes.data() if data else self.G.nodes

    def getEdges(self, data=False):
        return self.G.edges.data() if data else self.G.edges

    def hasNode(self, node):
        return self.G.has_node(node)

    def hasEdge(self, source, target):
        return self.G.has_edge(source, target)

    def getPosition(self, node):
        """The node's (x, y) position on the canvas — the basis for a
        straight-line A* heuristic. Note y grows downward (screen coords)."""
        return self._pos.get(node, (0.0, 0.0))

    def getWeight(self, source, target, default=1):
        """Weight of edge source->target, or \`default\` if it's unweighted."""
        if not self.G.has_edge(source, target):
            return default
        return self.G[source][target].get("weight", default)

    def getNeighbors(self, node):
        neighbors = self.G.adj[node]
        if not self._implicit:
            return neighbors
        # expanding a node is what "visiting" looks like from the data side
        if node not in self._expanded:
            self._expanded.add(node)
            via = self._discovered_via.pop(node, None)
            if via is not None:
                self._emit_edge(via, node)
        self._emit_node(node)
        return self._peek_iter(node, neighbors)

    def _peek_iter(self, node, neighbors):
        for neighbour in neighbors:
            if self._implicit:
                self._emit_edge(node, neighbour, peek=True)
                if neighbour not in self._expanded:
                    # first discoverer wins (matches BFS/DFS discovery order)
                    self._discovered_via.setdefault(neighbour, node)
            yield neighbour

    def markPath(self, nodes):
        nodes = list(nodes)
        for node in nodes:
            if not self.G.has_node(node):
                print(f"markPath: {node!r} is not in the graph")
                return
        for a, b in zip(nodes, nodes[1:]):
            if not self.G.has_edge(a, b):
                print(f"markPath: {a!r}-{b!r} is not in the graph")
                return
        for i, node in enumerate(nodes):
            self._emit_node(node, path=True)
            if i + 1 < len(nodes):
                self._emit_edge(node, nodes[i + 1], path=True)

    def setCurrentNode(self, node, peek=False, path=False):
        self._implicit = False
        if not self.G.has_node(node):
            print(f"setCurrentNode: {node!r} is not in the graph")
            return
        self._emit_node(node, peek, path)

    def setCurrentEdge(self, source, target, peek=False, path=False):
        self._implicit = False
        if not self.G.has_edge(source, target):
            print(f"setCurrentEdge: {source!r}-{target!r} is not in the graph")
            return
        self._emit_edge(source, target, peek, path)

    def _emit_node(self, node, peek=False, path=False):
        _emit(kind="node", id=self._id_of[node], peek=bool(peek), path=bool(path))

    def _emit_edge(self, source, target, peek=False, path=False):
        _emit(
            kind="edge",
            source=self._id_of[source],
            target=self._id_of[target],
            peek=bool(peek),
            path=bool(path),
        )


graph = Graph(_json.loads(_graph_json))

# Expose the live graph to project modules: helper files can do
#   from graph_editor import graph
import sys as _sys
import types as _types

_module = _types.ModuleType("graph_editor")
_module.graph = graph
_module.Graph = Graph
_sys.modules["graph_editor"] = _module


# Line tracing, scoped to the user's own code: the editor buffer (compiled as
# USER_CODE_FILENAME) and project modules under /project/. Emits a "line"
# frame per executed statement and keeps _current_line/_current_file pointing
# at the statement currently running, so graph frames record their source.
def _source_file(path):
    if path == "${USER_CODE_FILENAME}":
        return path
    if path.startswith("/project/"):
        return path[len("/project/"):]
    return None


def _trace_lines(frame, event, arg):
    global _current_line, _current_file
    if event == "line":
        _current_line = frame.f_lineno
        _current_file = _source_file(frame.f_code.co_filename)
        _emit(kind="line", line=_current_line, file=_current_file)
    return _trace_lines


def _trace_calls(frame, event, arg):
    if _source_file(frame.f_code.co_filename) is not None:
        return _trace_lines
    return None  # don't trace the prelude, networkx or stdlib


_sys.settrace(_trace_calls)
`;

export type AlgorithmPreset = {
  id: string;
  name: string;
  code: string;
};

// NOTE: the official lesson posts in supabase/seed.sql duplicate these code
// strings inside their markdown bodies — keep the two in sync.

const BFS = `# Breadth-first search from node "A" — the canvas animates on its own
# as the algorithm reads the graph through graph.getNeighbors().
from collections import deque

start = "A"
visited = {start}
queue = deque([start])

while queue:
    node = queue.popleft()
    print(node)
    for neighbour in graph.getNeighbors(node):
        if neighbour not in visited:
            visited.add(neighbour)
            queue.append(neighbour)
`;

const DFS = `# Depth-first search from node "A" — the canvas animates on its own
# as the algorithm reads the graph through graph.getNeighbors().
visited = set()

def dfs(node):
    if node in visited:
        return
    visited.add(node)
    print(node)
    for neighbour in graph.getNeighbors(node):
        dfs(neighbour)

dfs("A")
`;

const DIJKSTRA = `# Dijkstra's shortest path, then highlight it. Uses edge weights via
# graph.getWeight(u, v) — unweighted edges count as 1.
import heapq

source, target = "A", "D"

dist = {node: float("inf") for node in graph.getNodes()}
prev = {node: None for node in graph.getNodes()}
dist[source] = 0
heap = [(0, source)]
seen = set()

while heap:
    d, node = heapq.heappop(heap)
    if node in seen:
        continue
    seen.add(node)
    for neighbour in graph.getNeighbors(node):
        if neighbour in seen:
            continue
        alt = d + graph.getWeight(node, neighbour)
        if alt < dist[neighbour]:
            dist[neighbour] = alt
            prev[neighbour] = node
            heapq.heappush(heap, (alt, neighbour))

print("distances:", dist)

if not graph.hasNode(target):
    print(f"no node {target!r} to trace a path to")
else:
    path = []
    node = target
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()
    print("path:", " -> ".join(path))
    graph.markPath(path)
`;

const ASTAR = `# A* shortest path — Dijkstra steered toward the goal by a straight-line
# heuristic, so it explores far fewer nodes. Node positions come from
# graph.getPosition(); edge weights from graph.getWeight() (1 when unweighted).
import heapq

nodes = list(graph.getNodes())
start, goal = nodes[0], nodes[-1]   # first and last node — change as you like


def heuristic(node):
    # straight-line (Euclidean) distance to the goal — never overestimates the
    # real cost when weights are distances, which is what keeps A* correct
    x1, y1 = graph.getPosition(node)
    x2, y2 = graph.getPosition(goal)
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5


g = {node: float("inf") for node in nodes}   # best cost found to each node
prev = {node: None for node in nodes}
g[start] = 0
# the heap is ordered by f = g + h (estimated total trip through the node)
heap = [(heuristic(start), start)]
seen = set()

while heap:
    _, node = heapq.heappop(heap)
    if node in seen:
        continue
    seen.add(node)
    if node == goal:
        break
    for neighbour in graph.getNeighbors(node):
        if neighbour in seen:
            continue
        tentative = g[node] + graph.getWeight(node, neighbour)
        if tentative < g[neighbour]:
            g[neighbour] = tentative
            prev[neighbour] = node
            heapq.heappush(heap, (tentative + heuristic(neighbour), neighbour))

path = []
node = goal
while node is not None:
    path.append(node)
    node = prev[node]
path.reverse()

if path and path[0] == start:
    print(f"cost {start} -> {goal}: {g[goal]:.0f}")
    print("path:", " -> ".join(path))
    graph.markPath(path)
else:
    print(f"no route from {start} to {goal}")
`;

const BLANK = `# The canvas graph is available as \`graph\`. It animates automatically as
# your code reads it — no editor-specific calls needed.
#
#   graph.getNodes()                     node names
#   graph.getEdges()                     edge pairs
#   graph.getNeighbors(node)             adjacent names (animates the canvas)
#   graph.hasNode(n) / graph.hasEdge(a, b)
#   graph.getWeight(a, b)                edge weight (1 when unweighted)
#   graph.getPosition(node)              node (x, y) — for A* heuristics
#   graph.markPath(["A", "B", ...])      paint a final path
#   graph.G                              the underlying networkx graph
#
# Manual override: graph.setCurrentNode(n, peek=, path=) and
# graph.setCurrentEdge(a, b, peek=, path=) — the first explicit call turns
# the automatic animation off for the rest of the run.
#
# print() output appears in the terminal below.

for node in graph.getNodes():
    print(node, "->", ", ".join(graph.getNeighbors(node)))
`;

export const ALGORITHM_PRESETS: AlgorithmPreset[] = [
  { id: "dfs", name: "Depth-first search", code: DFS },
  { id: "bfs", name: "Breadth-first search", code: BFS },
  { id: "dijkstra", name: "Dijkstra's shortest path", code: DIJKSTRA },
  { id: "astar", name: "A* shortest path", code: ASTAR },
  { id: "blank", name: "Scratchpad", code: BLANK },
];

export const DEFAULT_ALGORITHM_ID = "dfs";
