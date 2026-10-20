import { getFullSchema } from '@/mcp/utils/postgres-inspector';
import { predictImpact } from '@/mcp/utils/schema-analyzer';
import { simulateDdl } from '@/mcp/utils/ddl-simulator';
import type { McpTool } from './types';

export const predictImpactTool: McpTool = {
  name: 'predict_breaking_changes',
  description:
    'Analyzes a DDL statement (ALTER/DROP/RENAME/TRUNCATE) and predicts structural breaking changes, categorizing risk as HIGH, MEDIUM or LOW.',
  inputSchema: {
    type: 'object',
    properties: {
      ddlStatement: {
        type: 'string',
        description: 'DDL statement to analyze',
      },
      schema: {
        type: 'string',
        description: 'Optional schema name to analyze against',
      },
    },
    required: ['ddlStatement'],
  },
  async execute(args, context) {
    try {
      const ddlStatement = String(args.ddlStatement);
      const targetSchema =
        context?.targetSchema ?? (args.schema ? String(args.schema) : undefined);
      const schema = context?.schema ?? (await getFullSchema(targetSchema));
      const impact = predictImpact(schema, ddlStatement);
      // Solo simulamos contra la base real si estamos en modo base real
      // (sin esquema en memoria) o si hay un esquema remoto explícito (preset).
      // Con un JSON propio (schema en memoria y sin preferredSchema) NO se
      // simula, para no tocar por error otra base de datos.
      const canSimulate = !context?.schema || Boolean(context?.preferredSchema);
      if (!impact.notFound && canSimulate) {
        impact.simulation = await simulateDdl(ddlStatement, context?.preferredSchema);
      }
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
