# Data Lineage & Impact Analyzer

A production-ready monorepo for analyzing PostgreSQL data lineage and predicting breaking changes using the Model Context Protocol (MCP).

## Architecture

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Lucide React, React Flow.
- **Backend / MCP Server**: Node.js/TypeScript, Hono, `@modelcontextprotocol/sdk`, `@supabase/supabase-js`.
- **Database**: Supabase (PostgreSQL).
- **Deployment target**: Railway.

## Project Structure

```
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── supabase/
│   └── seed.sql
├── src/
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── mcp-client.ts
│   ├── mcp/
│   │   ├── server.ts
│   │   ├── tools/
│   │   │   ├── get-schema.ts
│   │   │   ├── trace-lineage.ts
│   │   │   ├── predict-impact.ts
│   │   │   └── generate-graph.ts
│   │   └── utils/
│   │       └── postgres-inspector.ts
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── analyze/route.ts
│   │       └── mcp/[...mcp]/route.ts
│   └── components/
│       ├── header.tsx
│       ├── schema-selector.tsx
│       ├── impact-graph.tsx
│       ├── mcp-live-inspector.tsx
│       ├── migration-editor.tsx
│       └── risk-badge.tsx
```

## Quick Start

### 1. Supabase Setup

1. Create a new Supabase project at https://supabase.com.
2. Go to **Project Settings > API** and copy:
   - `SUPABASE_URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role key` -> `SUPABASE_SERVICE_ROLE_KEY`
3. Go to **Project Settings > Database** and copy the **connection string** (use the session or pooled string) -> `DATABASE_URL`.
4. Open the **SQL Editor** and run the contents of `supabase/seed.sql`.
4. Ensure the service role key has permission to read `information_schema`, `pg_catalog`, and any application schemas.

### 2. Local Environment

```bash
cp .env.example .env.local
# Fill in your Supabase credentials, DATABASE_URL, MCP_SERVER_SECRET_TOKEN and MCP_SERVER_URL
```

Install dependencies and run:

```bash
npm install
npm run dev
```

### 3. Railway Deployment

1. Push the repository to GitHub.
2. Create a new Railway project and connect the repository.
3. Add the environment variables from `.env.example` in **Variables**.
4. Railway will use the root `package.json` scripts; `npm run build && npm run start` runs the Next.js app.
5. Deploy the MCP server as a separate Railway service using `npm run mcp:server`, then set `MCP_SERVER_URL` to that service URL so the Next.js `/api/mcp` proxy can reach it.

## MCP Tools Reference

| Tool                      | Description                                                                 |
|---------------------------|-----------------------------------------------------------------------------|
| `get_schema_metadata`     | Returns tables, columns, primary keys, foreign keys, views and routines.    |
| `trace_column_lineage`    | Traces dependencies for a given table/column (FKs, views, routines).        |
| `predict_breaking_changes`| Analyzes a DDL statement and reports broken FKs, views and risk level.      |
| `generate_graph_definition`| Converts lineage trees into nodes and edges for the frontend graph.        |

The MCP server is exposed at `/api/mcp` via HTTP/SSE and requires the `Authorization: Bearer <MCP_SERVER_SECRET_TOKEN>` header.
