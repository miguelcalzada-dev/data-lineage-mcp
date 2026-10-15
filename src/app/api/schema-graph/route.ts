import { NextRequest, NextResponse } from 'next/server';
import { getFullSchema } from '@/mcp/utils/postgres-inspector';
import { schemaToGraph, isValidSchema } from '@/mcp/utils/schema-analyzer';
import type { SchemaMetadata } from '@/mcp/utils/postgres-inspector';

async function buildGraph(override?: SchemaMetadata): Promise<NextResponse> {
  try {
    const schema = override ?? (await getFullSchema());
    return NextResponse.json(schemaToGraph(schema));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return buildGraph();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { schema?: SchemaMetadata };
  const override = body.schema && isValidSchema(body.schema) ? body.schema : undefined;
  return buildGraph(override);
}
