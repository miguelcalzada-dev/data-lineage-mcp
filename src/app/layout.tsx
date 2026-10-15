import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ImpactDB-MCP',
  description: 'Analizador de linaje de datos e impacto de cambios para PostgreSQL con MCP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-[#EFE7D6] via-[#E8DCC6] to-[#DFCFB4] font-sans antialiased text-ink">
        {children}
      </body>
    </html>
  );
}
