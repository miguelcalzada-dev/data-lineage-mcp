'use client';

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, GitBranch, ChevronDown, MessageSquare, Database, Network, Upload } from 'lucide-react';
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
import { apiPath } from '@/lib/api';
import { GradientText } from '@/components/gradient-text';
import { DATABASE_PRESETS, buildSchemaSuggestions, getPresetById, type DatabasePreset } from '@/data/schemas';

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
  const [customSchema, setCustomSchema] = useState<SchemaMetadata | null>(DATABASE_PRESETS[0].schema);
  const [activePresetId, setActivePresetId] = useState<string>('empresa');
  const [chatSuggestions, setChatSuggestions] = useState<string[]>(DATABASE_PRESETS[0].suggestions);
  const [isCustomSchema, setIsCustomSchema] = useState<boolean>(false);
  const [schemaVersion, setSchemaVersion] = useState<number>(0);
  const spotlight = useSpotlight();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('dlia:customSchema');
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isValidSchema(parsed)) {
          setCustomSchema(parsed);
          setIsCustomSchema(true);
          setActivePresetId('custom');
          setChatSuggestions(buildSchemaSuggestions(parsed));
        }
      }
    } catch {
      // ignora un JSON inválido guardado
    }
  }, []);

  const handleLoadSchema = useCallback((loaded: SchemaMetadata): void => {
    setCustomSchema(loaded);
    setIsCustomSchema(true);
    setActivePresetId('custom');
    setChatSuggestions(buildSchemaSuggestions(loaded));
    setSchemaVersion((v) => v + 1);
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

  const handleSelectPreset = useCallback(
    (preset: DatabasePreset): void => {
      setActivePresetId(preset.id);
      setChatSuggestions(preset.suggestions);
      setIsCustomSchema(false);
      setCustomSchema(preset.schema);
      setSchemaVersion((v) => v + 1);
      setGraph(schemaToGraph(preset.schema));
      setImpact(null);
      setGraphMode('schema');
      try {
        window.localStorage.removeItem('dlia:customSchema');
      } catch {
        // ignora errores de almacenamiento
      }
    },
    []
  );

  const handleClearSchema = useCallback((): void => {
    try {
      window.localStorage.removeItem('dlia:customSchema');
    } catch {
      // ignora errores de almacenamiento
    }
    const fallback = getPresetById('empresa') ?? DATABASE_PRESETS[0];
    if (fallback) handleSelectPreset(fallback);
  }, [handleSelectPreset]);

  const schemaFileRef = useRef<HTMLInputElement>(null);

  const handleSchemaFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as unknown;
          if (!isValidSchema(parsed)) {
            setError('El JSON no tiene el formato de esquema esperado.');
            return;
          }
          setError(null);
          setIsCustomSchema(true);
          handleLoadSchema(parsed);
        } catch {
          setError('No se pudo leer el archivo JSON.');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    },
    [handleLoadSchema]
  );

  const loadSchemaGraph = useCallback(
    async (override?: SchemaMetadata | null): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(apiPath('/api/schema-graph'), {
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
        const response = await fetch(apiPath('/api/analyze'), {
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

  const activeDatabaseLabel = isCustomSchema
    ? 'Base propia (JSON)'
    : (getPresetById(activePresetId)?.label ?? DATABASE_PRESETS[0].label);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-transparent text-ink dark:text-night-100">
      <Header align={hasStarted ? 'right' : 'left'} />

      <div
        className={
          hasStarted
            ? 'flex min-h-0 flex-1 flex-col md:flex-row'
            : 'flex min-h-0 flex-1 items-center justify-center p-4 md:p-6'
        }
      >
        {/* Chat: centrado (hero) o sidebar */}
        <motion.div
          layout
          transition={springTransition}
          className={
            hasStarted
              ? 'flex h-[55dvh] w-full shrink-0 flex-col border-b border-stone-300 bg-white md:h-auto md:w-[380px] md:border-b-0 md:border-r dark:border-night-700 dark:bg-night-900'
              : 'flex w-full max-w-3xl flex-col gap-4'
          }
        >
          {!hasStarted && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <h1 className="flex items-center justify-center gap-2 text-balance text-center font-sans text-2xl font-semibold tracking-tight md:gap-3 md:text-3xl">
                <Network className="h-6 w-6 shrink-0 text-orange-500 md:h-7 md:w-7" />
                <GradientText text="Explora el impacto de tus cambios" />
              </h1>
            </motion.div>
          )}

          <div
            ref={spotlight.ref}
            {...(hasStarted ? {} : spotlight.handlers)}
            className={
              hasStarted
                ? 'flex min-h-0 flex-1 flex-col'
                : 'relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-night-700 dark:bg-night-900'
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
                  presets={DATABASE_PRESETS}
                  activePresetId={activePresetId}
                  onSelectPreset={handleSelectPreset}
                  isCustom={isCustomSchema}
                />
              ) : (
                <ChatPanel
                  key={schemaVersion}
                  onResult={handleChatResult}
                  schema={customSchema}
                  onStart={() => setHasStarted(true)}
                  expanded={hasStarted}
                  hideTitle={!hasStarted}
                  suggestions={chatSuggestions}
                  databaseLabel={activeDatabaseLabel}
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

          {!hasStarted && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-full max-w-md">
                <FluidTabs
                  active={activePresetId}
                  onChange={(id) => {
                    const preset = DATABASE_PRESETS.find((p) => p.id === id);
                    if (preset) handleSelectPreset(preset);
                  }}
                  tabs={DATABASE_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
                />
              </div>
              <input
                ref={schemaFileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleSchemaFile}
              />
              <button
                type="button"
                onClick={() => schemaFileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-stone-400 transition hover:text-stone-600 dark:text-night-500 dark:hover:text-night-300"
              >
                <Upload className="h-3.5 w-3.5" />
                ¿Tienes tu propia base de datos? Carga tu JSON
              </button>
            </div>
          )}
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
                  <div className="absolute left-4 right-4 top-4 z-20 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
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
    <details className="group border-t border-stone-200 dark:border-night-700" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50 dark:hover:bg-night-800">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-night-200">
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

  if (impact.notFound) {
    return (
      <div className="absolute right-4 top-4 z-10 max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-lg dark:border-amber-500/40 dark:bg-amber-500/10">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">No existe</span>
        </div>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{impact.summary}</p>
      </div>
    );
  }

  return (
    <div className="absolute right-4 top-4 z-10 max-w-sm rounded-xl border border-stone-200 bg-white p-4 shadow-lg dark:border-night-700 dark:bg-night-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-stone-800 dark:text-night-100">Resultado</span>
        <RiskBadge level={impact.risk} />
      </div>

      {count === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Este cambio no romperá nada.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-600 dark:text-night-300">
            {count} objeto{count === 1 ? '' : 's'} relacionado{count === 1 ? '' : 's'}:
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {impact.affectedObjects.map((obj, i) => (
              <li
                key={i}
                className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs dark:border-orange-500/40 dark:bg-orange-500/10"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span className="font-medium text-stone-700 dark:text-night-100">{obj.name}</span>
                <span className="text-stone-400 dark:text-night-500">· {objectTypeLabel[obj.type] ?? obj.type}</span>
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
