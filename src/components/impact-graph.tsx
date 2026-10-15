'use client';

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  type Node,
  type Edge,
  Handle,
  Position,
} from 'reactflow';
import { Table2, Eye, FileCode, Link2 } from 'lucide-react';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';

export type GraphMode = 'impact' | 'schema';

export interface ImpactGraphProps {
  graph: GraphDefinition | null;
  loading?: boolean;
  mode?: GraphMode;
}

const nodeTypes = {
  default: CustomNode,
};

const typeLabel: Record<string, string> = {
  table: 'Tabla',
  view: 'Vista',
  routine: 'Función',
  foreign_key: 'Clave foránea',
};

const edgeLabel: Record<string, string> = {
  origin: 'origen',
  dependent_view: 'vista dependiente',
  dependent_routine: 'función dependiente',
  child_foreign_key: 'clave foránea hija',
  affected_view: 'vista afectada',
  affected_routine: 'función afectada',
  affected_foreign_key: 'clave foránea afectada',
  affected_table: 'tabla afectada',
  affected_column: 'columna afectada',
};

export function ImpactGraph({ graph, loading = false, mode = 'impact' }: ImpactGraphProps): JSX.Element {
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    if (mode === 'schema') {
      const count = graph.nodes.length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(count, 1) * 1.6)));
      const colGap = 260;
      const rowGap = 150;

      const gridNodes: Node[] = graph.nodes.map((node, index) => ({
        id: node.id,
        type: 'default',
        position: {
          x: (index % cols) * colGap,
          y: Math.floor(index / cols) * rowGap,
        },
        data: {
          label: node.label,
          type: node.type,
          affected: false,
          schema: node.schema,
          isOrigin: false,
        },
      }));

      const gridEdges: Edge[] = graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        style: { stroke: '#dcd9d3', strokeWidth: 1.1 },
      }));

      return { nodes: gridNodes, edges: gridEdges };
    }

    const targetIds = new Set(graph.edges.map((e) => e.target));
    const originId =
      graph.nodes.find((n) => !targetIds.has(n.id))?.id ?? graph.nodes[0]?.id;

    const dependents = graph.nodes.filter((n) => n.id !== originId);
    const horizontalGap = 380;
    const verticalSpacing = 96;

    const flowNodes: Node[] = graph.nodes.map((node) => {
      let position: { x: number; y: number };

      if (node.id === originId) {
        position = { x: 0, y: 0 };
      } else {
        const index = dependents.findIndex((d) => d.id === node.id);
        const count = Math.max(dependents.length, 1);
        const y = (index - (count - 1) / 2) * verticalSpacing;
        position = { x: horizontalGap, y: Math.round(y) };
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
          isOrigin: node.id === originId,
        },
      };
    });

    const flowEdges: Edge[] = graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edgeLabel[edge.label ?? ''] ?? edge.label,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#a8a29e', strokeWidth: 1.5 },
      labelStyle: { fill: '#78716c', fontSize: 10 },
      labelBgStyle: { fill: '#F3EEE5', fillOpacity: 0.9 },
      labelBgPadding: [6, 2] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, mode]);

  if (loading && !graph) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Analizando dependencias…
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="text-sm text-stone-400">El mapa de impacto aparecerá aquí tras realizar un análisis.</p>
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
        fitViewOptions={{ padding: 0.45, maxZoom: 0.9 }}
        nodesDraggable
        nodesConnectable={false}
        minZoom={0.15}
        maxZoom={1.5}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#e7e5e4" />
        <Controls />
        {mode === 'impact' && (
          <Panel
            position="top-left"
            className="rounded-lg border border-stone-200 bg-white/95 p-3 text-[11px] text-stone-600 shadow-sm"
          >
            <p className="mb-1.5 font-semibold text-stone-700">Leyenda</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-stone-400 bg-stone-100" />
                <span>Lo que vas a cambiar</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-orange-300 bg-orange-100" />
                <span>Se rompe (afectado)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-stone-200 bg-white" />
                <span>Sin afectar</span>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

function CustomNode({
  data,
}: {
  data: {
    label: string;
    type: string;
    affected?: boolean;
    schema: string;
    isOrigin?: boolean;
  };
}): JSX.Element {
  const icon =
    data.type === 'view' ? (
      <Eye className="h-4 w-4" />
    ) : data.type === 'routine' ? (
      <FileCode className="h-4 w-4" />
    ) : data.type === 'foreign_key' ? (
      <Link2 className="h-4 w-4" />
    ) : (
      <Table2 className="h-4 w-4" />
    );

  const borderColor = data.affected
    ? 'border-orange-300 bg-orange-50'
    : data.isOrigin
    ? 'border-stone-400 bg-stone-100'
    : 'border-stone-200 bg-white';
  const textColor = data.affected
    ? 'text-orange-900'
    : data.isOrigin
    ? 'text-stone-900'
    : 'text-stone-700';

  return (
    <div className={`box-border w-[190px] rounded-lg border px-3 py-2.5 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${borderColor} ${textColor}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-xs font-semibold leading-tight ${textColor}`}>{data.label}</p>
          <p className="truncate text-[10px] uppercase tracking-wide text-stone-400">
            {typeLabel[data.type] ?? data.type}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
    </div>
  );
}
