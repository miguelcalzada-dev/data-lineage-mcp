import { Play } from 'lucide-react';

export interface MigrationEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export function MigrationEditor({
  value,
  onChange,
  onSubmit,
  loading = false,
}: MigrationEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <label htmlFor="ddl-editor" className="block text-sm font-medium text-stone-700">
        Sentencia DDL
      </label>
      <textarea
        id="ddl-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ALTER TABLE orders DROP COLUMN customer_id;"
        spellCheck={false}
        className="h-40 w-full resize-none rounded-md border border-stone-200 bg-stone-50 p-3 font-mono text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-400"
      />
      <p className="text-xs leading-relaxed text-stone-500">
        Escribe aquí un cambio que quieras hacer en la base de datos. La herramienta
        analizará qué tablas, vistas o funciones se romperían.
      </p>
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        <Play className="h-4 w-4" />
        {loading ? 'Simulando…' : 'Simular impacto'}
      </button>
    </div>
  );
}
