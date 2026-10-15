import express, { type Request, type Response, type NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getSchemaTool } from '@/mcp/tools/get-schema';
import { traceLineageTool } from '@/mcp/tools/trace-lineage';
import { predictImpactTool } from '@/mcp/tools/predict-impact';
import { generateGraphTool } from '@/mcp/tools/generate-graph';
import type { McpTool } from '@/mcp/tools/types';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const secretToken = process.env.MCP_SERVER_SECRET_TOKEN;

if (!secretToken) {
  throw new Error('Missing MCP_SERVER_SECRET_TOKEN environment variable');
}

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

const server = new Server(
  {
    name: 'impactdb-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolMap.get(request.params.name);
  if (!tool) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
  const args = (request.params.arguments as Record<string, unknown>) ?? {};
  return tool.execute(args);
});

const transports = new Map<string, SSEServerTransport>();

app.get('/sse', authenticate, async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport('/message', res);
  transports.set(transport.sessionId, transport);

  res.on('close', () => {
    transports.delete(transport.sessionId);
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

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(400).json({ error: 'Invalid or expired sessionId' });
      return;
    }

    await transport.handlePostMessage(req, res);
  }
);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`MCP server listening on port ${port}`);
});
