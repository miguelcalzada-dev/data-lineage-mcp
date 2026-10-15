'use client';

import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

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
      ? 'bg-red-400'
      : 'bg-stone-300';

  return (
    <div className="absolute bottom-4 left-4 z-30 flex items-center gap-3 text-[11px] font-medium text-stone-500 dark:text-night-400">
      <div className="pointer-events-auto">
        <ThemeToggle />
      </div>
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass(dbStatus)}`} />
        Supabase
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass(mcpStatus)}`} />
        MCP
      </span>
    </div>
  );
}
