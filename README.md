# ImpactDB-MCP

Analizador de **linaje de datos e impacto de cambios** para bases de datos PostgreSQL. Conecta tu base de datos, pregunta en lenguaje natural y descubre qué se rompería antes de aplicar un cambio, visualizándolo en un grafo interactivo.

**Demo en producción:** <https://miguelcalzada.com/impactdb>

Este proyecto se sirve como subruta de [miguelcalzada.com](https://miguelcalzada.com) mediante un `rewrite` de Next.js. La app define `basePath: "/impactdb"` (ver [`next.config.js`](./next.config.js)) para que sus rutas y assets funcionen bajo esa URL.

---

## Características

- **Chat con IA** (Groq) — pregunta en lenguaje natural qué impacto tendría un cambio en tu base de datos.
- **Análisis de impacto** — predice qué vistas, funciones y claves foráneas se romperían al ejecutar un `ALTER` / `DROP` / `RENAME`.
- **Grafo de dependencias interactivo** — visualiza las relaciones y los objetos afectados (arrastra, haz zoom, explora).
- **Visualizador de esquema** — explora tablas, columnas, vistas y funciones con búsqueda.
- **Base de datos propia (JSON)** — analiza cualquier esquema sin conectarte a nada: exporta el tuyo o sube un JSON.
- **Herramientas MCP** — 4 herramientas del estándar Model Context Protocol, listas para conectar agentes externos (Claude Desktop, Cursor, etc.).

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Framer Motion, React Flow, Lucide React |
| Backend / MCP | Node.js, TypeScript, Express, `@modelcontextprotocol/sdk`, `pg`, `@supabase/supabase-js` |
| IA | Groq (`gpt-oss` / `llama`) con *function calling* |
| Base de datos | Supabase (PostgreSQL) |
| Despliegue | Railway |

---

## Arquitectura

```
Cliente (React)
   │
   ├─ /api/chat      → chat con IA + herramientas MCP (Groq)
   ├─ /api/analyze   → análisis de impacto / linaje
   ├─ /api/schema-graph → grafo del esquema
   └─ /api/mcp       → proxy HTTP/SSE al servidor MCP

Motor de análisis (schema-analyzer.ts)
   ├─ PostgresProvider (information_schema / pg_catalog)
   └─ JsonSchemaProvider (esquema cargado desde JSON)
```

El análisis de impacto y linaje está desacoplado de la fuente de datos: puede leer de una base PostgreSQL real **o** de un esquema JSON en memoria.

---

## Configuración

Copia `.env.example` a `.env.local` (o configura las variables en Railway):

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase |
| `DATABASE_URL` | Connection string de PostgreSQL (usa el pooler de Supabase) |
| `GROQ_API_KEY` | Clave gratuita de [Groq](https://console.groq.com/keys) |
| `GROQ_MODEL` | Modelo de Groq (por defecto `openai/gpt-oss-120b`) |
| `MCP_SERVER_SECRET_TOKEN` | Token para el servidor MCP |
| `MCP_SERVER_URL` | URL del servidor MCP (si se despliega aparte) |
| `PORT` | Puerto del servidor |

---

## Instalación local

```bash
npm install
cp .env.example .env.local   # rellena tus credenciales
npm run dev                   # app en http://localhost:3000
```

Para el servidor MCP como proceso independiente:

```bash
npm run mcp:server
```

---

## Despliegue en Railway

1. Sube el repositorio a GitHub.
2. En Railway: **New Project → Deploy from GitHub repo** y selecciona el repo.
3. Añade las variables de entorno de la tabla anterior.
4. Railway detecta `package.json` y ejecuta `npm run build && npm run start`.
5. (Opcional) despliega el servidor MCP como servicio aparte con `npm run mcp:server` y apunta `MCP_SERVER_URL`.

> La app usa `basePath: "/impactdb"`, por lo que en Railway vive en `/impactdb`. `/` redirige a la URL canónica `https://miguelcalzada.com/impactdb`.

---

## Herramientas MCP

| Herramienta | Descripción |
|-------------|-------------|
| `get_schema_metadata` | Devuelve tablas, columnas, claves, vistas y rutinas. |
| `trace_column_lineage` | Devuelve qué objetos dependen de una tabla/columna. |
| `predict_breaking_changes` | Analiza un DDL y predice qué se rompe (riesgo alto/medio/bajo). |
| `generate_graph_definition` | Genera nodos y aristas para el grafo de dependencias. |

---

## Analizar tu propia base de datos

En la pestaña **Base de datos** puedes:

1. **Exportar (JSON)** — descarga el esquema actual de la base conectada.
2. **Cargar (JSON)** — sube un esquema propio para analizarlo sin conexión.

El JSON debe seguir la estructura `{ tables, views, routines, foreignKeys, primaryKeys }`. Consulta el botón **"¿Cómo consigo el JSON de mi base de datos?"** dentro de la app para ver un ejemplo completo.

---

## Estructura del proyecto

```
src/
├── app/
│   ├── api/analyze/route.ts        # orquestador de análisis
│   ├── api/chat/route.ts           # chat con IA (Groq + tools)
│   ├── api/schema-graph/route.ts   # grafo del esquema
│   ├── api/mcp/[...mcp]/route.ts   # proxy MCP (SSE)
│   ├── layout.tsx / page.tsx       # UI principal
│   └── globals.css
├── components/                     # header, chat, grafo, explorador, tabs...
├── mcp/
│   ├── server.ts                   # servidor MCP (Express + SSE)
│   ├── tools/                      # las 4 herramientas MCP
│   └── utils/
│       ├── postgres-inspector.ts   # lectura de PostgreSQL
│       └── schema-analyzer.ts      # motor de análisis en memoria
├── lib/                            # supabase, spotlight hook
└── supabase/seed.sql               # esquema de prueba (>8 tablas, FKs, vistas, funciones)
```

---

## Licencia

MIT
