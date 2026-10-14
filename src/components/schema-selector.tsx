'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AnalyzeResponse } from '@/app/api/analyze/route';
import type { SchemaMetadata, TableInfo, ColumnInfo } from '@/mcp/utils/postgres-inspector';

export interface SchemaSelectorProps {
  onSelect: (table: string, column: string) => void;
}

export function SchemaSelector({ onSelect }: SchemaSelectorProps): JSX.Element {
  const [schema, setSchema] = useState<SchemaMetadata | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSchema(): Promise<void> {
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeSchema: true }),
        });
        const data = (await response.json()) as AnalyzeResponse & { error?: string };
        if (!cancelled) {
          if (data.error) {
            setError(data.error);
          } else if (data.schema) {
            setSchema(data.schema as SchemaMetadata);
          }
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
  }, []);

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
    return <div className="text-sm text-slate-500">Loading schema…</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Table</label>
        <select
          value={selectedTableId}
          onChange={(e) => handleTableChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        >
          <option value="">Select a table</option>
          {schema?.tables.map((table) => (
            <option key={`${table.schema}.${table.name}`} value={`${table.schema}.${table.name}`}>
              {table.schema}.{table.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Column</label>
        <select
          value={selectedColumn}
          onChange={(e) => setSelectedColumn(e.target.value)}
          disabled={!selectedTable}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        >
          <option value="">Select a column</option>
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
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        <ChevronRight className="h-4 w-4" />
        Trace Lineage
      </button>
    </div>
  );
}
