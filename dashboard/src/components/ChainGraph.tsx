import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import type { Chain, ChainNode } from "../lib/types";
import { TACTIC_COLOR, shortTactic } from "../lib/style";
import { layoutChain } from "../lib/layout";

interface NodeData {
  node: ChainNode;
  selected: boolean;
  onAddChild?: (parentId: string) => void;
}

function StepNode({ data }: NodeProps<NodeData>) {
  const { node, selected, onAddChild } = data;
  const color = TACTIC_COLOR[node.tactic];
  const isProposed = node.status === "proposed";
  return (
    <div
      className="rounded-md border bg-zinc-900/95 text-zinc-100 shadow-md transition group"
      style={{
        borderColor: selected ? "#f59e0b" : isProposed ? "#92400e" : "#3f3f46",
        boxShadow: selected ? "0 0 0 1px #f59e0b" : undefined,
        width: 210,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-zinc-800">
        <span
          className="inline-flex items-center justify-center rounded-sm text-[9px] font-mono px-1 py-0.5"
          style={{ background: `${color}33`, color }}
          title={node.tactic}
        >
          {shortTactic(node.tactic)}
        </span>
        <span className="text-[10px] text-zinc-400 font-mono">step {node.step}</span>
        {isProposed && (
          <span className="text-[9px] font-mono px-1 rounded bg-amber-900/50 text-amber-300" title="proposed">⚑</span>
        )}
        <span className="ml-auto text-[9px] text-zinc-500 font-mono">{node.techniqueId}</span>
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[12px] text-zinc-50 leading-tight">{node.title}</div>
        <div className="mt-1 text-[10px] text-zinc-500 leading-snug line-clamp-2">{node.techniqueName}</div>
      </div>
      <div className="px-2 pb-1.5 flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
        <span title="static evidence count">S·{node.evidence.filter((e) => e.category === "static").length}</span>
        <span title="dynamic evidence count">D·{node.evidence.filter((e) => e.category === "dynamic").length}</span>
        <span title="IOC count" className="ml-auto">⌖·{node.iocs.length}</span>
      </div>
      {onAddChild && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node.id);
          }}
          className="absolute -right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-amber-500 hover:text-amber-300 opacity-0 group-hover:opacity-100 transition text-[12px] leading-none flex items-center justify-center"
          title="add child step after this one"
        >
          +
        </button>
      )}
      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </div>
  );
}

const nodeTypes = { step: StepNode };

export function ChainGraph({
  chain,
  selectedNodeId,
  onSelectNode,
  onAddChild,
  onAddRoot,
  onConnectNodes,
}: {
  chain: Chain;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onAddRoot?: () => void;
  onConnectNodes?: () => void;
}) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const positions = new Map(layoutChain(chain.nodes, chain.edges).map((p) => [p.id, p]));
    const rfNodes: Node<NodeData>[] = chain.nodes.map((n) => ({
      id: n.id,
      type: "step",
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: { node: n, selected: n.id === selectedNodeId, onAddChild },
      draggable: false,
    }));
    const rfEdges: Edge[] = chain.edges.map((e, i) => ({
      id: `e-${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      animated: false,
      style: { stroke: "#52525b", strokeWidth: 1.4 },
    }));
    return { rfNodes, rfEdges };
  }, [chain, selectedNodeId, onAddChild]);

  return (
    <div className="flex-1 min-h-0 relative">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.2}
        maxZoom={1.5}
        onNodeClick={(_, n) => onSelectNode(n.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={20} variant={BackgroundVariant.Dots} />
        <Controls className="!bg-zinc-900 !border !border-zinc-800" showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="#09090be0"
          style={{ background: "#0a0a0a", border: "1px solid #27272a" }}
          nodeColor={(n) => {
            const data = n.data as NodeData;
            return TACTIC_COLOR[data.node.tactic];
          }}
        />
      </ReactFlow>
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        {onAddRoot && (
          <button
            type="button"
            onClick={onAddRoot}
            className="rounded border border-zinc-700 bg-zinc-900/95 hover:border-amber-600 hover:text-amber-300 text-zinc-300 px-2 py-1 text-[11px] backdrop-blur shadow-md"
            title="add a root step (no parent)"
          >
            + step
          </button>
        )}
        {onConnectNodes && (
          <button
            type="button"
            onClick={onConnectNodes}
            className="rounded border border-zinc-700 bg-zinc-900/95 hover:border-amber-600 hover:text-amber-300 text-zinc-300 px-2 py-1 text-[11px] backdrop-blur shadow-md"
            title="connect two steps"
          >
            ⤤ connect
          </button>
        )}
      </div>
    </div>
  );
}
