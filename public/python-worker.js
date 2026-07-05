/* global loadPyodide, importScripts */
// Python execution worker: Pyodide (CPython on WebAssembly) + networkx.
//
// Protocol (worker -> main):
//   { type: "ready" }                          boot finished
//   { type: "boot-error", message }            boot failed
//   { type: "stdout" | "stderr", runId, text } print()/errors from Python
//   { type: "frames", runId, frames }          batched animation frames from
//                                              the Graph API / line tracer
//                                              (JSON-safe objects)
//   { type: "done", runId }                    run finished cleanly
//   { type: "error", runId, message }          run raised
//
// (main -> worker):
//   { runId, prelude, code,
//     graph: { directed, nodes: [{id,name}], edges: [{source,target,weight}] },
//     files?: [{ path, content }], entryPath? }
//
// `entryPath` (project mode) is the project-relative path `code` came from;
// the code is then compiled as /project/<entryPath> so the prelude's tracer
// and tracebacks attribute lines to the real file.
//
// `files` (project mode) are written into /project on Pyodide's virtual
// filesystem before the run and /project is put on sys.path — so real
// `import helpers` works across a project's modules, and data files are
// readable with open("/project/data.txt").
//
// postMessage delivery is FIFO per sender, so "done" is guaranteed to arrive
// after every frame — no completion timers needed.

const PYODIDE_VERSION = "0.29.3";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

importScripts(`${INDEX_URL}pyodide.js`);

// The bridge Python imports from: the graph document going in, frames coming
// out. Registered ONCE — Python caches imported modules in sys.modules, so a
// per-run registration would leave later runs bound to a stale module (and
// their frames stamped with an old runId). Instead the module object is
// stable and its per-run state is mutated before each run. Frames cross the
// boundary as JSON strings so no PyProxy objects ever leak into the channel.
//
// Frames are BATCHED: a large run emits thousands (line tracing included),
// and a postMessage per frame melts the main thread with store updates.
const FLUSH_EVERY = 64;
const bridge = {
  run_id: 0,
  graph_json: "null",
  buffer: [],
  emit_frame(json) {
    bridge.buffer.push(JSON.parse(json));
    if (bridge.buffer.length >= FLUSH_EVERY) bridge.flush();
  },
  flush() {
    if (bridge.buffer.length === 0) return;
    self.postMessage({
      type: "frames",
      runId: bridge.run_id,
      frames: bridge.buffer,
    });
    bridge.buffer = [];
  },
};

const ready = (async () => {
  const pyodide = await loadPyodide({ indexURL: INDEX_URL });
  await pyodide.loadPackage(["networkx"]);
  pyodide.registerJsModule("graph_bridge", bridge);
  self.postMessage({ type: "ready" });
  return pyodide;
})();

ready.catch((error) => {
  self.postMessage({ type: "boot-error", message: String(error) });
});

// Reset /project to exactly `files`, and purge any modules imported from it
// so every run sees the latest file contents.
function syncProjectFiles(pyodide, files) {
  pyodide.runPython(`
import shutil, sys
shutil.rmtree("/project", ignore_errors=True)
for _name in [n for n, m in list(sys.modules.items())
              if (getattr(m, "__file__", "") or "").startswith("/project")]:
    del sys.modules[_name]
if "/project" not in sys.path:
    sys.path.insert(0, "/project")
`);
  for (const file of files) {
    const full = `/project/${file.path}`;
    const dir = full.slice(0, full.lastIndexOf("/"));
    pyodide.FS.mkdirTree(dir);
    pyodide.FS.writeFile(full, file.content);
  }
}

self.onmessage = async (event) => {
  const { runId, prelude, code, graph, files, entryPath } = event.data;

  let pyodide;
  try {
    pyodide = await ready;
  } catch {
    return; // boot-error already posted
  }

  bridge.run_id = runId;
  bridge.graph_json = JSON.stringify(graph);
  bridge.buffer = [];

  pyodide.setStdout({
    batched: (text) => self.postMessage({ type: "stdout", runId, text }),
  });
  pyodide.setStderr({
    batched: (text) => self.postMessage({ type: "stderr", runId, text }),
  });

  // Fresh namespace per run: no state bleeds between runs, and tracebacks
  // point at the user's own line numbers because the prelude runs separately.
  const namespace = pyodide.globals.get("dict")();
  try {
    if (Array.isArray(files)) syncProjectFiles(pyodide, files);
    pyodide.runPython(prelude, { globals: namespace });
    // The filename is how the prelude's sys.settrace hook recognizes the
    // user's code (and it makes tracebacks show the offending source line):
    // "algorithm.py" must match USER_CODE_FILENAME in lib/editor/python.ts;
    // project entry files run under their real /project path.
    const filename =
      Array.isArray(files) && entryPath
        ? `/project/${entryPath}`
        : "algorithm.py";
    await pyodide.runPythonAsync(code, { globals: namespace, filename });
    bridge.flush();
    self.postMessage({ type: "done", runId });
  } catch (error) {
    bridge.flush(); // frames emitted before the exception still count
    self.postMessage({
      type: "error",
      runId,
      message: String(error?.message ?? error),
    });
  } finally {
    // the prelude's line tracer is interpreter-global; don't trace between runs
    pyodide.runPython("import sys; sys.settrace(None)");
    namespace.destroy();
  }
};
