'use client';

export function Spinner({ className = '' }: { className?: string }): JSX.Element {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-orange-600 dark:border-night-700 ${className}`}
      aria-hidden
    />
  );
}
