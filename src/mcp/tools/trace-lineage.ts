import { traceColumnLineage } from '@/mcp/utils/postgres-inspector';
import type { McpTool } from './types';

export const traceLineageTool: McpTool = {
  name: 'trace_column_lineage',
  description:
    'Traces direct and indirect dependencies for a given table column, including child foreign keys, dependent views and routines.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: 'Name of the source table',
      },
      columnName: {
        type: 'string',
        description: 'Name of the source column',
      },
      schema: {
        type: 'string',
        description: 'Schema name (defaults to public)',
      },
    },
    required: ['tableName', 'columnName'],
  },
  async execute(args) {
    try {
      const tableName = String(args.tableName);
      const columnName = String(args.columnName);
      const schema = args.schema ? String(args.schema) : 'public';

      const lineage = await traceColumnLineage(tableName, columnName, schema);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(lineage),
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
