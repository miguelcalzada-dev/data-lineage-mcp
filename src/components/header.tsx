'use client';

import { useEffect, useState } from 'react';

export function Header(): JSX.Element {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [mcpStatus, setMcpStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  useEffect(() => {
    let cancelled = false;

    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeSchema: true }),
        });
        if (!cancelled) {
          const healthy = response.ok;
          setDbStatus(healthy ? 'connected' : 'error');
          setMcpStatus(healthy ? 'connected' : 'error');
        }
      } catch {
        if (!cancelled) {
          setDbStatus('error');
          setMcpStatus('error');
        }
      }
    }

    void checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  const dotClass = (status: 'checking' | 'connected' | 'error'): string =>
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'error'
      ? 'bg-red-500'
      : 'bg-stone-300';

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-600">
          <span className="h-2 w-2 rounded-full bg-white" />
        </span>
        <span className="text-sm font-semibold tracking-tight text-stone-800">Data Lineage</span>
      </div>

      <div className="flex items-center gap-3 text-[11px] font-medium text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass(dbStatus)}`} />
          Supabase
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass(mcpStatus)}`} />
          MCP
        </span>
      </div>
    </header>
  );
}
