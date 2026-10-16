'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Table2,
  Eye,
  ChevronDown,
  Search,
  Upload,
  Undo2,
  Download,
  HelpCircle,
  X,
  GitCompare,
  RefreshCw,
} from 'lucide-react';
import type { SchemaMetadata, TableInfo } from '@/mcp/utils/postgres-inspector';
import type { AnalyzeResponse } from '@/app/api/analyze/route';
import { normalizeSchema, auditSchema, diffSchemas, type SchemaDiff } from '@/mcp/utils/schema-analyzer';
import { apiPath } from '@/lib/api';
import { FluidTabs } from '@/components/fluid-tabs';
import { AnimataModal } from '@/components/animata-modal';
import type { DatabasePreset } from '@/data/schemas';

export interface DatabaseExplorerProps {
  schema?: SchemaMetadata | null;
  onLoadSchema: (schema: SchemaMetadata, name?: string) => void;
  onClearSchema: () => void;
  presets?: DatabasePreset[];
  activePresetId?: string;
  onSelectPreset?: (preset: DatabasePreset) => void;
  isCustom?: boolean;
}

export function DatabaseExplorer({
  schema = null,
  onLoadSchema,
  onClearSchema,
  presets = [],
  activePresetId = '',
  onSelectPreset,
  isCustom = false,
}: DatabaseExplorerProps): JSX.Element {
  const [remote, setRemote] = useState<SchemaMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [diff, setDiff] = useState<{ name: string; result: SchemaDiff } | null>(null);
  const [diffOpen, setDiffOpen] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const diffFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (schema) return;
    let cancelled = false;
    setLoading(true);

    async function load(): Promise<void> {
      try {
        const response = await fetch(apiPath('/api/analyze'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeSchema: true }),
        });
        const data = (await response.json()) as AnalyzeResponse & { error?: string };
        if (!cancelled) {
          if (data.error) setError(data.error);
          else if (data.schema) setRemote(data.schema);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [schema, reloadKey]);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        const normalized = normalizeSchema(parsed);
        if (!normalized) {
          setError('El JSON no tiene el formato de esquema esperado.');
          return;
        }
        setError(null);
        onLoadSchema(normalized, file.name.replace(/\.[^.]+$/, ''));
      } catch {
        setError('No se pudo leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function handleDiffFile(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = normalizeSchema(JSON.parse(String(reader.result)) as unknown);
        if (!parsed) {
          setError('El JSON no tiene el formato de esquema esperado.');
          return;
        }
        if (!effective) return;
        setError(null);
        setDiff({
          name: file.name.replace(/\.[^.]+$/, ''),
          result: diffSchemas(effective, parsed),
        });
        setDiffOpen(true);
      } catch {
        setError('No se pudo leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function refresh(): void {
    void fetch(apiPath('/api/schema-graph'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: true }),
    }).catch(() => undefined);
    setReloadKey((k) => k + 1);
  }

  const effective = schema ?? remote;
  const audit = useMemo(() => (effective ? auditSchema(effective) : null), [effective]);

  function exportSchema(): void {
    if (!effective) return;
    const blob = new Blob([JSON.stringify(effective, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'esquema-bbdd.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const term = search.trim().toLowerCase();
  const tables = (effective?.tables ?? []).filter(
    (t) =>
      !term ||
      t.name.toLowerCase().includes(term) ||
      t.columns.some((c) => c.column_name.toLowerCase().includes(term))
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-night-700 dark:bg-night-800">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tabla, vista o columna…"
            className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none dark:text-night-100 dark:placeholder:text-night-500"
          />
          <button
            type="button"
            onClick={refresh}
            title="Actualizar esquema"
            aria-label="Actualizar esquema"
            className="shrink-0 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-night-700 dark:hover:text-night-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {presets.length > 0 && (
          <FluidTabs
            active={activePresetId}
            layoutId="db-preset-tabs"
            onChange={(id) => {
              const preset = presets.find((p) => p.id === id);
              if (preset && onSelectPreset) onSelectPreset(preset);
            }}
            tabs={presets.map((p) => ({ id: p.id, label: p.label }))}
          />
        )}

        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleFile} />
        <input ref={diffFileRef} type="file" accept=".json,application/json" hidden onChange={handleDiffFile} />

        {isCustom && (
          <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-500/40 dark:bg-orange-500/15">
            <span className="text-xs font-medium text-orange-800 dark:text-orange-300">
              Base de datos personalizada
            </span>
            <button
              type="button"
              onClick={onClearSchema}
              className="flex items-center gap-1 text-[11px] font-medium text-orange-700 hover:underline dark:text-orange-300"
            >
              <Undo2 className="h-3 w-3" />
              Quitar
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 dark:border-night-700 dark:bg-night-800 dark:text-night-300 dark:hover:bg-night-700"
          >
            <Upload className="h-3.5 w-3.5" />
            Cargar (JSON)
          </button>
          <button
            type="button"
            onClick={exportSchema}
            disabled={!effective}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300 dark:border-night-700 dark:bg-night-800 dark:text-night-300 dark:hover:bg-night-700"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar (JSON)
          </button>
          <button
            type="button"
            onClick={() => diffFileRef.current?.click()}
            disabled={!effective}
            title="Comparar con otro esquema"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300 dark:border-night-700 dark:bg-night-800 dark:text-night-300 dark:hover:bg-night-700"
          >
            <GitCompare className="h-3.5 w-3.5" />
            Comparar
          </button>
        </div>

        {audit && (
          <details className="group rounded-lg border border-stone-200 bg-white dark:border-night-700 dark:bg-night-800">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-stone-600 dark:text-night-300">
              <span>Salud del esquema</span>
              <ChevronDown className="h-3.5 w-3.5 text-stone-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-stone-100 px-3 py-2 text-[11px] text-stone-500 dark:border-night-700 dark:text-night-400">
              <p>
                {audit.counts.tables} tablas · {audit.counts.views} vistas · {audit.counts.routines} funciones ·{' '}
                {audit.counts.foreignKeys} FKs
              </p>

              {audit.foreignKeysWithoutIndex.length > 0 && (
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    FKs sin índice ({audit.foreignKeysWithoutIndex.length})
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {audit.foreignKeysWithoutIndex.slice(0, 8).map((fk) => (
                      <li key={fk.constraint} className="truncate">
                        {fk.table}.{fk.column} → {fk.references}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(audit.counts.views > 0 || audit.counts.routines > 0) && audit.unusedColumns.length > 0 && (
                <div>
                  <p className="font-semibold text-stone-600 dark:text-night-300">
                    Posibles columnas sin uso ({audit.unusedColumns.length})
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {audit.unusedColumns.slice(0, 8).map((c) => (
                      <li key={`${c.table}.${c.column}`} className="truncate">
                        {c.table}.{c.column}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {audit.unusedViews.length > 0 && (
                <p>Vistas sin uso aparente: {audit.unusedViews.slice(0, 6).join(', ')}</p>
              )}
              {audit.unusedRoutines.length > 0 && (
                <p>Funciones sin uso aparente: {audit.unusedRoutines.slice(0, 6).join(', ')}</p>
              )}

              {audit.foreignKeysWithoutIndex.length === 0 &&
                audit.unusedColumns.length === 0 &&
                audit.unusedViews.length === 0 &&
                audit.unusedRoutines.length === 0 && <p>Sin incidencias detectadas.</p>}
            </div>
          </details>
        )}

        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="flex w-full items-center justify-center gap-1.5 pt-1 text-[11px] font-medium text-stone-400 transition hover:text-stone-600 dark:text-night-500 dark:hover:text-night-300"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          ¿Cómo consigo el JSON de mi base de datos?
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && <div className="px-1 text-sm text-stone-500">Cargando esquema…</div>}
        {error && <div className="px-1 text-sm text-red-600">{error}</div>}

        {effective && (
          <div className="space-y-1">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-night-500">
              {tables.length} objetos
            </p>
            {tables.map((table) => (
              <TableRow key={`${table.schema}.${table.name}`} table={table} />
            ))}
          </div>
        )}
      </div>

      <AnimataModal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        labelledBy="db-help-title"
        className="no-scrollbar max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
              <h3 id="db-help-title" className="text-base font-semibold text-stone-900 dark:text-night-100">
                ¿Cómo consigo el JSON de mi base de datos?
              </h3>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-night-700 dark:hover:text-night-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm leading-relaxed text-stone-600 dark:text-night-300">
              <div>
                <p className="font-medium text-stone-800 dark:text-night-100">Opción 1 · Exportar desde aquí</p>
                <p className="mt-1">
                  Si esta app ya está conectada a tu base de datos (Supabase), pulsa{' '}
                  <span className="font-medium">«Exportar (JSON)»</span> y se descargará el archivo
                  listo para volver a cargarlo.
                </p>
              </div>

              <div>
                <p className="font-medium text-stone-800 dark:text-night-100">Opción 2 · Crear tu propio JSON</p>
                <p className="mt-1">
                  Para cualquier otra base de datos PostgreSQL, crea un archivo <code>.json</code> con
                  esta estructura y súbelo con{' '}
                  <span className="font-medium">«Cargar (JSON)»</span>:
                </p>
                <pre className="no-scrollbar mt-2 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-600 dark:border-night-700 dark:bg-night-800 dark:text-night-300">
{`{
  "tables": [
    {
      "schema": "public",
      "name": "pedidos",
      "type": "BASE TABLE",
      "columns": [
        { "table_schema": "public", "table_name": "pedidos",
          "column_name": "id", "data_type": "uuid",
          "is_nullable": "NO", "column_default": null,
          "ordinal_position": 1 }
      ]
    }
  ],
  "views": [
    { "schema": "public", "name": "vista_resumen_clientes", "definition": "SELECT ..." }
  ],
  "routines": [
    { "schema": "public", "name": "valor_total_cliente", "type": "FUNCTION",
      "return_type": null, "language": "plpgsql", "definition": "..." }
  ],
  "foreignKeys": [
    { "constraint_name": "fk_1",
      "source_schema": "public", "source_table": "pedidos",
      "source_column": "cliente_id",
      "target_schema": "public", "target_table": "clientes",
      "target_column": "id" }
  ],
  "primaryKeys": []
}`}
                </pre>
              </div>

              <p className="text-xs text-stone-400">
                El campo <code>definition</code> de vistas y funciones es lo que permite detectar
                dependencias. Si no lo tienes, puedes dejarlo vacío.
              </p>
            </div>
      </AnimataModal>

      <AnimataModal
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        labelledBy="db-diff-title"
        className="no-scrollbar max-h-[80vh] overflow-y-auto"
      >
        {diff && (
          <>
            <div className="flex items-start justify-between gap-4">
              <h3 id="db-diff-title" className="text-base font-semibold text-stone-900 dark:text-night-100">
                Comparación con “{diff.name}”
              </h3>
              <button
                type="button"
                onClick={() => setDiffOpen(false)}
                className="rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-night-700 dark:hover:text-night-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-stone-600 dark:text-night-300">
              <DiffSection title="Tablas añadidas" items={diff.result.addedTables} tone="add" />
              <DiffSection title="Tablas eliminadas" items={diff.result.removedTables} tone="remove" />

              {diff.result.changedTables.length > 0 && (
                <div>
                  <p className="font-medium text-stone-800 dark:text-night-100">
                    Tablas modificadas ({diff.result.changedTables.length})
                  </p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {diff.result.changedTables.map((t) => (
                      <li key={t.name}>
                        <span className="font-mono text-stone-700 dark:text-night-200">{t.name}</span>
                        {t.addedColumns.length > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400"> +{t.addedColumns.join(', ')}</span>
                        )}
                        {t.removedColumns.length > 0 && (
                          <span className="text-red-600 dark:text-red-400"> -{t.removedColumns.join(', ')}</span>
                        )}
                        {t.changedColumns.map((c) => (
                          <span key={c.column} className="block text-amber-600 dark:text-amber-400">
                            ~ {c.column}: {c.from} → {c.to}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <DiffSection title="Vistas añadidas" items={diff.result.addedViews} tone="add" />
              <DiffSection title="Vistas eliminadas" items={diff.result.removedViews} tone="remove" />
              <DiffSection title="Funciones añadidas" items={diff.result.addedRoutines} tone="add" />
              <DiffSection title="Funciones eliminadas" items={diff.result.removedRoutines} tone="remove" />
              <DiffSection title="Claves foráneas añadidas" items={diff.result.addedForeignKeys} tone="add" />
              <DiffSection title="Claves foráneas eliminadas" items={diff.result.removedForeignKeys} tone="remove" />

              {diff.result.addedTables.length === 0 &&
                diff.result.removedTables.length === 0 &&
                diff.result.changedTables.length === 0 &&
                diff.result.addedViews.length === 0 &&
                diff.result.removedViews.length === 0 &&
                diff.result.addedRoutines.length === 0 &&
                diff.result.removedRoutines.length === 0 &&
                diff.result.addedForeignKeys.length === 0 &&
                diff.result.removedForeignKeys.length === 0 && <p>No hay diferencias.</p>}
            </div>
          </>
        )}
      </AnimataModal>
    </div>
  );
}

function DiffSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'add' | 'remove';
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-medium text-stone-800 dark:text-night-100">
        {title} ({items.length})
      </p>
      <ul
        className={`mt-1 space-y-0.5 text-xs ${
          tone === 'add' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        {items.slice(0, 12).map((item) => (
          <li key={item} className="truncate font-mono">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableRow({ table }: { table: TableInfo }): JSX.Element {
  const isView = table.type !== 'BASE TABLE';
  const Icon = isView ? Eye : Table2;

  return (
    <details className="group rounded-lg border border-stone-200 bg-white dark:border-night-700 dark:bg-night-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-stone-50 dark:hover:bg-night-700">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            isView
              ? 'bg-stone-100 text-stone-500 dark:bg-night-700 dark:text-night-300'
              : 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-stone-800 dark:text-night-100">{table.name}</span>
          <span className="block text-[10px] text-stone-400 dark:text-night-500">
            {isView ? 'Vista' : 'Tabla'} · {table.columns.length} col.
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-stone-100 px-3 py-2 dark:border-night-700">
        {table.columns.length === 0 ? (
          <p className="text-xs text-stone-400">Sin columnas visibles.</p>
        ) : (
          <ul className="space-y-0.5">
            {table.columns.map((col) => (
              <li key={col.column_name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono text-stone-700 dark:text-night-300">{col.column_name}</span>
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-night-700 dark:text-night-400">
                  {col.data_type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
