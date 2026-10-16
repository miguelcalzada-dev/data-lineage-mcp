import express, { type Request, type Response, type NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getSchemaTool } from '@/mcp/tools/get-schema';
import { traceLineageTool } from '@/mcp/tools/trace-lineage';
import { predictImpactTool } from '@/mcp/tools/predict-impact';
import { generateGraphTool } from '@/mcp/tools/generate-graph';
import { getFullSchema, checkDatabase } from '@/mcp/utils/postgres-inspector';
import { log } from '@/lib/logger';
import type { McpTool, ToolContext } from '@/mcp/tools/types';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const secretToken = process.env.MCP_SERVER_SECRET_TOKEN;

if (!secretToken) {
  throw new Error('Missing MCP_SERVER_SECRET_TOKEN environment variable');
}

const SCHEMA_RESOURCE_URI = 'schema://current';

function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (token !== secretToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

const tools: McpTool[] = [getSchemaTool, traceLineageTool, predictImpactTool, generateGraphTool];
const toolMap = new Map<string, McpTool>(tools.map((tool) => [tool.name, tool]));

const prompts = [
  {
    name: 'impact-analysis',
    description: 'Pide un análisis de impacto para una sentencia ALTER/DROP/RENAME/TRUNCATE.',
    arguments: [{ name: 'ddl', description: 'Sentencia DDL a analizar', required: true }],
  },
  {
    name: 'column-lineage',
    description: 'Pide el linaje (dependencias) de una columna concreta.',
    arguments: [
      { name: 'table', description: 'Tabla de origen', required: true },
      { name: 'column', description: 'Columna de origen', required: true },
    ],
  },
];

function createMcpServer(): Server {
  const server = new Server(
    { name: 'impactdb-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolMap.get(request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    const args = (request.params.arguments as Record<string, unknown>) ?? {};
    const targetSchema = typeof args.schema === 'string' ? args.schema : undefined;
    const context: ToolContext = { targetSchema, preferredSchema: targetSchema };
    log('info', 'mcp tool call', { tool: tool.name, targetSchema });
    return tool.execute(args, context);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: SCHEMA_RESOURCE_URI,
        name: 'Database schema',
        description:
          'Esquema completo de la base de datos (tablas, columnas, claves, vistas, rutinas e índices).',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== SCHEMA_RESOURCE_URI) {
      throw new Error(`Unknown resource: ${request.params.uri}`);
    }
    const schema = await getFullSchema();
    return {
      contents: [
        {
          uri: SCHEMA_RESOURCE_URI,
          mimeType: 'application/json',
          text: JSON.stringify(schema),
        },
      ],
    };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, string>;

    if (request.params.name === 'impact-analysis') {
      return {
        description: 'Análisis de impacto de un DDL',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Usa predict_breaking_changes para analizar el impacto de esta sentencia y resume el riesgo y los objetos afectados:\n\n${args.ddl ?? ''}`,
            },
          },
        ],
      };
    }

    if (request.params.name === 'column-lineage') {
      return {
        description: 'Linaje de una columna',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Usa trace_column_lineage para listar qué objetos dependen de ${args.table ?? ''}.${args.column ?? ''}, tanto directa como indirectamente.`,
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${request.params.name}`);
  });

  return server;
}

app.post(
  '/mcp',
  authenticate,
  express.json({ limit: '1mb' }),
  async (req: Request, res: Response) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
);

app.get('/mcp', authenticate, (_req: Request, res: Response) => {
  res.status(405).json({ error: 'Method Not Allowed' });
});

app.delete('/mcp', authenticate, (_req: Request, res: Response) => {
  res.status(405).json({ error: 'Method Not Allowed' });
});

const sseSessions = new Map<string, { transport: SSEServerTransport; server: Server }>();

app.get('/sse', authenticate, async (_req: Request, res: Response) => {
  const server = createMcpServer();
  const transport = new SSEServerTransport('/message', res);
  sseSessions.set(transport.sessionId, { transport, server });

  res.on('close', () => {
    sseSessions.delete(transport.sessionId);
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
});

app.post(
  '/message',
  authenticate,
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId query parameter' });
      return;
    }

    const session = sseSessions.get(sessionId);
    if (!session) {
      res.status(400).json({ error: 'Invalid or expired sessionId' });
      return;
    }

    await session.transport.handlePostMessage(req, res);
  }
);

app.get('/health', async (_req: Request, res: Response) => {
  const db = await checkDatabase();
  if (!db.ok) {
    log('warn', 'mcp health: database check failed', { error: db.error });
  }
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? 'ok' : 'degraded',
    database: db,
    uptime: process.uptime(),
  });
});

app.listen(port, () => {
  log('info', 'mcp server listening', { port });
});
