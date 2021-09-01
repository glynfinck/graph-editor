import { Split } from "@geoffcox/react-splitter";
import GraphWindow from "./graph/GraphWindow";
import EditorWindow from "./editor/EditorWindow";

import classes from "./GraphEdtior.module.css";
import usePyodide from "../../hooks/use-pyodide";
import { useDispatch } from "react-redux";
import { GraphContextProvider } from "./store/graph-edtior-context";
import { useEffect } from "react";
import { graphActions } from "../../store/graph/graph";

const minWindowWidth = 400;

const GraphEditor = (props) => {
	const onSplitPaneChanged = (event) => {
		console.log(+event[0] / 100);
	};

	const colors = {
		color: "#f1f1f1",
		hover: "#f1f1f1",
		drag: "#f1f1f1",
	};

	const renderSplitter = (props) => {
		return <div className={classes.splitter}></div>;
	};

	return (
		<Split
			renderSplitter={renderSplitter}
			splitterSize={"8px"}
			defaultSplitterColors={colors}
			minPrimarySize={`${minWindowWidth}px`}
			minSecondarySize={`${minWindowWidth}px`}
			initialPrimarySize={"50%"}
			onChange={onSplitPaneChanged}
		>
			<GraphWindow></GraphWindow>
			<EditorWindow></EditorWindow>
		</Split>
	);
};

export default GraphEditor;
