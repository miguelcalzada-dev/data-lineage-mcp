'use client';

import { useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  Handle,
  Position,
} from 'reactflow';
import { Table2, Eye, FileCode, Link2 } from 'lucide-react';
import type { GraphDefinition, GraphNode, GraphEdge } from '@/mcp/tools/generate-graph';

function layoutLayers(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const layer = new Map<string, number>();
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    adj.set(node.id, []);
    indeg.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue;
    adj.get(edge.source)!.push(edge.target);
    indeg.set(edge.target, (indeg.get(edge.target) ?? 0) + 1);
  }

  const remaining = new Map(indeg);
  const queue: string[] = [];
  for (const node of nodes) {
    if ((indeg.get(node.id) ?? 0) === 0) {
      layer.set(node.id, 0);
      queue.push(node.id);
    }
  }
  if (queue.length === 0 && nodes.length > 0) {
    layer.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const depth = layer.get(current) ?? 0;
    for (const next of adj.get(current) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, depth + 1));
      const pending = (remaining.get(next) ?? 1) - 1;
      remaining.set(next, pending);
      if (pending <= 0) queue.push(next);
    }
  }
  for (const node of nodes) {
    if (!layer.has(node.id)) layer.set(node.id, 0);
  }

  const byLayer = new Map<number, string[]>();
  for (const node of nodes) {
    const l = layer.get(node.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(node.id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const horizontalGap = 300;
  const verticalGap = 110;
  for (const [l, group] of byLayer) {
    const count = group.length;
    group.forEach((id, index) => {
      positions.set(id, {
        x: l * horizontalGap,
        y: Math.round((index - (count - 1) / 2) * verticalGap),
      });
    });
  }

  return positions;
}

function layoutBySchema(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const schemas = Array.from(new Set(nodes.map((n) => n.schema))).sort();
  const positions = new Map<string, { x: number; y: number }>();
  const perRow = 4;
  const colGap = 260;
  const rowGap = 130;
  const bandGap = 110;
  let offsetY = 0;

  for (const schema of schemas) {
    const group = nodes.filter((n) => n.schema === schema);
    group.forEach((node, index) => {
      const row = Math.floor(index / perRow);
      const col = index % perRow;
      positions.set(node.id, { x: col * colGap, y: offsetY + row * rowGap });
    });
    offsetY += Math.ceil(group.length / perRow) * rowGap + bandGap;
  }

  return positions;
}

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

const FILTERABLE_TYPES: Array<GraphNode['type']> = ['table', 'view', 'routine', 'foreign_key'];

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = (): void => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function ImpactGraph({ graph, loading = false, mode = 'impact' }: ImpactGraphProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphCanvas graph={graph} loading={loading} mode={mode} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({ graph, loading = false, mode = 'impact' }: ImpactGraphProps): JSX.Element {
  const { fitView } = useReactFlow();
  const isDark = useIsDark();
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenSchemas, setHiddenSchemas] = useState<Set<string>>(new Set());
  const [groupBySchema, setGroupBySchema] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const allNodes = graph?.nodes ?? [];
  const schemaList = useMemo(
    () => Array.from(new Set(allNodes.map((n) => n.schema))).sort(),
    [allNodes]
  );

  const base = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[], visibleIds: new Set<string>() };

    const gNodes = (graph.nodes ?? []).filter(
      (node) => !hiddenTypes.has(node.type) && !hiddenSchemas.has(node.schema)
    );
    const visibleIds = new Set(gNodes.map((n) => n.id));
    const gEdges = (graph.edges ?? []).filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
    );

    const nodeTypeFor = (node: GraphNode): string =>
      node.type === 'view' ? 'view' : node.type;

    if (mode === 'schema') {
      const cols = Math.max(1, Math.ceil(Math.sqrt(gNodes.length)));
      const colGap = 280;
      const rowGap = 150;

      const gridNodes: Node[] = gNodes.map((node, index) => ({
        id: node.id,
        type: 'custom',
        position: {
          x: (index % cols) * colGap,
          y: Math.floor(index / cols) * rowGap,
        },
        data: {
          label: node.label,
          type: nodeTypeFor(node),
          affected: false,
          schema: node.schema,
          isOrigin: false,
          dimmed: false,
        },
      }));

      const gridEdges: Edge[] = gEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        style: { stroke: isDark ? '#57534e' : '#e0ddd8', strokeWidth: 1 },
      }));

      return { nodes: gridNodes, edges: gridEdges, visibleIds };
    }

    const targetIds = new Set(gEdges.map((e) => e.target));
    const originId = gNodes.find((n) => !targetIds.has(n.id))?.id ?? gNodes[0]?.id;
    const positions = groupBySchema ? layoutBySchema(gNodes) : layoutLayers(gNodes, gEdges);

    const flowNodes: Node[] = gNodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        label: node.label,
        type: nodeTypeFor(node),
        affected: node.affected,
        schema: node.schema,
        isOrigin: node.id === originId,
        dimmed: false,
      },
    }));

    const flowEdges: Edge[] = gEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edgeLabel[edge.label ?? ''] ?? edge.label,
      type: 'smoothstep',
      animated: true,
      style: { stroke: isDark ? '#78716c' : '#a8a29e', strokeWidth: 1.5 },
      labelStyle: { fill: isDark ? '#a8a29e' : '#78716c', fontSize: 10 },
      labelBgStyle: { fill: isDark ? '#1c1917' : '#ffffff', fillOpacity: 0.9 },
      labelBgPadding: [6, 2] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { nodes: flowNodes, edges: flowEdges, visibleIds };
  }, [graph, mode, isDark, hiddenTypes, hiddenSchemas, groupBySchema]);

  const connectivity = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of graph?.edges ?? []) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [graph]);

  const { nodes, edges } = useMemo(() => {
    if (!hoveredId) return base;
    const connected = connectivity.get(hoveredId) ?? new Set<string>();
    const nodesWithDim = base.nodes.map((node) => {
      const dimmed = node.id !== hoveredId && !connected.has(node.id);
      return { ...node, data: { ...node.data, dimmed } };
    });
    return { ...base, nodes: nodesWithDim };
  }, [base, hoveredId, connectivity]);

  useEffect(() => {
    if (base.nodes.length === 0) return;
    const timeout = setTimeout(() => {
      fitView({ padding: 0.4, maxZoom: 0.9, duration: 500 });
    }, 80);
    return () => clearTimeout(timeout);
  }, [base.nodes, fitView]);

  function toggleType(type: string): void {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleSchema(schemaName: string): void {
    setHiddenSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schemaName)) next.delete(schemaName);
      else next.add(schemaName);
      return next;
    });
  }

  if (loading && !graph) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500 dark:text-night-400">
        Analizando dependencias…
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="text-sm text-stone-400 dark:text-night-500">
          El mapa de impacto aparecerá aquí tras realizar un análisis.
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
        fitViewOptions={{ padding: 0.4, maxZoom: 0.9 }}
        nodesDraggable
        nodesConnectable={false}
        minZoom={0.15}
        maxZoom={1.5}
        onNodeMouseEnter={(_event, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color={isDark ? '#44403c' : '#e7e5e4'} />
        <Controls />
        <Panel
          position="top-left"
          className="max-w-[220px] rounded-lg border border-stone-200 bg-white/95 p-3 text-[11px] text-stone-600 shadow-sm dark:border-night-700 dark:bg-night-800/95 dark:text-night-300"
        >
          <p className="mb-1.5 font-semibold text-stone-700 dark:text-night-200">Filtros</p>
          <div className="space-y-1.5">
            {FILTERABLE_TYPES.map((type) => {
              const off = hiddenTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  aria-pressed={!off}
                  className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 transition ${
                    off ? 'text-stone-300 line-through dark:text-night-600' : 'hover:bg-stone-100 dark:hover:bg-night-700'
                  }`}
                >
                  <span>{typeLabel[type]}</span>
                  <span className="text-[10px] opacity-70">{off ? 'off' : 'on'}</span>
                </button>
              );
            })}
          </div>

          {schemaList.length > 1 && (
            <>
              <p className="mb-1.5 mt-2 font-semibold text-stone-700 dark:text-night-200">Esquemas</p>
              <div className="flex flex-wrap gap-1">
                {schemaList.map((schemaName) => {
                  const off = hiddenSchemas.has(schemaName);
                  return (
                    <button
                      key={schemaName}
                      type="button"
                      onClick={() => toggleSchema(schemaName)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                        off
                          ? 'border-stone-200 text-stone-300 dark:border-night-700 dark:text-night-600'
                          : 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300'
                      }`}
                    >
                      {schemaName}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setGroupBySchema((v) => !v)}
                className="mt-2 w-full rounded px-1.5 py-1 text-left text-[11px] text-stone-500 transition hover:bg-stone-100 dark:text-night-400 dark:hover:bg-night-700"
              >
                {groupBySchema ? '✓ ' : ''}Agrupar por esquema
              </button>
            </>
          )}
        </Panel>

        {mode === 'impact' && (
          <Panel
            position="top-right"
            className="rounded-lg border border-stone-200 bg-white/95 p-3 text-[11px] text-stone-600 shadow-sm dark:border-night-700 dark:bg-night-800/95 dark:text-night-300"
          >
            <p className="mb-1.5 font-semibold text-stone-700 dark:text-night-200">Leyenda</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-stone-400 bg-stone-100 dark:border-night-500 dark:bg-night-700" />
                <span>Lo que vas a cambiar</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-orange-300 bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/20" />
                <span>Se rompe (afectado)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-stone-200 bg-white dark:border-night-500 dark:bg-night-700" />
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
    dimmed?: boolean;
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
    ? 'border-orange-300 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/10'
    : data.isOrigin
    ? 'border-stone-400 bg-stone-100 dark:border-night-600 dark:bg-night-700'
    : 'border-stone-200 bg-white dark:border-night-700 dark:bg-night-800';
  const textColor = data.affected
    ? 'text-orange-900 dark:text-orange-200'
    : data.isOrigin
    ? 'text-stone-900 dark:text-night-100'
    : 'text-stone-700 dark:text-night-200';

  return (
    <div
      className={`box-border w-[190px] rounded-lg border px-3 py-2.5 transition-opacity ${
        data.dimmed ? 'opacity-25' : 'opacity-100'
      } ${borderColor}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${borderColor} ${textColor}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-xs font-semibold leading-tight ${textColor}`}>{data.label}</p>
          <p className="truncate text-[10px] uppercase tracking-wide text-stone-400 dark:text-night-500">
            {typeLabel[data.type] ?? data.type}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
    </div>
  );
}
