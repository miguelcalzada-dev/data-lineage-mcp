'use client';

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Handle,
  Position,
} from 'reactflow';
import { Table2, Eye, FileCode, Link2 } from 'lucide-react';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';

export interface ImpactGraphProps {
  graph: GraphDefinition | null;
  loading?: boolean;
}

const nodeTypes = {
  default: CustomNode,
};

export function ImpactGraph({ graph, loading = false }: ImpactGraphProps): JSX.Element {
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    const flowNodes: Node[] = graph.nodes.map((node) => ({
      id: node.id,
      type: 'default',
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: {
        label: node.label,
        type: node.type,
        affected: node.affected,
        schema: node.schema,
      },
    }));

    const flowEdges: Edge[] = graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: true,
      style: { stroke: '#64748b' },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph]);

  if (loading && !graph) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Analyzing dependencies…
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-400">
        <p className="text-sm">Run a simulation or trace lineage to visualize impact.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#e2e8f0" />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => (n.data?.affected ? '#ef4444' : '#94a3b8')}
          className="rounded-md border border-slate-200"
        />
      </ReactFlow>
    </div>
  );
}

function CustomNode({ data }: { data: { label: string; type: string; affected?: boolean; schema: string } }): JSX.Element {
  const icon =
    data.type === 'view' ? (
      <Eye className="h-3.5 w-3.5" />
    ) : data.type === 'routine' ? (
      <FileCode className="h-3.5 w-3.5" />
    ) : data.type === 'foreign_key' ? (
      <Link2 className="h-3.5 w-3.5" />
    ) : (
      <Table2 className="h-3.5 w-3.5" />
    );

  const borderColor = data.affected ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white';
  const textColor = data.affected ? 'text-red-900' : 'text-slate-700';

  return (
    <div className={`min-w-[140px] rounded-md border p-2.5 shadow-sm ${borderColor}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-2">
        <span className={`${textColor}`}>{icon}</span>
        <div className="min-w-0">
          <p className={`truncate text-xs font-semibold ${textColor}`}>{data.label}</p>
          <p className="truncate text-[10px] uppercase tracking-wide text-slate-400">{data.schema}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}
