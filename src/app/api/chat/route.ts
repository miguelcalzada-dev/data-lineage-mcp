import { NextRequest, NextResponse } from 'next/server';
import { getSchemaTool } from '@/mcp/tools/get-schema';
import { traceLineageTool } from '@/mcp/tools/trace-lineage';
import { predictImpactTool } from '@/mcp/tools/predict-impact';
import { generateGraphTool } from '@/mcp/tools/generate-graph';
import type { McpTool, ToolContext } from '@/mcp/tools/types';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact, LineageNode, SchemaMetadata } from '@/mcp/utils/postgres-inspector';
import { normalizeSchema } from '@/mcp/utils/schema-analyzer';
import { rateLimit, clientKey } from '@/lib/rate-limit';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TOOL_CHARS = 4000;
const MAX_ITERATIONS = 4;
const GROQ_TIMEOUT_MS = 15000;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const MODELS: string[] = Array.from(
  new Set([
    process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
  ])
);

const SYSTEM_PROMPT = `Eres un asistente experto en bases de datos PostgreSQL. Ayudas al usuario a entender el impacto de los cambios que quiere hacer.

Herramientas disponibles:
- get_schema_metadata: lista de tablas y vistas.
- trace_column_lineage: qué objetos dependen de una tabla/columna.
- predict_breaking_changes: analiza un DDL y predice qué se rompe (riesgo alto/medio/bajo).
- generate_graph_definition: genera el grafo de dependencias.

Reglas de estilo (MUY IMPORTANTE):
1. Responde en el mismo idioma en el que te escriba el usuario (por defecto, español).
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
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
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

function parseGraphDefinition(text: string): GraphDefinition | undefined {
  try {
    const parsed = JSON.parse(text) as Partial<GraphDefinition> | null;
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return { nodes: parsed.nodes, edges: parsed.edges };
    }
  } catch {
    // contenido no-JSON o grafo inválido
  }
  return undefined;
}

async function executeToolCall(call: GroqToolCall, context: ToolContext): Promise<ToolExecution> {
  const name = call.function.name;
  const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
  const execution: ToolExecution = { content: '' };

  const executor = toolExecutors.get(name);
  if (!executor) {
    return { content: JSON.stringify({ error: `Herramienta desconocida: ${name}` }) };
  }

  const result = await executor.execute(args, context);
  let content = result.content
    .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
    .join('\n');

  if (name === 'generate_graph_definition') {
    execution.graph = parseGraphDefinition(content);
  }
  if (name === 'predict_breaking_changes') {
    try {
      const parsed = JSON.parse(content) as DdlImpact;
      if (parsed && typeof parsed === 'object') execution.impact = parsed;
    } catch {
      execution.impact = undefined;
    }
  }
  if (name === 'trace_column_lineage') {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (Array.isArray(parsed)) execution.lineage = parsed as LineageNode[];
    } catch {
      execution.lineage = undefined;
    }
  }
  if (name === 'get_schema_metadata') {
    content = summarizeSchema(content);
  }

  execution.content = content;
  if (execution.content.length > MAX_TOOL_CHARS) {
    execution.content = `${execution.content.slice(0, MAX_TOOL_CHARS)}\n… (resultado recortado)`;
  }

  return execution;
}

function describeGroqError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  if (name === 'TimeoutError' || name === 'AbortError' || /abort|timeout|timed out/i.test(message)) {
    return 'El modelo tardó demasiado en responder. Inténtalo de nuevo.';
  }
  if (/\b429\b/.test(message)) {
    return 'El asistente está recibiendo demasiadas peticiones. Espera unos segundos y vuelve a intentarlo.';
  }
  if (/\b401\b|\b403\b/.test(message)) {
    return 'La clave de Groq no es válida o ha caducado. Revisa GROQ_API_KEY.';
  }
  if (/\b404\b|model/i.test(message)) {
    return 'El modelo configurado no está disponible. Revisa GROQ_MODEL.';
  }
  return 'No pude completar la consulta en este momento. Inténtalo de nuevo por favor.';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limit = rateLimit(`chat:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { reply: 'Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: 'El asistente no está configurado (falta la clave de Groq).' });
    }

    const body = (await req.json()) as ChatRequestBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ reply: 'No he recibido ninguna pregunta.' });
    }
    if (body.messages.length > MAX_MESSAGES) {
      return NextResponse.json({ reply: 'La conversación es demasiado larga. Inicia una nueva.' });
    }
    const invalidMessage = body.messages.some(
      (m) => typeof m?.content !== 'string' || m.content.length > MAX_MESSAGE_CHARS
    );
    if (invalidMessage) {
      return NextResponse.json({ reply: 'Algún mensaje es demasiado largo o no es válido.' });
    }

    const override = normalizeSchema(body.schema) ?? undefined;
    const context: ToolContext = { schema: override };

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
        const execution = await executeToolCall(call, context);
        if (execution.graph) graph = execution.graph;
        if (execution.impact) impact = execution.impact;
        if (execution.lineage) lineage = execution.lineage;
        messages.push({ role: 'tool', tool_call_id: call.id, content: execution.content });
      }
    }

    if (!graph && !impact?.notFound && (impact?.target || (lineage && lineage.length > 0))) {
      const effective = lineage && lineage.length > 0 ? lineage : buildImpactLineage(impact as DdlImpact);
      const affectedNames = (impact?.affectedObjects ?? []).map((o) => o.name);
      try {
        const gr = await generateGraphTool.execute({ lineage: effective, affectedObjectNames: affectedNames });
        graph = parseGraphDefinition(gr.content[0].text);
      } catch {
        graph = undefined;
      }
    }

    let reply = (assistant?.content ?? '').trim();
    if (impact?.notFound) {
      reply = impact.summary;
      graph = undefined;
    } else if (!reply) {
      reply =
        impact && impact.affectedObjects.length > 0
          ? `Este cambio afecta a ${impact.affectedObjects.length} objeto(s). Míralos en el grafo.`
          : 'Listo. Consulta el mapa de la derecha para ver el resultado.';
    }

    return NextResponse.json({ reply, graph, impact });
  } catch (error) {
    return NextResponse.json({ reply: describeGroqError(error) });
  }
}

function summarizeSchema(content: string): string {
  try {
    const parsed = JSON.parse(content) as SchemaMetadata;
    return JSON.stringify({
      tables: (parsed.tables ?? []).map((t) => ({
        name: t.name,
        columns: (t.columns ?? []).map((c) => c.column_name),
      })),
      views: (parsed.views ?? []).map((v) => v.name),
      routines: (parsed.routines ?? []).map((r) => ({ name: r.name, type: r.type })),
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
    depth: 0,
  };

  const dependents: LineageNode[] = impact.affectedObjects.map((obj) => ({
    schema: obj.schema,
    table: obj.name,
    column: '*',
    kind: mapAffectedType(obj.type),
    relation: `affected_${obj.type}`,
    depth: 1,
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
