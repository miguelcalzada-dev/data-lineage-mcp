import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ImpactDB-MCP',
  description: 'Analizador de linaje de datos e impacto de cambios para PostgreSQL con MCP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-[#F4F0E8] via-[#ECE7DC] to-[#E3DDD0] font-sans antialiased text-ink">
        {children}
      </body>
    </html>
  );
}
