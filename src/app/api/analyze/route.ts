import { NextRequest, NextResponse } from 'next/server';
import { predictImpactTool } from '@/mcp/tools/predict-impact';
import { traceLineageTool } from '@/mcp/tools/trace-lineage';
import { generateGraphTool, type GraphDefinition } from '@/mcp/tools/generate-graph';
import { getSchemaTool } from '@/mcp/tools/get-schema';
import type { LineageNode, DdlImpact } from '@/mcp/utils/postgres-inspector';

export interface AnalyzeRequest {
  ddlStatement?: string;
  tableName?: string;
  columnName?: string;
  includeSchema?: boolean;
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
  schema?: unknown;
  steps: AnalyzeStep[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const steps: AnalyzeStep[] = [];

  try {
    const body = (await req.json()) as AnalyzeRequest;
    const { ddlStatement, tableName, columnName, includeSchema } = body;

    let impact: DdlImpact | undefined;
    let lineage: LineageNode[] | undefined;
    let graph: GraphDefinition | undefined;
    let schema: unknown | undefined;

    if (ddlStatement) {
      const result = await predictImpactTool.execute({ ddlStatement });
      impact = JSON.parse(result.content[0].text) as DdlImpact;
      steps.push({ tool: 'predict_breaking_changes', input: { ddlStatement }, output: impact });
    }

    if (tableName && columnName) {
      const result = await traceLineageTool.execute({ tableName, columnName });
      lineage = JSON.parse(result.content[0].text) as LineageNode[];
      steps.push({ tool: 'trace_column_lineage', input: { tableName, columnName }, output: lineage });
    }

    if (!lineage && impact?.target) {
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
      const result = await getSchemaTool.execute({});
      schema = JSON.parse(result.content[0].text);
      steps.push({ tool: 'get_schema_metadata', input: {}, output: schema });
    }

    const response: AnalyzeResponse = {
      impact,
      lineage,
      graph,
      schema,
      steps,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, steps }, { status: 500 });
  }
}

function buildImpactLineage(impact: DdlImpact): LineageNode[] {
  if (!impact.target) {
    return [];
  }

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
