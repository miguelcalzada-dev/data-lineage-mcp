'use client';

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, GitBranch, ChevronDown, MessageSquare, Database } from 'lucide-react';
import { Header } from '@/components/header';
import { ChatPanel } from '@/components/chat-panel';
import { DatabaseExplorer } from '@/components/database-explorer';
import { ImpactGraph } from '@/components/impact-graph';
import { SchemaSelector } from '@/components/schema-selector';
import { RiskBadge } from '@/components/risk-badge';
import { FluidTabs } from '@/components/fluid-tabs';
import type { AnalyzeResponse } from '@/app/api/analyze/route';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact, LineageNode, SchemaMetadata } from '@/mcp/utils/postgres-inspector';
import type { GraphMode } from '@/components/impact-graph';
import { isValidSchema, schemaToGraph } from '@/mcp/utils/schema-analyzer';
import { useSpotlight } from '@/lib/use-spotlight';

const objectTypeLabel: Record<string, string> = {
  view: 'Vista',
  routine: 'Función',
  foreign_key: 'Clave foránea',
  table: 'Tabla',
  column: 'Columna',
};

type Tab = 'chat' | 'db';

const springTransition = { type: 'spring' as const, stiffness: 320, damping: 34 };

export default function HomePage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat');
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [graph, setGraph] = useState<GraphDefinition | null>(null);
  const [impact, setImpact] = useState<DdlImpact | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState<GraphMode>('impact');
  const [customSchema, setCustomSchema] = useState<SchemaMetadata | null>(null);
  const spotlight = useSpotlight();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('dlia:customSchema');
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isValidSchema(parsed)) setCustomSchema(parsed);
      }
    } catch {
      // ignora un JSON inválido guardado
    }
  }, []);

  const handleLoadSchema = useCallback((loaded: SchemaMetadata): void => {
    setCustomSchema(loaded);
    setGraph(schemaToGraph(loaded));
    setImpact(null);
    setGraphMode('schema');
    setHasStarted(true);
    try {
      window.localStorage.setItem('dlia:customSchema', JSON.stringify(loaded));
    } catch {
      // ignora errores de almacenamiento
    }
  }, []);

  const handleClearSchema = useCallback((): void => {
    setCustomSchema(null);
    try {
      window.localStorage.removeItem('dlia:customSchema');
    } catch {
      // ignora errores de almacenamiento
    }
  }, []);

  const loadSchemaGraph = useCallback(
    async (override?: SchemaMetadata | null): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/schema-graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schema: (override ?? customSchema) ?? undefined }),
        });
        const data = (await response.json()) as GraphDefinition & { error?: string };
        if (!response.ok || data.error) {
          throw new Error(data.error ?? 'No se pudo cargar el esquema');
        }
        setGraph(data);
        setImpact(null);
        setGraphMode('schema');
        setHasStarted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [customSchema]
  );

  const handleTraceLineage = useCallback(
    async (table: string, column: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableName: table, columnName: column, schema: customSchema ?? undefined }),
        });

        const data = (await response.json()) as AnalyzeResponse & { error?: string };
        if (!response.ok || data.error) {
          throw new Error(data.error ?? 'No se pudo completar el análisis');
        }

        setGraph(data.graph ?? null);
        setGraphMode('impact');
        setHasStarted(true);

        const lineage: LineageNode[] = data.lineage ?? [];
        const dependents = lineage.filter((l) => l.relation !== 'origin');
        const origin = lineage.find((l) => l.relation === 'origin') ?? lineage[0];

        if (dependents.length > 0 && origin) {
          setImpact({
            risk: dependents.length > 3 ? 'HIGH' : 'MEDIUM',
            summary: '',
            affectedObjects: dependents.map((d) => ({
              type: mapKindToAffected(d.kind),
              schema: d.schema,
              name: d.table,
              detail: `Depende de ${origin.table}.${origin.column}`,
            })),
            target: { schema: origin.schema, table: origin.table, column: origin.column },
          });
        } else {
          setImpact(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [customSchema]
  );

  const handleChatResult = useCallback(
    (newGraph: GraphDefinition | null, newImpact: DdlImpact | null): void => {
      setGraph(newGraph);
      setImpact(newImpact);
      setGraphMode('impact');
    },
    []
  );

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-cream text-ink">
      <Header />

      <div
        className={
          hasStarted
            ? 'flex min-h-0 flex-1'
            : 'flex min-h-0 flex-1 items-center justify-center p-6'
        }
      >
        {/* Chat: centrado (hero) o sidebar */}
        <motion.div
          layout
          transition={springTransition}
          className={
            hasStarted
              ? 'flex w-[380px] shrink-0 flex-col border-r border-stone-300 bg-white'
              : 'flex w-full max-w-3xl flex-col gap-4'
          }
        >
          {!hasStarted && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <h1 className="font-mono text-2xl font-bold italic tracking-tight text-orange-600">
                Explora el impacto de tus cambios
              </h1>
            </motion.div>
          )}

          <div
            ref={spotlight.ref}
            {...(hasStarted ? {} : spotlight.handlers)}
            className={
              hasStarted
                ? 'flex min-h-0 flex-1 flex-col'
                : 'relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm'
            }
          >
            {!hasStarted && (
              <div
                className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
                style={spotlight.overlayStyle}
              />
            )}
            <div className={hasStarted ? 'contents' : 'relative z-10'}>
            {hasStarted && (
              <div className="border-b border-stone-200 p-2">
                <FluidTabs
                  active={tab}
                  onChange={(id) => {
                    const next = id as Tab;
                    setTab(next);
                    if (next === 'db') void loadSchemaGraph();
                  }}
                  tabs={[
                    { id: 'chat', label: 'Chat', icon: <MessageSquare className="h-4 w-4" /> },
                    { id: 'db', label: 'Base de datos', icon: <Database className="h-4 w-4" /> },
                  ]}
                />
              </div>
            )}

            <div className={hasStarted ? 'min-h-0 flex-1' : ''}>
              {hasStarted && tab === 'db' ? (
                <DatabaseExplorer
                  schema={customSchema}
                  onLoadSchema={handleLoadSchema}
                  onClearSchema={handleClearSchema}
                />
              ) : (
                <ChatPanel
                  onResult={handleChatResult}
                  schema={customSchema}
                  onStart={() => setHasStarted(true)}
                  expanded={hasStarted}
                  hideTitle={!hasStarted}
                />
              )}
            </div>

            {hasStarted && (
              <Accordion title="Explorar dependencias" icon={<GitBranch className="h-4 w-4" />}>
                <div className="p-4 pt-0">
                  <p className="mb-3 text-xs leading-relaxed text-stone-500">
                    Elige una tabla y columna para ver qué la usa.
                  </p>
                  <SchemaSelector onSelect={handleTraceLineage} schema={customSchema} />
                </div>
              </Accordion>
            )}
            </div>
          </div>
        </motion.div>

        {/* Panel derecho: grafo */}
        <AnimatePresence>
          {hasStarted && (
            <motion.main
              key="graph"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="relative flex min-w-0 flex-1 flex-col"
            >
              <div className="relative flex-1">
                {error && (
                  <div className="absolute left-4 right-4 top-4 z-20 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                    {error}
                  </div>
                )}
                <ImpactGraph graph={graph} loading={loading} mode={graphMode} />
                {impact && <ImpactSummary impact={impact} />}
              </div>
            </motion.main>
          )}
        </AnimatePresence>
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
            {count} objeto{count === 1 ? '' : 's'} relacionado{count === 1 ? '' : 's'}:
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

function mapKindToAffected(kind: string): 'column' | 'table' | 'view' | 'foreign_key' | 'routine' {
  if (kind === 'view' || kind === 'routine' || kind === 'foreign_key' || kind === 'table') {
    return kind;
  }
  return 'table';
}
