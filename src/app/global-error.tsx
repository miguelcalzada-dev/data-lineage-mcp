'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <html lang="es">
      <body>
        <div style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.125rem' }}>Algo fue mal</h1>
          <p style={{ color: '#78716c' }}>La aplicación encontró un error inesperado.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: '1px solid #e7e5e4',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
