import { getFullSchema } from '@/mcp/utils/postgres-inspector';
import type { McpTool } from './types';

export const getSchemaTool: McpTool = {
  name: 'get_schema_metadata',
  description:
    'Returns full database schema metadata including tables, columns, primary keys, foreign keys, views and routines from information_schema and pg_catalog.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute() {
    try {
      const metadata = await getFullSchema();
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
