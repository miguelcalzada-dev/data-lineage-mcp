'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, GitBranch, ChevronDown, MessageSquare, Database } from 'lucide-react';
import { Header } from '@/components/header';
import { ChatPanel } from '@/components/chat-panel';
import { DatabaseExplorer } from '@/components/database-explorer';
import { ImpactGraph } from '@/components/impact-graph';
import { SchemaSelector } from '@/components/schema-selector';
import { RiskBadge } from '@/components/risk-badge';
import type { AnalyzeResponse } from '@/app/api/analyze/route';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact } from '@/mcp/utils/postgres-inspector';

const objectTypeLabel: Record<string, string> = {
  view: 'Vista',
  routine: 'Función',
  foreign_key: 'Clave foránea',
  table: 'Tabla',
  column: 'Columna',
};

type Tab = 'chat' | 'db';

export default function HomePage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat');
  const [graph, setGraph] = useState<GraphDefinition | null>(null);
  const [impact, setImpact] = useState<DdlImpact | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleTraceLineage = useCallback(async (table: string, column: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: table, columnName: column }),
      });

      const data = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok || data.error) {
        throw new Error(data.error ?? 'No se pudo completar el análisis');
      }

      setImpact(data.impact ?? null);
      setGraph(data.graph ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChatResult = useCallback(
    (newGraph: GraphDefinition | null, newImpact: DdlImpact | null): void => {
      setGraph(newGraph);
      setImpact(newImpact);
    },
    []
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cream text-ink">
      <Header />

      <div className="flex min-h-0 flex-1">
      {/* Panel izquierdo */}
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-stone-300 bg-white">
        <div className="flex border-b border-stone-200">
          <TabButton
            active={tab === 'chat'}
            onClick={() => setTab('chat')}
            icon={<MessageSquare className="h-4 w-4" />}
            label="Chat"
          />
          <TabButton
            active={tab === 'db'}
            onClick={() => setTab('db')}
            icon={<Database className="h-4 w-4" />}
            label="Base de datos"
          />
        </div>

        <div className="min-h-0 flex-1">
          {tab === 'chat' ? (
            <ChatPanel onResult={handleChatResult} />
          ) : (
            <DatabaseExplorer />
          )}
        </div>

        <Accordion title="Explorar dependencias" icon={<GitBranch className="h-4 w-4" />}>
          <div className="p-4 pt-0">
            <p className="mb-3 text-xs leading-relaxed text-stone-500">
              Elige una tabla y columna para ver qué la usa.
            </p>
            <SchemaSelector onSelect={handleTraceLineage} />
          </div>
        </Accordion>
      </aside>

      {/* Panel principal: grafo */}
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
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
          ? 'border-orange-600 text-stone-900'
          : 'border-transparent text-stone-500 hover:text-stone-700'
      }`}
    >
      {icon}
      {label}
    </button>
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
    <details className="group border-t border-stone-200" open={defaultOpen}>
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
    <div className="absolute right-4 top-4 z-10 max-w-sm rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
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
