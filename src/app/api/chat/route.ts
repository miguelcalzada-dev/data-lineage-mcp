import { NextRequest, NextResponse } from 'next/server';
import { getSchemaTool } from '@/mcp/tools/get-schema';
import { traceLineageTool } from '@/mcp/tools/trace-lineage';
import { predictImpactTool } from '@/mcp/tools/predict-impact';
import { generateGraphTool } from '@/mcp/tools/generate-graph';
import type { McpTool } from '@/mcp/tools/types';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact } from '@/mcp/utils/postgres-inspector';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `Eres un asistente experto en bases de datos PostgreSQL. Ayudas al usuario a entender el impacto de los cambios que quiere hacer en la base de datos.

Tienes a tu disposición estas herramientas:
- get_schema_metadata: devuelve las tablas, columnas, claves y vistas de la base de datos.
- trace_column_lineage: devuelve qué objetos (vistas, funciones, claves foráneas) dependen de una tabla/columna.
- predict_breaking_changes: analiza una sentencia DDL y predice qué se rompería (riesgo alto/medio/bajo).
- generate_graph_definition: genera el grafo de dependencias para visualizar el impacto.

Reglas:
1. Responde SIEMPRE en español, de forma clara y breve.
2. Cuando el usuario hable de borrar, renombrar o modificar algo, usa "predict_breaking_changes" y explica el resultado en lenguaje natural.
3. Si conviene mostrar el impacto visualmente, usa "generate_graph_definition".
4. Si el usuario pregunta qué depende de algo, usa "trace_column_lineage".
5. No inventes datos: usa siempre las herramientas para consultar la base de datos real.`;

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
        } else {
          content = JSON.stringify({ error: `Herramienta desconocida: ${name}` });
        }

        toolMessages.push({ role: 'tool', tool_call_id: call.id, content });
      }

      const finalMessages: GroqMessage[] = [
        ...conversation,
        assistant,
        ...toolMessages,
      ];

      assistant = await callGroq(apiKey, finalMessages, false);
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
