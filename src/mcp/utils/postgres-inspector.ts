import { Pool, PoolClient } from 'pg';
import { traceLineage, predictImpact } from '@/mcp/utils/schema-analyzer';
import { SCHEMA_CONTRACT_VERSION } from '@/mcp/utils/schema-contract';

export { SCHEMA_CONTRACT_VERSION };

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'auth', 'storage', 'extensions'];
const SCHEMA_CACHE_TTL_MS = Number(process.env.SCHEMA_CACHE_TTL_MS ?? 30000);
const STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 10000);

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
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS,
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
  on_delete?: string | null;
  on_update?: string | null;
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

export interface IndexInfo {
  schema: string;
  table: string;
  name: string;
  columns: string[];
  is_unique: boolean;
  is_primary: boolean;
}

export interface SchemaMetadata {
  version?: number;
  tables: TableInfo[];
  views: ViewInfo[];
  routines: RoutineInfo[];
  foreignKeys: ForeignKey[];
  primaryKeys: PrimaryKey[];
  indexes?: IndexInfo[];
}

export interface LineageNode {
  schema: string;
  table: string;
  column: string;
  kind: 'table' | 'view' | 'routine' | 'foreign_key';
  relation?: string;
  via?: string;
  depth?: number;
}

export interface AffectedObject {
  type: 'column' | 'table' | 'view' | 'foreign_key' | 'routine' | 'index' | 'constraint';
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
  simulation?: {
    attempted: boolean;
    ok: boolean;
    message: string;
    schemaUsed?: string;
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

function systemSchemaList(): string {
  return SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(', ');
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

export async function getTables(client: PoolClient, targetSchema?: string): Promise<TableInfo[]> {
  const sql = `
    SELECT
      t.table_schema AS schema,
      t.table_name AS name,
      t.table_type AS type
    FROM information_schema.tables t
    WHERE t.table_schema NOT IN (${systemSchemaList()})
      ${targetSchema ? 'AND t.table_schema = $1' : ''}
    ORDER BY t.table_schema, t.table_name;
  `;
  const rows = await query<{
    schema: string;
    name: string;
    type: 'BASE TABLE' | 'VIEW' | 'MATERIALIZED VIEW';
  }>(client, sql, targetSchema ? [targetSchema] : []);

  const tables: TableInfo[] = [];
  for (const row of rows) {
    const columns = await getColumns(client, row.schema, row.name);
    tables.push({ ...row, columns });
  }
  return tables;
}

export async function getForeignKeys(client: PoolClient, targetSchema?: string): Promise<ForeignKey[]> {
  const sql = `
    SELECT
      tc.constraint_name,
      tc.table_schema AS source_schema,
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_schema AS target_schema,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column,
      rc.delete_rule AS on_delete,
      rc.update_rule AS on_update
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.constraint_schema = ccu.constraint_schema
    LEFT JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = tc.constraint_schema
      AND rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema NOT IN (${systemSchemaList()})
      ${targetSchema ? 'AND tc.table_schema = $1' : ''};
  `;
  return query<ForeignKey>(client, sql, targetSchema ? [targetSchema] : []);
}

export async function getPrimaryKeys(client: PoolClient, targetSchema?: string): Promise<PrimaryKey[]> {
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
      AND tc.table_schema NOT IN (${systemSchemaList()})
      ${targetSchema ? 'AND tc.table_schema = $1' : ''}
    ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;
  `;
  const rows = await query<{
    schema: string;
    table: string;
    constraint_name: string;
    column_name: string;
  }>(client, sql, targetSchema ? [targetSchema] : []);

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

export async function getViews(client: PoolClient, targetSchema?: string): Promise<ViewInfo[]> {
  const sql = `
    SELECT
      table_schema AS schema,
      table_name AS name,
      view_definition AS definition
    FROM information_schema.views
    WHERE table_schema NOT IN (${systemSchemaList()})
      ${targetSchema ? 'AND table_schema = $1' : ''}
    ORDER BY table_schema, table_name;
  `;
  return query<ViewInfo>(client, sql, targetSchema ? [targetSchema] : []);
}

export async function getRoutines(client: PoolClient, targetSchema?: string): Promise<RoutineInfo[]> {
  const sql = `
    SELECT
      r.routine_schema AS schema,
      r.routine_name AS name,
      r.routine_type AS type,
      r.data_type AS return_type,
      r.external_language AS language,
      p.prosrc AS definition
    FROM information_schema.routines r
    LEFT JOIN pg_catalog.pg_namespace n
      ON n.nspname = r.routine_schema
    LEFT JOIN pg_catalog.pg_proc p
      ON p.proname = r.routine_name AND p.pronamespace = n.oid
    WHERE r.routine_schema NOT IN (${systemSchemaList()})
      ${targetSchema ? 'AND r.routine_schema = $1' : ''}
    ORDER BY r.routine_schema, r.routine_name;
  `;
  return query<RoutineInfo>(client, sql, targetSchema ? [targetSchema] : []);
}

export async function getIndexes(client: PoolClient, targetSchema?: string): Promise<IndexInfo[]> {
  const sql = `
    SELECT
      n.nspname AS schema,
      t.relname AS table,
      i.relname AS name,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary,
      array_agg(a.attname) AS columns
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE n.nspname NOT IN (${systemSchemaList()})
      ${targetSchema ? 'AND n.nspname = $1' : ''}
    GROUP BY n.nspname, t.relname, i.relname, ix.indisunique, ix.indisprimary
    ORDER BY n.nspname, t.relname, i.relname;
  `;
  return query<IndexInfo>(client, sql, targetSchema ? [targetSchema] : []);
}

async function loadFullSchema(targetSchema?: string): Promise<SchemaMetadata> {
  return withClient(async (client) => {
    const [tables, views, routines, foreignKeys, primaryKeys, indexes] = await Promise.all([
      getTables(client, targetSchema),
      getViews(client, targetSchema),
      getRoutines(client, targetSchema),
      getForeignKeys(client, targetSchema),
      getPrimaryKeys(client, targetSchema),
      getIndexes(client, targetSchema),
    ]);

    return {
      version: SCHEMA_CONTRACT_VERSION,
      tables,
      views,
      routines,
      foreignKeys,
      primaryKeys,
      indexes,
    };
  });
}

const schemaCache = new Map<string, { at: number; schema: SchemaMetadata }>();

export function invalidateSchemaCache(): void {
  schemaCache.clear();
}

export async function getFullSchema(targetSchema?: string): Promise<SchemaMetadata> {
  const key = targetSchema ?? '*';
  const cached = schemaCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < SCHEMA_CACHE_TTL_MS) {
    return cached.schema;
  }

  const schema = await loadFullSchema(targetSchema);
  schemaCache.set(key, { at: now, schema });
  return schema;
}

export async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await withClient(async (client) => {
      await client.query('SELECT 1');
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function traceColumnLineage(
  tableName: string,
  columnName: string,
  schemaName = 'public',
  override?: SchemaMetadata,
  targetSchema?: string
): Promise<LineageNode[]> {
  const schema = override ?? (await getFullSchema(targetSchema));
  return traceLineage(schema, tableName, columnName, schemaName);
}

export async function predictBreakingChanges(
  ddlStatement: string,
  override?: SchemaMetadata,
  targetSchema?: string
): Promise<DdlImpact> {
  const schema = override ?? (await getFullSchema(targetSchema));
  return predictImpact(schema, ddlStatement);
}
