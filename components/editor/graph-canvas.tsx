"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { toast } from "sonner";

import { EdgeInspector } from "@/components/editor/edge-inspector";
import {
  FloatingConnectionLine,
  FloatingEdge,
} from "@/components/editor/floating-edge";
import { GraphNode, NODE_DIAMETER } from "@/components/editor/graph-node";
import { NodeInspector } from "@/components/editor/node-inspector";
import { PlaybackControls } from "@/components/editor/playback-controls";
import { GraphDecorator } from "@/lib/editor/graph-decoration";
import { useEditorStore } from "@/lib/editor/store";
import { MAX_EDGES, MAX_NODES } from "@/lib/graph/types";

const nodeTypes = { graphNode: GraphNode };
const edgeTypes = { floating: FloatingEdge };

function Canvas({
  editable,
  showPlayback,
}: {
  editable: boolean;
  showPlayback: boolean;
}) {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const directed = useEditorStore((s) => s.directed);
  const frames = useEditorStore((s) => s.frames);
  const playhead = useEditorStore((s) => s.playhead);
  const onNodesChange = useEditorStore((s) => s.onNodesChange);
  const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
  const connect = useEditorStore((s) => s.connect);
  const addNodeAt = useEditorStore((s) => s.addNodeAt);

  const { screenToFlowPosition, fitView } = useReactFlow();

  // Refit once the resizable panels have settled — the initial fitView can
  // run while the canvas panel is still sizing itself.
  useEffect(() => {
    const timer = setTimeout(() => void fitView({ padding: 0.25 }), 60);
    return () => clearTimeout(timer);
  }, [fitView]);

  // Playback decoration is incremental (see GraphDecorator): each tick folds
  // only the new frames and rebuilds only the dimension that moved, so big
  // graphs don't re-derive every node/edge on every frame.
  const [decorator] = useState(() => new GraphDecorator());
  const { nodes: decoratedNodes, edges: decoratedEdges } = useMemo(
    () => decorator.decorate(frames, playhead, directed, nodes, edges, editable),
    [decorator, frames, playhead, directed, nodes, edges, editable],
  );

  // exactly one selected node / edge → show its inspector (edit-only)
  const selectedNodeId = useMemo(() => {
    if (!editable) return null;
    const selected = nodes.filter((node) => node.selected);
    return selected.length === 1 ? selected[0].id : null;
  }, [editable, nodes]);

  const selectedEdgeId = useMemo(() => {
    if (!editable) return null;
    const selected = edges.filter((edge) => edge.selected);
    return selected.length === 1 ? selected[0].id : null;
  }, [editable, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (edges.length >= MAX_EDGES) {
        toast.error(`Graphs are limited to ${MAX_EDGES.toLocaleString()} edges.`);
        return;
      }
      connect(connection.source, connection.target);
    },
    [connect, edges.length],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!editable || event.detail !== 2) return;
      if (nodes.length >= MAX_NODES) {
        toast.error(`Graphs are limited to ${MAX_NODES.toLocaleString()} nodes.`);
        return;
      }
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // a node's position is its top-left corner, so offset by half its size
      // to center the new node on the click instead of dropping it to the SE
      addNodeAt(position.x - NODE_DIAMETER / 2, position.y - NODE_DIAMETER / 2);
    },
    [editable, nodes.length, screenToFlowPosition, addNodeAt],
  );

  return (
    <ReactFlow
      nodes={decoratedNodes}
      edges={decoratedEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onPaneClick={onPaneClick}
      connectionMode={ConnectionMode.Loose}
      connectionLineComponent={FloatingConnectionLine}
      connectionRadius={36}
      // only large graphs virtualize — small graphs (the common case) render
      // everything exactly as before, so this can't regress them
      onlyRenderVisibleElements={nodes.length > 200}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={2.5}
      zoomOnDoubleClick={false}
      nodesDraggable={editable}
      nodesConnectable={editable}
      deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.25}
        color="var(--border)"
      />
      <Controls showInteractive={false} />
      {selectedNodeId ? (
        <Panel position="top-right">
          <NodeInspector nodeId={selectedNodeId} />
        </Panel>
      ) : selectedEdgeId ? (
        <Panel position="top-right">
          <EdgeInspector edgeId={selectedEdgeId} directed={directed} />
        </Panel>
      ) : null}
      {showPlayback && (
        <Panel position="top-center">
          <PlaybackControls />
        </Panel>
      )}
      {editable && (
        <Panel
          position="bottom-center"
          className="pointer-events-none text-xs text-muted-foreground"
        >
          double-click to add a node · drag from a node&apos;s rim to connect ·
          select + ⌫ to delete
        </Panel>
      )}
    </ReactFlow>
  );
}

export function GraphCanvas({
  editable,
  showPlayback = true,
}: {
  editable: boolean;
  /** hide the playback bar on surfaces that never run code (pure viewers) */
  showPlayback?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <Canvas editable={editable} showPlayback={showPlayback} />
    </ReactFlowProvider>
  );
}
