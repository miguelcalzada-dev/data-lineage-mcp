'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-white px-6 text-center dark:bg-night-900">
      <h1 className="text-lg font-semibold text-stone-900 dark:text-night-100">Algo fue mal</h1>
      <p className="max-w-md text-sm text-stone-500 dark:text-night-400">
        No se pudo mostrar esta vista. Puedes reintentar; si el problema persiste, recarga la página.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-night-700 dark:bg-night-800 dark:text-night-200 dark:hover:bg-night-700"
      >
        Reintentar
      </button>
    </div>
  );
}
