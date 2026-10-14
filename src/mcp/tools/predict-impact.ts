import { predictBreakingChanges } from '@/mcp/utils/postgres-inspector';
import type { McpTool } from './types';

export const predictImpactTool: McpTool = {
  name: 'predict_breaking_changes',
  description:
    'Analyzes a DDL statement (e.g. ALTER TABLE ... DROP COLUMN) and predicts structural breaking changes, categorizing risk as HIGH, MEDIUM or LOW.',
  inputSchema: {
    type: 'object',
    properties: {
      ddlStatement: {
        type: 'string',
        description: 'DDL statement to analyze',
      },
    },
    required: ['ddlStatement'],
  },
  async execute(args) {
    try {
      const ddlStatement = String(args.ddlStatement);
      const impact = await predictBreakingChanges(ddlStatement);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(impact),
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
