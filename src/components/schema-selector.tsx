'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AnalyzeResponse } from '@/app/api/analyze/route';
import type { SchemaMetadata } from '@/mcp/utils/postgres-inspector';
import { apiPath } from '@/lib/api';

export interface SchemaSelectorProps {
  onSelect: (table: string, column: string) => void;
  schema?: SchemaMetadata | null;
}

export function SchemaSelector({ onSelect, schema: externalSchema = null }: SchemaSelectorProps): JSX.Element {
  const [schema, setSchema] = useState<SchemaMetadata | null>(externalSchema);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(!externalSchema);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (externalSchema) {
      setSchema(externalSchema);
      setLoading(false);
      setSelectedTableId('');
      setSelectedColumn('');
      return;
    }

    let cancelled = false;

    async function loadSchema(): Promise<void> {
      setLoading(true);
      try {
        const response = await fetch(apiPath('/api/analyze'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeSchema: true }),
        });
        const data = (await response.json()) as AnalyzeResponse & { error?: string };
        if (!cancelled) {
          if (data.error) setError(data.error);
          else if (data.schema) setSchema(data.schema);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSchema();
    return () => {
      cancelled = true;
    };
  }, [externalSchema]);

  const selectedTable = schema?.tables.find((t) => `${t.schema}.${t.name}` === selectedTableId);

  const handleTableChange = useCallback((value: string): void => {
    setSelectedTableId(value);
    setSelectedColumn('');
  }, []);

  const handleTrace = useCallback((): void => {
    if (!selectedTable || !selectedColumn) return;
    onSelect(selectedTable.name, selectedColumn);
  }, [onSelect, selectedTable, selectedColumn]);

  if (loading) {
    return <div className="text-sm text-stone-500">Cargando esquema…</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-stone-700 dark:text-night-300">Tabla</label>
        <select
          value={selectedTableId}
          onChange={(e) => handleTableChange(e.target.value)}
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-night-700 dark:bg-night-800 dark:text-night-100"
        >
          <option value="">Selecciona una tabla</option>
          {schema?.tables.map((table) => (
            <option key={`${table.schema}.${table.name}`} value={`${table.schema}.${table.name}`}>
              {table.schema}.{table.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-700 dark:text-night-300">Columna</label>
        <select
          value={selectedColumn}
          onChange={(e) => setSelectedColumn(e.target.value)}
          disabled={!selectedTable}
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 disabled:bg-stone-50 disabled:text-stone-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-night-700 dark:bg-night-800 dark:text-night-100 dark:disabled:bg-night-900"
        >
          <option value="">Selecciona una columna</option>
          {selectedTable?.columns.map((column) => (
            <option key={column.column_name} value={column.column_name}>
              {column.column_name} ({column.data_type})
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleTrace}
        disabled={!selectedTable || !selectedColumn}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400 dark:border-night-700 dark:bg-night-800 dark:text-night-200 dark:hover:bg-night-700"
      >
        <ChevronRight className="h-4 w-4" />
        Ver dependencias
      </button>
    </div>
  );
}
