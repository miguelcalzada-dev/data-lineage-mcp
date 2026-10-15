'use client';

import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiPath } from '@/lib/api';

type Status = 'checking' | 'connected' | 'error' | 'disabled';

interface HealthResponse {
  db?: { ok: boolean; error?: string };
  mcp?: { ok: boolean; configured?: boolean; error?: string };
}

export function Header({ align = 'left' }: { align?: 'left' | 'right' }): JSX.Element {
  const [dbStatus, setDbStatus] = useState<Status>('checking');
  const [mcpStatus, setMcpStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;

    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch(apiPath('/api/health'), { cache: 'no-store' });
        const data = (await response.json()) as HealthResponse;
        if (cancelled) return;

        setDbStatus(data.db?.ok ? 'connected' : 'error');
        if (!data.mcp) setMcpStatus('disabled');
        else if (!data.mcp.configured) setMcpStatus('disabled');
        else setMcpStatus(data.mcp.ok ? 'connected' : 'error');
      } catch {
        if (!cancelled) {
          setDbStatus('error');
          setMcpStatus('error');
        }
      }
    }

    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dotClass = (status: Status): string =>
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'error'
      ? 'bg-red-400'
      : 'bg-stone-300';

  return (
    <div
      className={`absolute bottom-4 z-30 flex items-center gap-3 text-[11px] font-medium text-stone-500 dark:text-night-400 ${
        align === 'right' ? 'right-6' : 'left-4'
      }`}
    >
      <div className="pointer-events-auto">
        <ThemeToggle />
      </div>
      <span className="flex items-center gap-1.5" title={`Base de datos: ${dbStatus}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass(dbStatus)}`} />
        Supabase
      </span>
      <span className="flex items-center gap-1.5" title={`MCP: ${mcpStatus}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass(mcpStatus)}`} />
        MCP
      </span>
    </div>
  );
}
