import { NextRequest, NextResponse } from 'next/server';
import { predictBreakingChanges, traceColumnLineage, getFullSchema } from '@/mcp/utils/postgres-inspector';
import { generateGraphTool, type GraphDefinition } from '@/mcp/tools/generate-graph';
import { isValidSchema } from '@/mcp/utils/schema-analyzer';
import type { LineageNode, DdlImpact, SchemaMetadata } from '@/mcp/utils/postgres-inspector';

export interface AnalyzeRequest {
  ddlStatement?: string;
  tableName?: string;
  columnName?: string;
  includeSchema?: boolean;
  schema?: SchemaMetadata;
}

export interface AnalyzeStep {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
}

export interface AnalyzeResponse {
  impact?: DdlImpact;
  lineage?: LineageNode[];
  graph?: GraphDefinition;
  schema?: SchemaMetadata;
  steps: AnalyzeStep[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const steps: AnalyzeStep[] = [];

  try {
    const body = (await req.json()) as AnalyzeRequest;
    const { ddlStatement, tableName, columnName, includeSchema, schema } = body;
    const override = schema && isValidSchema(schema) ? schema : undefined;

    let impact: DdlImpact | undefined;
    let lineage: LineageNode[] | undefined;
    let graph: GraphDefinition | undefined;
    let schemaMetadata: SchemaMetadata | undefined;

    if (ddlStatement) {
      impact = await predictBreakingChanges(ddlStatement, override);
      steps.push({ tool: 'predict_breaking_changes', input: { ddlStatement }, output: impact });
    }

    if (tableName && columnName) {
      lineage = await traceColumnLineage(tableName, columnName, 'public', override);
      steps.push({ tool: 'trace_column_lineage', input: { tableName, columnName }, output: lineage });
    }

    if (!lineage && impact?.target && !impact.notFound) {
      lineage = buildImpactLineage(impact);
    }

    if (lineage) {
      const affectedObjectNames = (impact?.affectedObjects ?? []).map((obj) => obj.name);
      const result = await generateGraphTool.execute({ lineage, affectedObjectNames });
      graph = JSON.parse(result.content[0].text) as GraphDefinition;
      steps.push({
        tool: 'generate_graph_definition',
        input: { lineage, affectedObjectNames },
        output: graph,
      });
    }

    if (includeSchema) {
      schemaMetadata = override ?? (await getFullSchema());
      steps.push({ tool: 'get_schema_metadata', input: {}, output: schemaMetadata });
    }

    const response: AnalyzeResponse = {
      impact,
      lineage,
      graph,
      schema: schemaMetadata,
      steps,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, steps }, { status: 500 });
  }
}

function buildImpactLineage(impact: DdlImpact): LineageNode[] {
  if (!impact.target) return [];

  const origin: LineageNode = {
    schema: impact.target.schema,
    table: impact.target.table,
    column: impact.target.column,
    kind: 'table',
    relation: 'origin',
  };

  const dependents: LineageNode[] = impact.affectedObjects.map((obj) => ({
    schema: obj.schema,
    table: obj.name,
    column: '*',
    kind: mapAffectedType(obj.type),
    relation: `affected_${obj.type}`,
  }));

  return [origin, ...dependents];
}

function mapAffectedType(type: string): LineageNode['kind'] {
  switch (type) {
    case 'view':
      return 'view';
    case 'routine':
      return 'routine';
    case 'foreign_key':
      return 'foreign_key';
    default:
      return 'table';
  }
}
