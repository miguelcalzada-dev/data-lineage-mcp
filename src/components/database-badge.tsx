import { Database } from 'lucide-react';

export function DatabaseBadge({ label }: { label: string }): JSX.Element {
  return (
    <div
      role="status"
      aria-label={`Base de datos activa: ${label}`}
      title={`Las preguntas se harán sobre: ${label}`}
      className="flex min-w-0 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 select-none dark:border-night-700 dark:bg-night-800 dark:text-night-300"
    >
      <Database className="h-3.5 w-3.5 shrink-0 text-orange-500" />
      <span className="truncate">{label}</span>
    </div>
  );
}
