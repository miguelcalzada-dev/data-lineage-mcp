'use client';

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
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

const typeLabel: Record<string, string> = {
  table: 'Tabla',
  view: 'Vista',
  routine: 'Rutina',
  foreign_key: 'Clave foránea',
};

const edgeLabel: Record<string, string> = {
  origin: 'origen',
  dependent_view: 'vista dependiente',
  dependent_routine: 'rutina dependiente',
  child_foreign_key: 'clave foránea hija',
  affected_view: 'vista afectada',
  affected_routine: 'rutina afectada',
  affected_foreign_key: 'clave foránea afectada',
  affected_table: 'tabla afectada',
  affected_column: 'columna afectada',
};

export function ImpactGraph({ graph, loading = false }: ImpactGraphProps): JSX.Element {
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    const targetIds = new Set(graph.edges.map((e) => e.target));
    const originId =
      graph.nodes.find((n) => !targetIds.has(n.id))?.id ?? graph.nodes[0]?.id;

    const dependents = graph.nodes.filter((n) => n.id !== originId);
    const radius = 260;

    const flowNodes: Node[] = graph.nodes.map((node) => {
      let position: { x: number; y: number };

      if (node.id === originId) {
        position = { x: 0, y: 0 };
      } else {
        const index = dependents.findIndex((d) => d.id === node.id);
        const count = Math.max(dependents.length, 1);
        const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
        position = {
          x: Math.round(Math.cos(angle) * radius),
          y: Math.round(Math.sin(angle) * radius),
        };
      }

      return {
        id: node.id,
        type: 'default',
        position,
        data: {
          label: node.label,
          type: node.type,
          affected: node.affected,
          schema: node.schema,
        },
      };
    });

    const flowEdges: Edge[] = graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edgeLabel[edge.label ?? ''] ?? edge.label,
      animated: true,
      style: { stroke: '#64748b' },
      labelStyle: { fill: '#64748b', fontSize: 10 },
      labelBgStyle: { fill: '#ffffff' },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph]);

  if (loading && !graph) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Analizando dependencias…
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
        <p className="text-sm font-medium text-slate-500">Sin datos todavía</p>
        <p className="text-sm">
          Ejecuta una simulación o rastrea un linaje para visualizar el impacto aquí.
        </p>
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
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable
        nodesConnectable={false}
        minZoom={0.2}
        maxZoom={2}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#e2e8f0" />
        <Controls />
        <Panel position="top-left" className="rounded-md border border-slate-200 bg-white/90 p-2 text-[11px] text-slate-600 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-300" />
            <span>Afectado</span>
            <span className="mx-1 text-slate-300">|</span>
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />
            <span>Sin afectar</span>
          </div>
        </Panel>
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => (n.data?.affected ? '#ef4444' : '#94a3b8')}
          className="rounded-md border border-slate-200"
        />
      </ReactFlow>
    </div>
  );
}

function CustomNode({
  data,
}: {
  data: { label: string; type: string; affected?: boolean; schema: string };
}): JSX.Element {
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

  const borderColor = data.affected
    ? 'border-red-300 bg-red-50'
    : 'border-slate-200 bg-white';
  const textColor = data.affected ? 'text-red-900' : 'text-slate-700';

  return (
    <div className={`min-w-[160px] rounded-md border p-2.5 shadow-sm ${borderColor}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center gap-2">
        <span className={`${textColor}`}>{icon}</span>
        <div className="min-w-0">
          <p className={`truncate text-xs font-semibold ${textColor}`}>{data.label}</p>
          <p className="truncate text-[10px] uppercase tracking-wide text-slate-400">
            {typeLabel[data.type] ?? data.type} · {data.schema}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}
