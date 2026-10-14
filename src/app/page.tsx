'use client';

import { useState, useCallback } from 'react';
import { Header } from '@/components/header';
import { MigrationEditor } from '@/components/migration-editor';
import { ImpactGraph } from '@/components/impact-graph';
import { McpLiveInspector } from '@/components/mcp-live-inspector';
import { SchemaSelector } from '@/components/schema-selector';
import type { AnalyzeResponse, AnalyzeStep } from '@/app/api/analyze/route';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact } from '@/mcp/utils/postgres-inspector';

export default function HomePage(): JSX.Element {
  const [ddlStatement, setDdlStatement] = useState<string>('');
  const [graph, setGraph] = useState<GraphDefinition | null>(null);
  const [impact, setImpact] = useState<DdlImpact | null>(null);
  const [steps, setSteps] = useState<AnalyzeStep[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(
    async ({
      ddl,
      table,
      column,
    }: {
      ddl?: string;
      table?: string;
      column?: string;
    }): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ddlStatement: ddl,
            tableName: table,
            columnName: column,
            includeSchema: false,
          }),
        });

        const data = (await response.json()) as AnalyzeResponse & { error?: string };

        if (!response.ok || data.error) {
          throw new Error(data.error ?? 'Analysis failed');
        }

        setImpact(data.impact ?? null);
        setGraph(data.graph ?? null);
        setSteps(data.steps);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSimulateImpact = useCallback((): void => {
    if (!ddlStatement.trim()) return;
    void runAnalysis({ ddl: ddlStatement });
  }, [ddlStatement, runAnalysis]);

  const handleTraceLineage = useCallback(
    (table: string, column: string): void => {
      void runAnalysis({ table, column });
    },
    [runAnalysis]
  );

  const handleQuickPrompt = useCallback(
    (prompt: string): void => {
      setDdlStatement(prompt);
      void runAnalysis({ ddl: prompt });
    },
    [runAnalysis]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <Header />

      <main className="flex flex-1 gap-px overflow-hidden border-t border-slate-200 bg-slate-200">
        {/* Left panel */}
        <section className="flex w-96 flex-col bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Migration Input
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <MigrationEditor
              value={ddlStatement}
              onChange={setDdlStatement}
              onSubmit={handleSimulateImpact}
              loading={loading}
            />

            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Quick Prompts
              </h3>
              <div className="space-y-2">
                <QuickPrompt
                  label="Drop email from users"
                  ddl="ALTER TABLE users DROP COLUMN email"
                  onClick={handleQuickPrompt}
                />
                <QuickPrompt
                  label="Rename price in products"
                  ddl="ALTER TABLE products RENAME COLUMN price TO unit_price"
                  onClick={handleQuickPrompt}
                />
                <QuickPrompt
                  label="Drop customers table"
                  ddl="DROP TABLE customers"
                  onClick={handleQuickPrompt}
                />
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Trace Lineage
              </h3>
              <SchemaSelector onSelect={handleTraceLineage} />
            </div>
          </div>
        </section>

        {/* Center panel */}
        <section className="flex min-w-0 flex-1 flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Dependency Graph
            </h2>
            {impact && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  impact.risk === 'HIGH'
                    ? 'bg-red-50 text-red-700'
                    : impact.risk === 'MEDIUM'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {impact.risk} RISK
              </span>
            )}
          </div>

          <div className="relative flex-1">
            {error && (
              <div className="absolute left-4 right-4 top-4 z-10 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                {error}
              </div>
            )}
            <ImpactGraph graph={graph} loading={loading} />
          </div>
        </section>

        {/* Right panel */}
        <section className="flex w-96 flex-col bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              MCP Live Inspector
            </h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <McpLiveInspector steps={steps} loading={loading} />
          </div>
        </section>
      </main>
    </div>
  );
}

function QuickPrompt({
  label,
  ddl,
  onClick,
}: {
  label: string;
  ddl: string;
  onClick: (ddl: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onClick(ddl)}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
    >
      {label}
    </button>
  );
}
