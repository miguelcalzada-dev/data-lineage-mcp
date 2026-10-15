'use client';

import { useEffect, useState, useRef } from 'react';
import { Table2, Eye, ChevronDown, Search, Upload, Undo2 } from 'lucide-react';
import type { SchemaMetadata, TableInfo } from '@/mcp/utils/postgres-inspector';
import type { AnalyzeResponse } from '@/app/api/analyze/route';
import { isValidSchema } from '@/mcp/utils/schema-analyzer';

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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (schema) return;
    let cancelled = false;
    setLoading(true);

    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/analyze', {
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
  const term = search.trim().toLowerCase();
  const tables = (effective?.tables ?? []).filter((t) => !term || t.name.toLowerCase().includes(term));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tabla o vista…"
            className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none"
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Cargar mi base de datos (JSON)
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && <div className="px-1 text-sm text-stone-500">Cargando esquema…</div>}
        {error && <div className="px-1 text-sm text-red-600">{error}</div>}

        {effective && (
          <div className="space-y-1">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              {tables.length} objetos
            </p>
            {tables.map((table) => (
              <TableRow key={`${table.schema}.${table.name}`} table={table} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TableRow({ table }: { table: TableInfo }): JSX.Element {
  const isView = table.type !== 'BASE TABLE';
  const Icon = isView ? Eye : Table2;

  return (
    <details className="group rounded-lg border border-stone-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-stone-50">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            isView ? 'bg-stone-100 text-stone-500' : 'bg-orange-50 text-orange-600'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-stone-800">{table.name}</span>
          <span className="block text-[10px] text-stone-400">
            {isView ? 'Vista' : 'Tabla'} · {table.columns.length} col.
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-stone-100 px-3 py-2">
        {table.columns.length === 0 ? (
          <p className="text-xs text-stone-400">Sin columnas visibles.</p>
        ) : (
          <ul className="space-y-0.5">
            {table.columns.map((col) => (
              <li key={col.column_name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono text-stone-700">{col.column_name}</span>
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">
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
