import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ImpactDB-MCP',
  description: 'Analizador de linaje de datos e impacto de cambios para PostgreSQL con MCP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans antialiased text-ink">
        {children}
      </body>
    </html>
  );
}
