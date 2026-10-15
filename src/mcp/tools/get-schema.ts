import { getFullSchema } from '@/mcp/utils/postgres-inspector';
import type { McpTool } from './types';

export const getSchemaTool: McpTool = {
  name: 'get_schema_metadata',
  description:
    'Returns full database schema metadata including tables, columns, primary keys, foreign keys, views, routines and indexes from information_schema and pg_catalog.',
  inputSchema: {
    type: 'object',
    properties: {
      schema: {
        type: 'string',
        description: 'Optional schema name to restrict the metadata to (e.g. public)',
      },
    },
  },
  async execute(args, context) {
    try {
      const targetSchema = context?.targetSchema ?? (args.schema ? String(args.schema) : undefined);
      const metadata = context?.schema ?? (await getFullSchema(targetSchema));
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(metadata),
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
