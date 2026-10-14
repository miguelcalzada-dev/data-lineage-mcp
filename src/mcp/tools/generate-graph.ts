import { traceColumnLineage, type LineageNode } from '@/mcp/utils/postgres-inspector';
import type { McpTool } from './types';

export interface GraphNode {
  id: string;
  type: 'table' | 'view' | 'routine' | 'foreign_key';
  label: string;
  schema: string;
  table: string;
  column: string;
  affected?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface GraphDefinition {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const generateGraphTool: McpTool = {
  name: 'generate_graph_definition',
  description:
    'Transforms a column lineage tree into structured nodes and edges for graph rendering. Accepts either a lineage array or tableName+columnName to trace.',
  inputSchema: {
    type: 'object',
    properties: {
      lineage: {
        type: 'array',
        description: 'Optional pre-computed lineage array',
        items: { type: 'object' },
      },
      tableName: {
        type: 'string',
        description: 'Source table name (used if lineage is not provided)',
      },
      columnName: {
        type: 'string',
        description: 'Source column name (used if lineage is not provided)',
      },
      affectedObjectNames: {
        type: 'array',
        description: 'Names of objects considered affected (for highlighting)',
        items: { type: 'string' },
      },
    },
  },
  async execute(args) {
    try {
      let lineage: LineageNode[];

      if (Array.isArray(args.lineage)) {
        lineage = args.lineage as LineageNode[];
      } else if (typeof args.tableName === 'string' && typeof args.columnName === 'string') {
        const schema = typeof args.schema === 'string' ? args.schema : 'public';
        lineage = await traceColumnLineage(args.tableName, args.columnName, schema);
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Either lineage array or tableName+columnName must be provided.',
              }),
            },
          ],
          isError: true,
        };
      }

      const affectedSet = new Set<string>(
        Array.isArray(args.affectedObjectNames)
          ? args.affectedObjectNames.map((n) => String(n).toLowerCase())
          : []
      );

      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const nodeIds = new Set<string>();

      const origin = lineage.find((node) => node.relation === 'origin') ?? lineage[0];

      const makeId = (node: LineageNode) =>
        `${node.schema}.${node.table}${node.column && node.column !== '*' ? `.${node.column}` : ''}`;

      for (const node of lineage) {
        const id = makeId(node);
        if (nodeIds.has(id)) continue;
        nodeIds.add(id);

        const name = `${node.table}${node.column && node.column !== '*' ? `.${node.column}` : ''}`;
        const isAffected = affectedSet.has(node.table.toLowerCase()) || affectedSet.has(name.toLowerCase());

        nodes.push({
          id,
          type: node.kind,
          label: name,
          schema: node.schema,
          table: node.table,
          column: node.column,
          affected: isAffected,
        });

        if (origin && node.relation && node.relation !== 'origin') {
          const originId = makeId(origin);
          edges.push({
            id: `${originId}->${id}`,
            source: originId,
            target: id,
            label: node.relation,
          });
        }
      }

      const graph: GraphDefinition = { nodes, edges };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(graph),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
};
