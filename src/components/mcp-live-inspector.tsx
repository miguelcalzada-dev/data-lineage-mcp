'use client';

import { useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import type { AnalyzeStep } from '@/app/api/analyze/route';

export interface McpLiveInspectorProps {
  steps: AnalyzeStep[];
  loading?: boolean;
}

export function McpLiveInspector({ steps, loading = false }: McpLiveInspectorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [steps]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
        <Terminal className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-medium text-slate-600">Registro de llamadas MCP</span>
        {loading && (
          <span className="ml-auto inline-flex h-2 w-2 animate-pulse rounded-full bg-slate-400" />
        )}
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
        {steps.length === 0 && (
          <div className="text-sm text-slate-400">
            Todavía no hay llamadas. Aquí verás en tiempo real las herramientas MCP que se ejecutan
            durante un análisis.
          </div>
        )}

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {step.tool}
                </span>
              </div>
              <pre className="max-h-32 overflow-auto rounded-md border border-slate-100 bg-slate-50 p-2 text-[10px] text-slate-600">
                {JSON.stringify(step.input, null, 2)}
              </pre>
              <pre className="max-h-48 overflow-auto rounded-md border border-slate-100 bg-slate-50 p-2 text-[10px] text-slate-700">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
