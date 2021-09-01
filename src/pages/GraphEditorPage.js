import GraphEditor from "../components/GraphEditor/GraphEditor";
import Modal from "../components/UI/Modal";
import { Fragment, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { uiActions } from "../store/ui/ui";
import Help from "../components/Help/Help";

const GraphEditorPage = () => {
	const [code, setCode] = useState("");
	const [nodes, setNodes] = useState([]);
	const [edges, setEdges] = useState([]);
	const isHelpModalOpen = useSelector((state) => state.ui.isHelpModalOpen);
	const dispatch = useDispatch();

	const handleClose = () => {
		dispatch(uiActions.closeHelpModal());
	};

	const onGraphChanged = (code, nodes, edges) => {
		setCode(code);
		setNodes(nodes);
		setEdges(edges);
	};

	return (
		<Fragment>
			{isHelpModalOpen && (
				<Modal onClose={handleClose}>
					<Help></Help>
				</Modal>
			)}
			<GraphEditor
				nodes={nodes}
				edges={edges}
				code={code}
				onGraphChanged={onGraphChanged}
			/>
			;
		</Fragment>
	);
};

export default GraphEditorPage;
