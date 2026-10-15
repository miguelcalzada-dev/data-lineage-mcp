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
  custom: CustomNode,
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

interface LayoutNode {
  id: string;
}

interface LayoutEdge {
  source: string;
  target: string;
}

function computeForceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  width = 1100,
  height = 760
): Record<string, { x: number; y: number }> {
  const n = nodes.length;
  const positions: Record<string, { x: number; y: number }> = {};

  nodes.forEach((node, i) => {
    const angle = (i / Math.max(n, 1)) * 2 * Math.PI;
    positions[node.id] = {
      x: width / 2 + Math.cos(angle) * (width / 3),
      y: height / 2 + Math.sin(angle) * (height / 3),
    };
  });

  if (n <= 1) return positions;

  const k = Math.sqrt((width * height) / n);
  const iterations = 320;
  let temperature = width / 8;
  const cooling = temperature / iterations;

  const disp: Record<string, { x: number; y: number }> = {};

  for (let it = 0; it < iterations; it++) {
    nodes.forEach((node) => {
      disp[node.id] = { x: 0, y: 0 };
    });

    // Repulsión entre todos los nodos
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = positions[nodes[i].id];
        const b = positions[nodes[j].id];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[nodes[i].id].x += fx;
        disp[nodes[i].id].y += fy;
        disp[nodes[j].id].x -= fx;
        disp[nodes[j].id].y -= fy;
      }
    }

    // Atracción a lo largo de las aristas
    for (const edge of edges) {
      const a = positions[edge.source];
      const b = positions[edge.target];
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[edge.source].x -= fx;
      disp[edge.source].y -= fy;
      disp[edge.target].x += fx;
      disp[edge.target].y += fy;
    }

    nodes.forEach((node) => {
      const d = disp[node.id];
      const len = Math.max(Math.sqrt(d.x * d.x + d.y * d.y), 0.01);
      const limited = Math.min(len, temperature);
      const p = positions[node.id];
      p.x = Math.max(120, Math.min(width - 120, p.x + (d.x / len) * limited));
      p.y = Math.max(90, Math.min(height - 90, p.y + (d.y / len) * limited));
    });

    temperature -= cooling;
  }

  return positions;
}

export function ImpactGraph({ graph, loading = false, mode = 'impact' }: ImpactGraphProps): JSX.Element {
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    if (mode === 'schema') {
      const positions = computeForceLayout(graph.nodes, graph.edges);

      const gridNodes: Node[] = graph.nodes.map((node) => ({
        id: node.id,
        type: 'custom',
        position: positions[node.id] ?? { x: 0, y: 0 },
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
        type: 'default',
        style: { stroke: '#d6d3d1', strokeWidth: 1 },
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
        type: 'custom',
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
