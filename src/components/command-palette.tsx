'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { SchemaMetadata } from '@/mcp/utils/postgres-inspector';

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  schema?: SchemaMetadata | null;
  onTraceLineage?: (table: string, column: string) => void;
}

interface Item {
  key: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  actions,
  schema = null,
  onTraceLineage,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = actions.map((action) => ({
      key: action.id,
      label: action.label,
      hint: action.hint ?? 'Acción',
      run: action.run,
    }));

    if (schema && onTraceLineage) {
      for (const table of schema.tables) {
        for (const column of table.columns) {
          list.push({
            key: `lineage:${table.schema}.${table.name}.${column.column_name}`,
            label: `${table.name}.${column.column_name}`,
            hint: 'Ver linaje',
            run: () => onTraceLineage(table.name, column.column_name),
          });
        }
      }
    }

    return list;
  }, [actions, schema, onTraceLineage]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const base = term
      ? items.filter(
          (item) =>
            item.label.toLowerCase().includes(term) || item.hint.toLowerCase().includes(term)
        )
      : items;
    return base.slice(0, 50);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function select(index: number): void {
    const item = filtered[index];
    if (!item) return;
    item.run();
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(active);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/30 p-4 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-night-700 dark:bg-night-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 dark:border-night-700">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Busca una acción, tabla o columna…"
            className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none dark:text-night-100 dark:placeholder:text-night-500"
          />
          <kbd className="rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-400 dark:border-night-700">
            Esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-stone-400">Sin resultados</p>
          ) : (
            filtered.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => select(index)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  index === active
                    ? 'bg-orange-50 text-stone-900 dark:bg-orange-500/10 dark:text-night-100'
                    : 'text-stone-600 dark:text-night-300'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 text-[11px] text-stone-400">{item.hint}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
