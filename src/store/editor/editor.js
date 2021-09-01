import { createSlice } from "@reduxjs/toolkit";
import { dfs, bfs, dikstras } from "./python/algorithms.js";

const initialEditorSlice = {
	algorithms: [
		{ name: "BFS", code: bfs },
		{
			name: "DFS",
			code: dfs,
		},
		{ name: "DIKSTRAS", code: dikstras },
	],
	selectedAlgorithm: 2,
	script: "",
	output: "",
	isScriptProcessing: false,
	isEditorLoading: true,
};

const editorSlice = createSlice({
	name: "editor",
	initialState: initialEditorSlice,
	reducers: {
		setScript(state, action) {
			state.script = action.payload;
		},
		setOutput(state, action) {
			state.output = action.payload;
		},
		setIsEditorLoading(state, action) {
			state.isEditorLoading = action.payload;
		},
		setSelectedAlgorithm(state, action) {
			state.selectedAlgorithm = action.payload;
		},
	},
});

export const editorActions = editorSlice.actions;

export default editorSlice.reducer;
