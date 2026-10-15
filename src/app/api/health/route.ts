import { NextResponse } from 'next/server';
import { checkDatabase } from '@/mcp/utils/postgres-inspector';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const MCP_SERVER_SECRET_TOKEN = process.env.MCP_SERVER_SECRET_TOKEN ?? '';

interface HealthComponent {
  ok: boolean;
  configured?: boolean;
  error?: string;
}

async function checkMcp(): Promise<HealthComponent> {
  if (!MCP_SERVER_URL) {
    return { ok: false, configured: false, error: 'MCP_SERVER_URL is not set' };
  }

  try {
    const response = await fetch(`${MCP_SERVER_URL.replace(/\/$/, '')}/health`, {
      headers: MCP_SERVER_SECRET_TOKEN
        ? { Authorization: `Bearer ${MCP_SERVER_SECRET_TOKEN}` }
        : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return { ok: true, configured: true };
    }
    return { ok: false, configured: true, error: `status ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const [db, mcp] = await Promise.all([checkDatabase(), checkMcp()]);

  if (!db.ok) {
    log('warn', 'health: database check failed', { error: db.error });
  }

  return NextResponse.json(
    {
      db,
      mcp,
      ts: new Date().toISOString(),
    },
    { status: 200 }
  );
}
