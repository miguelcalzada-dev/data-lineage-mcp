'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, ListChecks, GitBranch, ChevronDown } from 'lucide-react';
import { Header } from '@/components/header';
import { MigrationEditor } from '@/components/migration-editor';
import { ImpactGraph } from '@/components/impact-graph';
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
    <div className="relative flex h-screen overflow-hidden bg-cream text-ink">
      <Header />

      {/* Panel izquierdo */}
      <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-r border-stone-300 bg-white">
        <div className="border-b border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-800">¿Qué cambio quieres analizar?</h2>
          <p className="mb-3 mt-0.5 text-xs text-stone-500">Escribe una sentencia o elige un ejemplo.</p>
          <MigrationEditor
            value={ddlStatement}
            onChange={setDdlStatement}
            onSubmit={handleSimulateImpact}
            loading={loading}
          />
        </div>

        <Accordion title="Ejemplos rápidos" icon={<ListChecks className="h-4 w-4" />} defaultOpen>
          <div className="space-y-1.5 p-4 pt-0">
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
        </Accordion>

        <Accordion title="Explorar dependencias" icon={<GitBranch className="h-4 w-4" />}>
          <div className="p-4 pt-0">
            <p className="mb-3 text-xs leading-relaxed text-stone-500">
              Elige una tabla y columna para ver qué la usa.
            </p>
            <SchemaSelector onSelect={handleTraceLineage} />
          </div>
        </Accordion>
      </aside>

      {/* Panel principal */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1">
          {error && (
            <div className="absolute left-4 right-4 top-4 z-20 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
              {error}
            </div>
          )}
          <ImpactGraph graph={graph} loading={loading} />
          {impact && <ImpactSummary impact={impact} />}
        </div>
      </main>
    </div>
  );
}

function Accordion({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}): JSX.Element {
  return (
    <details className="group border-b border-stone-200" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-700">
          {icon}
          {title}
        </span>
        <ChevronDown className="h-4 w-4 text-stone-400 transition-transform group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}

function ImpactSummary({ impact }: { impact: DdlImpact }): JSX.Element {
  const count = impact.affectedObjects.length;

  return (
    <div className="absolute left-4 top-4 z-10 max-w-sm rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-stone-800">Resultado</span>
        <RiskBadge level={impact.risk} />
      </div>

      {count === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Este cambio no romperá nada.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-600">
            Este cambio afectará a {count} objeto{count === 1 ? '' : 's'}:
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {impact.affectedObjects.map((obj, i) => (
              <li
                key={i}
                className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span className="font-medium text-stone-700">{obj.name}</span>
                <span className="text-stone-400">· {objectTypeLabel[obj.type] ?? obj.type}</span>
              </li>
            ))}
          </ul>
        </>
      )}
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
      className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-left transition hover:border-orange-300 hover:bg-orange-50"
    >
      <span className="block text-sm font-medium text-stone-800">{label}</span>
      <span className="block font-mono text-[11px] text-stone-400">{description}</span>
    </button>
  );
}
