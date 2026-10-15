import { NextRequest, NextResponse } from 'next/server';
import { getSchemaTool } from '@/mcp/tools/get-schema';
import { traceLineageTool } from '@/mcp/tools/trace-lineage';
import { predictImpactTool } from '@/mcp/tools/predict-impact';
import { generateGraphTool } from '@/mcp/tools/generate-graph';
import type { McpTool } from '@/mcp/tools/types';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact, LineageNode, SchemaMetadata } from '@/mcp/utils/postgres-inspector';
import { traceLineage, predictImpact, isValidSchema } from '@/mcp/utils/schema-analyzer';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TOOL_CHARS = 4000;
const MAX_ITERATIONS = 4;

const MODELS: string[] = Array.from(
  new Set([
    process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
  ])
);

const SYSTEM_PROMPT = `Eres un asistente experto en bases de datos PostgreSQL. Ayudas al usuario a entender el impacto de los cambios que quiere hacer.

Herramientas disponibles:
- get_schema_metadata: lista de tablas y vistas.
- trace_column_lineage: qué objetos dependen de una tabla/columna.
- predict_breaking_changes: analiza un DDL y predice qué se rompe (riesgo alto/medio/bajo).
- generate_graph_definition: genera el grafo de dependencias.

Reglas de estilo (MUY IMPORTANTE):
1. Responde SIEMPRE en español.
2. Sé CONCISO: máximo 3-5 líneas o una lista corta con viñetas. Nada de párrafos largos ni tablas extensas.
3. No repitas la pregunta ni des discursos genéricos. Ve directo al resultado.
4. Cuando el usuario mencione borrar o modificar algo, usa predict_breaking_changes y resume el resultado.`;

const tools: McpTool[] = [getSchemaTool, traceLineageTool, predictImpactTool, generateGraphTool];

const toolExecutors = new Map<string, McpTool>(tools.map((t) => [t.name, t]));

function toOpenAiTools(list: McpTool[]): Array<Record<string, unknown>> {
  return list.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

interface ChatRequestBody {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  schema?: SchemaMetadata;
}

interface GroqToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface GroqMessage {
  role: string;
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

async function callGroq(model: string, apiKey: string, messages: GroqMessage[]): Promise<GroqMessage> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      tools: toOpenAiTools(tools),
      tool_choice: 'auto',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: GroqMessage }> };
  return data.choices[0].message;
}

async function callGroqWithFallback(apiKey: string, messages: GroqMessage[]): Promise<GroqMessage> {
  let lastError: unknown = null;

  for (const model of MODELS) {
    try {
      return await callGroq(model, apiKey, messages);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo contactar con el modelo');
}

interface ToolExecution {
  content: string;
  graph?: GraphDefinition;
  impact?: DdlImpact;
  lineage?: LineageNode[];
}

async function executeToolCall(call: GroqToolCall, override?: SchemaMetadata): Promise<ToolExecution> {
  const name = call.function.name;
  const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
  const execution: ToolExecution = { content: '' };

  if (override) {
    if (name === 'get_schema_metadata') {
      execution.content = JSON.stringify({
        tables: override.tables.map((t) => t.name),
        views: override.views.map((v) => v.name),
      });
    } else if (name === 'trace_column_lineage') {
      const lineage = traceLineage(override, String(args.tableName), String(args.columnName));
      execution.lineage = lineage;
      execution.content = JSON.stringify(lineage);
    } else if (name === 'predict_breaking_changes') {
      const impact = predictImpact(override, String(args.ddlStatement));
      execution.impact = impact;
      execution.content = JSON.stringify(impact);
    } else if (name === 'generate_graph_definition') {
      const result = await generateGraphTool.execute(args);
      execution.content = result.content[0].text;
      try {
        execution.graph = JSON.parse(execution.content) as GraphDefinition;
      } catch {
        execution.graph = undefined;
      }
    } else {
      execution.content = JSON.stringify({ error: `Herramienta desconocida: ${name}` });
    }
  } else {
    const executor = toolExecutors.get(name);
    if (!executor) {
      return { content: JSON.stringify({ error: `Herramienta desconocida: ${name}` }) };
    }

    const result = await executor.execute(args);
    let content = result.content.map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');

    if (name === 'generate_graph_definition') {
      try {
        execution.graph = JSON.parse(content) as GraphDefinition;
      } catch {
        execution.graph = undefined;
      }
    }
    if (name === 'predict_breaking_changes') {
      try {
        execution.impact = JSON.parse(content) as DdlImpact;
      } catch {
        execution.impact = undefined;
      }
    }
    if (name === 'trace_column_lineage') {
      try {
        execution.lineage = JSON.parse(content) as LineageNode[];
      } catch {
        execution.lineage = undefined;
      }
    }
    if (name === 'get_schema_metadata') {
      content = summarizeSchema(content);
    }

    execution.content = content;
  }

  if (execution.content.length > MAX_TOOL_CHARS) {
    execution.content = `${execution.content.slice(0, MAX_TOOL_CHARS)}\n… (resultado recortado)`;
  }

  return execution;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: 'El asistente no está configurado (falta la clave de Groq).' });
    }

    const body = (await req.json()) as ChatRequestBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ reply: 'No he recibido ninguna pregunta.' });
    }

    const override = body.schema && isValidSchema(body.schema) ? body.schema : undefined;

    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let graph: GraphDefinition | undefined;
    let impact: DdlImpact | undefined;
    let lineage: LineageNode[] | undefined;
    let assistant: GroqMessage | null = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      assistant = await callGroqWithFallback(apiKey, messages);

      if (!assistant.tool_calls || assistant.tool_calls.length === 0) {
        break;
      }

      messages.push(assistant);

      for (const call of assistant.tool_calls) {
        const execution = await executeToolCall(call, override);
        if (execution.graph) graph = execution.graph;
        if (execution.impact) impact = execution.impact;
        if (execution.lineage) lineage = execution.lineage;
        messages.push({ role: 'tool', tool_call_id: call.id, content: execution.content });
      }
    }

    if (!graph && (impact?.target || (lineage && lineage.length > 0))) {
      const effective = lineage && lineage.length > 0 ? lineage : buildImpactLineage(impact as DdlImpact);
      const affectedNames = (impact?.affectedObjects ?? []).map((o) => o.name);
      try {
        const gr = await generateGraphTool.execute({ lineage: effective, affectedObjectNames: affectedNames });
        graph = JSON.parse(gr.content[0].text) as GraphDefinition;
      } catch {
        graph = undefined;
      }
    }

    let reply = (assistant?.content ?? '').trim();
    if (!reply) {
      reply =
        impact && impact.affectedObjects.length > 0
          ? `Este cambio afecta a ${impact.affectedObjects.length} objeto(s). Míralos en el grafo.`
          : 'Listo. Consulta el mapa de la derecha para ver el resultado.';
    }

    return NextResponse.json({ reply, graph, impact });
  } catch {
    return NextResponse.json({
      reply: 'No pude completar la consulta en este momento. Inténtalo de nuevo por favor.',
    });
  }
}

function summarizeSchema(content: string): string {
  try {
    const parsed = JSON.parse(content) as SchemaMetadata;
    return JSON.stringify({
      tables: (parsed.tables ?? []).map((t) => t.name),
      views: (parsed.views ?? []).map((v) => v.name),
    });
  } catch {
    return content;
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
