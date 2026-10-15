'use client';

import { useState, useCallback } from 'react';
import { CheckCircle2, ListChecks, GitBranch, Sparkles } from 'lucide-react';
import { Header } from '@/components/header';
import { MigrationEditor } from '@/components/migration-editor';
import { ImpactGraph } from '@/components/impact-graph';
import { McpLiveInspector } from '@/components/mcp-live-inspector';
import { SchemaSelector } from '@/components/schema-selector';
import { RiskBadge } from '@/components/risk-badge';
import type { AnalyzeResponse, AnalyzeStep } from '@/app/api/analyze/route';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact } from '@/mcp/utils/postgres-inspector';

const QUICK_PROMPTS: Array<{ label: string; description: string; ddl: string }> = [
  {
    label: 'Borrar una columna que usan otros',
    description: 'Elimina customer_id de orders',
    ddl: 'ALTER TABLE orders DROP COLUMN customer_id',
  },
  {
    label: 'Borrar el email de usuarios',
    description: 'Elimina email de users',
    ddl: 'ALTER TABLE users DROP COLUMN email',
  },
  {
    label: 'Renombrar una columna',
    description: 'Cambia price por unit_price',
    ddl: 'ALTER TABLE products RENAME COLUMN price TO unit_price',
  },
  {
    label: 'Eliminar la tabla de clientes',
    description: 'Borra customers',
    ddl: 'DROP TABLE customers',
  },
  {
    label: 'Eliminar la tabla de productos',
    description: 'Borra products',
    ddl: 'DROP TABLE products',
  },
  {
    label: 'Borrar columna de pedidos',
    description: 'Elimina product_id de order_items',
    ddl: 'ALTER TABLE order_items DROP COLUMN product_id',
  },
];

const objectTypeLabel: Record<string, string> = {
  view: 'Vista',
  routine: 'Función',
  foreign_key: 'Clave foránea',
  table: 'Tabla',
  column: 'Columna',
};

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
          throw new Error(data.error ?? 'No se pudo completar el análisis');
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
        {/* Panel izquierdo */}
        <section className="flex w-[380px] flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Sparkles className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">¿Qué cambio quieres analizar?</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <MigrationEditor
              value={ddlStatement}
              onChange={setDdlStatement}
              onSubmit={handleSimulateImpact}
              loading={loading}
            />

            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Ejemplos rápidos
                </h3>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">
                Pulsa uno para ver cómo funciona al instante.
              </p>
              <div className="space-y-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <QuickPrompt
                    key={prompt.ddl}
                    label={prompt.label}
                    description={prompt.description}
                    ddl={prompt.ddl}
                    onClick={handleQuickPrompt}
                  />
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Explorar dependencias
                </h3>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">
                Elige una tabla y una columna para ver quién depende de ella (vistas, funciones o
                claves foráneas que la usan).
              </p>
              <SchemaSelector onSelect={handleTraceLineage} />
            </div>
          </div>
        </section>

        {/* Panel central */}
        <section className="flex min-w-0 flex-1 flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Mapa de impacto</h2>
          </div>

          {impact && <ImpactSummary impact={impact} />}

          <div className="relative flex-1">
            {error && (
              <div className="absolute left-4 right-4 top-4 z-10 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                {error}
              </div>
            )}
            <ImpactGraph graph={graph} loading={loading} />
          </div>
        </section>

        {/* Panel derecho */}
        <section className="flex w-[380px] flex-col bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Inspector MCP en vivo</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <McpLiveInspector steps={steps} loading={loading} />
          </div>
        </section>
      </main>
    </div>
  );
}

function ImpactSummary({ impact }: { impact: DdlImpact }): JSX.Element {
  const count = impact.affectedObjects.length;

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-800">
          Sin impacto: este cambio no romperá nada.
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">Resultado del análisis</span>
        <RiskBadge level={impact.risk} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Este cambio afectará a {count} objeto{count === 1 ? '' : 's'}:
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {impact.affectedObjects.map((obj, i) => (
          <li
            key={i}
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-2.5 py-0.5 text-xs"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span className="font-medium text-slate-700">{obj.name}</span>
            <span className="text-slate-400">· {objectTypeLabel[obj.type] ?? obj.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickPrompt({
  label,
  description,
  ddl,
  onClick,
}: {
  label: string;
  description: string;
  ddl: string;
  onClick: (ddl: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onClick(ddl)}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-100"
    >
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      <span className="block font-mono text-[11px] text-slate-400">{description}</span>
    </button>
  );
}
