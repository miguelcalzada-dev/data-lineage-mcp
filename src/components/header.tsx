'use client';

import { useEffect, useState } from 'react';
import { Database, Server, Activity } from 'lucide-react';

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

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
          <Activity className="h-4 w-4 text-slate-700" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-900">Data Lineage & Impact Analyzer</h1>
          <p className="text-xs text-slate-500">MCP-powered PostgreSQL impact analysis</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <StatusBadge
          icon={<Database className="h-3 w-3" />}
          label="Supabase"
          status={dbStatus}
        />
        <StatusBadge
          icon={<Server className="h-3 w-3" />}
          label="MCP Tools"
          status={mcpStatus}
        />
      </div>
    </header>
  );
}

function StatusBadge({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: 'checking' | 'connected' | 'error';
}): JSX.Element {
  const statusClasses = {
    checking: 'bg-slate-100 text-slate-500',
    connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses[status]}`}
    >
      {icon}
      <span>{label}</span>
      <span className="capitalize">{status === 'checking' ? '…' : status}</span>
    </div>
  );
}
