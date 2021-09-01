import React, { useState, useEffect, useCallback } from "react";

import { defaultNodes, defaultEdges } from "./default-data";

const GraphEdtiorContext = React.createContext({
	loaded: false,
	simulating: false,
	nodes: defaultNodes,
	edges: defaultEdges,
	code: "",
	addNode: (node) => {},
	addEdge: (edge) => {},
	removeNode: (node) => {},
	removeEdge: (edge) => {},
	selectNode: (node) => {},
	selectEdge: () => {},
	setCurrentNode: (node, path = false) => {},
	setCurrentEdge: (edge, path = false) => {},
});

const deriveContext = (nodes, edges) => {
	let contextNodes = [];
	let contextEdges = [];
	let contextNodeIDs = [];
	// construct map O(n)
	let idMap = new Map();
	nodes.forEach((value, idx, arr) => {
		contextNodes.push(value.title);
		contextNodeIDs.push(value.id);
		idMap.set(value.id, value.title);
	});
	// set context O(m)
	edges.forEach((value, idx, arr) => {
		contextEdges.push([idMap.get(value.source), idMap.get(value.target)]);
	});
	return {
		nodes: contextNodes,
		edges: contextEdges,
		node_ids: contextNodeIDs,
	};
};

export const GraphContextProvider = (props) => {
	// set code, nodes, and edges to props if provided
	const [nodes, setNodes] = useState([]);
	const [edges, setEdges] = useState([]);
	const [code, setCode] = useState("");

	// initialize nodes, edges, and code based on props
	useEffect(() => {
		setNodes(props.nodes);
		setEdges(props.edges);
		setCode(props.code);
	}, [props.nodes, props.edges, props.code]);

	// derive context from nodes and edges
	const context = deriveContext(nodes, edges);

	// set up onGraphChanged prop
  
  

	// set up webworker state

	const contextValue = {
		loaded: false,
		simulating: false,
		nodes: nodes,
		edges: edges,
		code: code,
		addNode: (node) => {},
		addEdge: (edge) => {},
		removeNode: (node) => {},
		removeEdge: (edge) => {},
		selectNode: (node) => {},
		selectEdge: () => {},
		setCurrentNode: (node, path = false) => {},
		setCurrentEdge: (edge, path = false) => {},
	};

	return (
		<GraphEdtiorContext.Provider value={contextValue}>
			{props.children}
		</GraphEdtiorContext.Provider>
	);
};

export default GraphEdtiorContext;
