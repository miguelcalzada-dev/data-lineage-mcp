'use client';

import { useEffect, useState, useRef } from 'react';
import { Table2, Eye, ChevronDown, Search, Upload, Undo2, Download, HelpCircle, X } from 'lucide-react';
import type { SchemaMetadata, TableInfo } from '@/mcp/utils/postgres-inspector';
import type { AnalyzeResponse } from '@/app/api/analyze/route';
import { isValidSchema } from '@/mcp/utils/schema-analyzer';
import { apiPath } from '@/lib/api';

export interface DatabaseExplorerProps {
  schema?: SchemaMetadata | null;
  onLoadSchema: (schema: SchemaMetadata) => void;
  onClearSchema: () => void;
}

export function DatabaseExplorer({
  schema = null,
  onLoadSchema,
  onClearSchema,
}: DatabaseExplorerProps): JSX.Element {
  const [remote, setRemote] = useState<SchemaMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
  }, [schema]);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>): void {
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
        onLoadSchema(parsed);
      } catch {
        setError('No se pudo leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  const effective = schema ?? remote;

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
  const tables = (effective?.tables ?? []).filter((t) => !term || t.name.toLowerCase().includes(term));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-night-700 dark:bg-night-800">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tabla o vista…"
            className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none dark:text-night-100 dark:placeholder:text-night-500"
          />
        </div>

        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleFile} />

        {schema ? (
          <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
            <span className="text-xs font-medium text-orange-800">Base de datos personalizada</span>
            <button
              type="button"
              onClick={onClearSchema}
              className="flex items-center gap-1 text-[11px] font-medium text-orange-700 hover:underline"
            >
              <Undo2 className="h-3 w-3" />
              Volver a la predeterminada
            </button>
          </div>
        ) : (
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
          </div>
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

      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4 backdrop-blur-sm"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="no-scrollbar max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-night-700 dark:bg-night-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-base font-semibold text-stone-900 dark:text-night-100">
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
      "name": "orders",
      "type": "BASE TABLE",
      "columns": [
        { "table_schema": "public", "table_name": "orders",
          "column_name": "id", "data_type": "uuid",
          "is_nullable": "NO", "column_default": null,
          "ordinal_position": 1 }
      ]
    }
  ],
  "views": [
    { "schema": "public", "name": "vw_x", "definition": "SELECT ..." }
  ],
  "routines": [
    { "schema": "public", "name": "fn_x", "type": "FUNCTION",
      "return_type": null, "language": "plpgsql", "definition": "..." }
  ],
  "foreignKeys": [
    { "constraint_name": "fk_1",
      "source_schema": "public", "source_table": "orders",
      "source_column": "customer_id",
      "target_schema": "public", "target_table": "customers",
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
          </div>
        </div>
      )}
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
