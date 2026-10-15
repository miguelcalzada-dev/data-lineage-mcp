import { NextRequest, NextResponse } from 'next/server';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:3001';
const MCP_SERVER_SECRET_TOKEN = process.env.MCP_SERVER_SECRET_TOKEN ?? '';

function buildUpstreamUrl(req: NextRequest): string {
  const base = new URL(MCP_SERVER_URL);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('Invalid MCP_SERVER_URL protocol');
  }

  // nextUrl.pathname incluye el basePath (/impactdb), asi que tomamos todo lo
  // que hay despues de /api/mcp de forma robusta (con o sin basePath).
  const marker = '/api/mcp';
  const full = req.nextUrl.pathname;
  const idx = full.indexOf(marker);
  const rawPath = idx >= 0 ? full.slice(idx + marker.length) : '';
  const safePath = rawPath.replace(/^\/+/, '');
  const basePath = base.pathname.replace(/\/+$/, '');

  // Anclamos siempre al origen del MCP: descartamos cualquier intento de
  // cambiar de host (p.ej. rutas tipo "//evil.com") y asi no filtramos el token.
  const upstream = new URL(base.origin);
  upstream.pathname = `${basePath}/${safePath}`;
  upstream.search = req.nextUrl.search;

  if (upstream.origin !== base.origin) {
    throw new Error('Invalid upstream origin');
  }

  return upstream.toString();
}

async function proxyMcpRequest(req: NextRequest): Promise<NextResponse> {
  const headers = new Headers(req.headers);
  headers.set('Authorization', `Bearer ${MCP_SERVER_SECRET_TOKEN}`);
  headers.delete('host');

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half';
  }

  try {
    const url = buildUpstreamUrl(req);
    const upstream = await fetch(url, init);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'MCP proxy error', message }, { status: 502 });
  }
}

export const GET = proxyMcpRequest;
export const POST = proxyMcpRequest;
