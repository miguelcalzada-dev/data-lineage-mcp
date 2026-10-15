import { Pool, PoolClient } from 'pg';
import { traceLineage, predictImpact } from '@/mcp/utils/schema-analyzer';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL environment variable');
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
}

export interface ColumnInfo {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  ordinal_position: number;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: 'BASE TABLE' | 'VIEW' | 'MATERIALIZED VIEW';
  columns: ColumnInfo[];
}

export interface ForeignKey {
  constraint_name: string;
  source_schema: string;
  source_table: string;
  source_column: string;
  target_schema: string;
  target_table: string;
  target_column: string;
}

export interface PrimaryKey {
  constraint_name: string;
  schema: string;
  table: string;
  columns: string[];
}

export interface ViewInfo {
  schema: string;
  name: string;
  definition: string | null;
}

export interface RoutineInfo {
  schema: string;
  name: string;
  type: string;
  return_type: string | null;
  language: string | null;
  definition: string | null;
}

export interface SchemaMetadata {
  tables: TableInfo[];
  views: ViewInfo[];
  routines: RoutineInfo[];
  foreignKeys: ForeignKey[];
  primaryKeys: PrimaryKey[];
}

export interface LineageNode {
  schema: string;
  table: string;
  column: string;
  kind: 'table' | 'view' | 'routine' | 'foreign_key';
  relation?: string;
}

export interface AffectedObject {
  type: 'column' | 'table' | 'view' | 'foreign_key' | 'routine';
  schema: string;
  name: string;
  detail: string;
}

export interface DdlImpact {
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
  affectedObjects: AffectedObject[];
  notFound?: boolean;
  target?: {
    schema: string;
    table: string;
    column: string;
  };
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function query<T>(client: PoolClient, sql: string, params?: unknown[]): Promise<T[]> {
  const result = await client.query(sql, params as any[]);
  return result.rows as T[];
}

export async function getColumns(
  client: PoolClient,
  tableSchema: string,
  tableName: string
): Promise<ColumnInfo[]> {
  const sql = `
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.ordinal_position
    FROM information_schema.columns c
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position;
  `;
  return query<ColumnInfo>(client, sql, [tableSchema, tableName]);
}

export async function getTables(client: PoolClient): Promise<TableInfo[]> {
  const sql = `
    SELECT
      t.table_schema AS schema,
      t.table_name AS name,
      t.table_type AS type
    FROM information_schema.tables t
    WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions')
    ORDER BY t.table_schema, t.table_name;
  `;
  const rows = await query<{
    schema: string;
    name: string;
    type: 'BASE TABLE' | 'VIEW' | 'MATERIALIZED VIEW';
  }>(client, sql);

  const tables: TableInfo[] = [];
  for (const row of rows) {
    const columns = await getColumns(client, row.schema, row.name);
    tables.push({ ...row, columns });
  }
  return tables;
}

export async function getForeignKeys(client: PoolClient): Promise<ForeignKey[]> {
  const sql = `
    SELECT
      tc.constraint_name,
      tc.table_schema AS source_schema,
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_schema AS target_schema,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions');
  `;
  return query<ForeignKey>(client, sql);
}

export async function getPrimaryKeys(client: PoolClient): Promise<PrimaryKey[]> {
  const sql = `
    SELECT
      tc.table_schema AS schema,
      tc.table_name AS table,
      tc.constraint_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions')
    ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;
  `;
  const rows = await query<{
    schema: string;
    table: string;
    constraint_name: string;
    column_name: string;
  }>(client, sql);

  const grouped = new Map<string, PrimaryKey>();
  for (const row of rows) {
    const key = `${row.schema}.${row.table}.${row.constraint_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        constraint_name: row.constraint_name,
        schema: row.schema,
        table: row.table,
        columns: [],
      });
    }
    grouped.get(key)!.columns.push(row.column_name);
  }
  return Array.from(grouped.values());
}

export async function getViews(client: PoolClient): Promise<ViewInfo[]> {
  const sql = `
    SELECT
      table_schema AS schema,
      table_name AS name,
      view_definition AS definition
    FROM information_schema.views
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions')
    ORDER BY table_schema, table_name;
  `;
  return query<ViewInfo>(client, sql);
}

export async function getRoutines(client: PoolClient): Promise<RoutineInfo[]> {
  const sql = `
    SELECT
      r.routine_schema AS schema,
      r.routine_name AS name,
      r.routine_type AS type,
      r.data_type AS return_type,
      r.external_language AS language,
      p.prosrc AS definition
    FROM information_schema.routines r
    LEFT JOIN pg_catalog.pg_proc p
      ON p.proname = r.routine_name
    LEFT JOIN pg_catalog.pg_namespace n
      ON n.oid = p.pronamespace AND n.nspname = r.routine_schema
    WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions')
    ORDER BY r.routine_schema, r.routine_name;
  `;
  return query<RoutineInfo>(client, sql);
}

export async function getFullSchema(): Promise<SchemaMetadata> {
  return withClient(async (client) => {
    const [tables, views, routines, foreignKeys, primaryKeys] = await Promise.all([
      getTables(client),
      getViews(client),
      getRoutines(client),
      getForeignKeys(client),
      getPrimaryKeys(client),
    ]);

    return { tables, views, routines, foreignKeys, primaryKeys };
  });
}

export async function traceColumnLineage(
  tableName: string,
  columnName: string,
  schemaName = 'public',
  override?: SchemaMetadata
): Promise<LineageNode[]> {
  const schema = override ?? (await getFullSchema());
  return traceLineage(schema, tableName, columnName, schemaName);
}

export async function predictBreakingChanges(
  ddlStatement: string,
  override?: SchemaMetadata
): Promise<DdlImpact> {
  const schema = override ?? (await getFullSchema());
  return predictImpact(schema, ddlStatement);
}
