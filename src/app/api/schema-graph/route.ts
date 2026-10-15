import { NextResponse } from 'next/server';
import { getFullSchema } from '@/mcp/utils/postgres-inspector';
import type { GraphDefinition, GraphNode, GraphEdge } from '@/mcp/tools/generate-graph';

export async function GET(): Promise<NextResponse> {
  try {
    const schema = await getFullSchema();

    const nodes: GraphNode[] = schema.tables.map((table) => ({
      id: `${table.schema}.${table.name}`,
      type: table.type === 'BASE TABLE' ? 'table' : 'view',
      label: table.name,
      schema: table.schema,
      table: table.name,
      column: '*',
      affected: false,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));

    const edges: GraphEdge[] = schema.foreignKeys
      .map((fk, index) => {
        const source = `${fk.source_schema}.${fk.source_table}`;
        const target = `${fk.target_schema}.${fk.target_table}`;
        return {
          id: `fk-${index}-${fk.constraint_name}`,
          source,
          target,
          label: fk.source_column,
        } satisfies GraphEdge;
      })
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

    const graph: GraphDefinition = { nodes, edges };
    return NextResponse.json(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
