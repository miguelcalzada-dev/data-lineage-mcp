import { getFullSchema } from '@/mcp/utils/postgres-inspector';
import { traceLineage, findTableByName, findColumnByName } from '@/mcp/utils/schema-analyzer';
import type { McpTool } from './types';

export const traceLineageTool: McpTool = {
  name: 'trace_column_lineage',
  description:
    'Traces direct and indirect (transitive) dependencies for a given table column, including child foreign keys, dependent views and routines.',
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
  async execute(args, context) {
    try {
      const tableName = String(args.tableName);
      const columnName = String(args.columnName);
      const schemaName = args.schema ? String(args.schema) : context?.targetSchema ?? 'public';
      const schema = context?.schema ?? (await getFullSchema(context?.targetSchema));

      if (!findTableByName(schema, tableName)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                found: false,
                message: `La tabla "${tableName}" no existe en el esquema seleccionado.`,
              }),
            },
          ],
        };
      }

      if (!findColumnByName(schema, tableName, columnName)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                found: false,
                message: `La columna "${columnName}" no existe en la tabla "${tableName}".`,
              }),
            },
          ],
        };
      }

      const lineage = traceLineage(schema, tableName, columnName, schemaName);
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
