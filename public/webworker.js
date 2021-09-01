// webworker.js

// Setup your project to serve `py-worker.js`. You should also serve
// `pyodide.js`, and all its associated `.asm.js`, `.data`, `.json`,
// and `.wasm` files as well:
importScripts("https://cdn.jsdelivr.net/pyodide/v0.18.0/full/pyodide.js");

async function loadPyodideAndPackages() {
	self.postMessage({ type: "WORKER_INIT", payload: false });
	// redefine the console log function in order to supress
	// the initial logging in the console
	console.log = function (data) {
		postMessage({ type: "CONOSOLE_OUTPUT", payload: data });
	};

	self.pyodide = await loadPyodide({
		indexURL: "https://cdn.jsdelivr.net/pyodide/v0.18.0/full/",
	});

	await self.pyodide.loadPackage(["networkx"]);

	self.postMessage({ type: "PACKAGES_LOADED" });
}

let pyodideReadyPromise = loadPyodideAndPackages();

self.onmessage = async (event) => {
	// make sure loading is done
	await pyodideReadyPromise;

	// Don't bother yet with this line, suppose our API is built in such a way:
	const { python, ...context } = event.data;
	// The worker copies the context in its own "memory" (an object mapping name to values)
	for (const key of Object.keys(context)) {
		self[key] = context[key];
	}

	// Now is the easy part, the one that is similar to working in the main thread:
	try {
		self.pyodide.runPython("import networkx as nx");
		self.pyodide.runPython("import copy");
		self.pyodide.runPython("import numpy as np");
		self.pyodide.runPython("import time");
		self.pyodide.runPython(python);
		// let result = await self.pyodide.runPythonAsync(python);
		// self.postMessage({ result: result });

		// set timeout for 500ms as I noticed a postMessage from  the python
		// script posted before the completed message
		// TODO maybe fix this to make more robust
		setTimeout(() => {
			self.postMessage({ type: "COMPLETED", payload: null });
		}, 100);
	} catch (error) {
		self.postMessage({ type: "ERROR_MESSAGE", payload: error.message });
	}
};
