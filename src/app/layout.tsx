import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Data Lineage & Impact Analyzer',
  description: 'Predict breaking changes and visualize PostgreSQL data lineage with MCP.',
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
