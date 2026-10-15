import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Analizador de Linaje e Impacto de Datos',
  description: 'Predice cambios que rompen la base de datos y visualiza el linaje de datos con MCP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
