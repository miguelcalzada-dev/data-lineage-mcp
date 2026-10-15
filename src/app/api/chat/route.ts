import { NextRequest, NextResponse } from 'next/server';
import { getSchemaTool } from '@/mcp/tools/get-schema';
import { traceLineageTool } from '@/mcp/tools/trace-lineage';
import { predictImpactTool } from '@/mcp/tools/predict-impact';
import { generateGraphTool } from '@/mcp/tools/generate-graph';
import type { McpTool } from '@/mcp/tools/types';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact, LineageNode, SchemaMetadata } from '@/mcp/utils/postgres-inspector';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
const MAX_TOOL_CHARS = 4000;

const SYSTEM_PROMPT = `Eres un asistente experto en bases de datos PostgreSQL. Ayudas al usuario a entender el impacto de los cambios que quiere hacer.

Herramientas disponibles:
- get_schema_metadata: lista de tablas y vistas.
- trace_column_lineage: qué objetos dependen de una tabla/columna.
- predict_breaking_changes: analiza un DDL y predice qué se rompe (riesgo alto/medio/bajo).
- generate_graph_definition: genera el grafo de dependencias.

Reglas de estilo (MUY IMPORTANTE):
1. Responde SIEMPRE en español.
2. Sé CONCISO: máximo 3-5 líneas o una lista corta con viñetas. Nada de párrafos largos ni tablas extensas.
3. Usa viñetas breves, no explicaciones redundantes.
4. No repitas la pregunta ni des discursos genéricos. Ve directo al resultado.`;

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
}

interface GroqMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

async function callGroq(
  apiKey: string,
  messages: GroqMessage[],
  withTools: boolean
): Promise<GroqMessage> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: 0.2,
  };
  if (withTools) {
    body.tools = toOpenAiTools(tools);
    body.tool_choice = 'auto';
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: GroqMessage }>;
  };

  return data.choices[0].message;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY no está configurada en el servidor.' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ChatRequestBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'No hay mensajes en la conversación.' }, { status: 400 });
    }

    const conversation: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let graph: GraphDefinition | undefined;
    let impact: DdlImpact | undefined;
    let lineage: LineageNode[] | undefined;

    let assistant = await callGroq(apiKey, conversation, true);

    if (assistant.tool_calls && assistant.tool_calls.length > 0) {
      const toolMessages: GroqMessage[] = [];

      for (const call of assistant.tool_calls) {
        const name = call.function.name;
        const executor = toolExecutors.get(name);
        let content: string;

        if (executor) {
          const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
          const result = await executor.execute(args);
          content = result.content
            .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
            .join('\n');

          if (name === 'generate_graph_definition') {
            try {
              graph = JSON.parse(content) as GraphDefinition;
            } catch {
              graph = undefined;
            }
          }
          if (name === 'predict_breaking_changes') {
            try {
              impact = JSON.parse(content) as DdlImpact;
            } catch {
              impact = undefined;
            }
          }
          if (name === 'trace_column_lineage') {
            try {
              lineage = JSON.parse(content) as LineageNode[];
            } catch {
              lineage = undefined;
            }
          }
          if (name === 'get_schema_metadata') {
            content = summarizeSchema(content);
          }
        } else {
          content = JSON.stringify({ error: `Herramienta desconocida: ${name}` });
        }

        if (content.length > MAX_TOOL_CHARS) {
          content = `${content.slice(0, MAX_TOOL_CHARS)}\n… (resultado recortado)`;
        }

        toolMessages.push({ role: 'tool', tool_call_id: call.id, content });
      }

      assistant = await callGroq(apiKey, [...conversation, assistant, ...toolMessages], false);
    }

    if (!graph && (impact?.target || (lineage && lineage.length > 0))) {
      const effective = lineage && lineage.length > 0 ? lineage : buildImpactLineage(impact as DdlImpact);
      const affectedNames = (impact?.affectedObjects ?? []).map((o) => o.name);
      const gr = await generateGraphTool.execute({
        lineage: effective,
        affectedObjectNames: affectedNames,
      });
      try {
        graph = JSON.parse(gr.content[0].text) as GraphDefinition;
      } catch {
        graph = undefined;
      }
    }

    return NextResponse.json({
      reply: assistant.content ?? '',
      graph,
      impact,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
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
