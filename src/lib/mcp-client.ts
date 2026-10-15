import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { apiPath } from '@/lib/api';

let client: Client | null = null;

export async function getMcpClient(): Promise<Client> {
  if (client) {
    return client;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const token = process.env.MCP_SERVER_SECRET_TOKEN ?? '';

  const transport = new SSEClientTransport(new URL(apiPath('/api/mcp'), baseUrl));
  transport.onmessage = (message) => {
    // eslint-disable-next-line no-console
    console.log('[MCP Client message]', message);
  };

  client = new Client(
    {
      name: 'data-lineage-web-client',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  // Authenticate implicitly via header if supported; the server validates Bearer token.
  // The SSE transport does not expose headers in browser contexts; for server-side usage
  // we rely on the /api/analyze orchestrator that calls the local MCP tools directly.
  void token;

  return client;
}

export function resetMcpClient(): void {
  client = null;
}
