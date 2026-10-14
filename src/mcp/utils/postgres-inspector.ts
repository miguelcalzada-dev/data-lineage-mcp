import { Pool, PoolClient, QueryResult } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL environment variable');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
});

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

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function query<T>(client: PoolClient, sql: string, params?: unknown[]): Promise<T[]> {
  const result: QueryResult<T> = await client.query(sql, params);
  return result.rows;
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
  const rows = await query<{ schema: string; name: string; type: 'BASE TABLE' | 'VIEW' | 'MATERIALIZED VIEW' }>(client, sql);

  const tables: TableInfo[] = [];
  for (const row of rows) {
    const columns = await getColumns(client, row.schema, row.name);
    tables.push({ ...row, columns });
  }
  return tables;
}

export async function getColumns(client: PoolClient, tableSchema: string, tableName: string): Promise<ColumnInfo[]> {
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
  const rows = await query<{ schema: string; table: string; constraint_name: string; column_name: string }>(client, sql);

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

    return {
      tables,
      views,
      routines,
      foreignKeys,
      primaryKeys,
    };
  });
}

export interface LineageNode {
  schema: string;
  table: string;
  column: string;
  kind: 'table' | 'view' | 'routine' | 'foreign_key';
  relation?: string;
}

export async function getChildForeignKeys(
  client: PoolClient,
  tableSchema: string,
  tableName: string,
  columnName: string
): Promise<LineageNode[]> {
  const sql = `
    SELECT
      tc.table_schema AS schema,
      tc.table_name AS table,
      kcu.column_name AS column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = $1
      AND ccu.table_name = $2
      AND ccu.column_name = $3
    ORDER BY tc.table_schema, tc.table_name;
  `;
  const rows = await query<{ schema: string; table: string; column: string }>(client, sql, [
    tableSchema,
    tableName,
    columnName,
  ]);
  return rows.map((row) => ({
    schema: row.schema,
    table: row.table,
    column: row.column,
    kind: 'foreign_key' as const,
    relation: 'child_foreign_key',
  }));
}

export async function getDependentViews(
  client: PoolClient,
  tableSchema: string,
  tableName: string,
  columnName: string
): Promise<LineageNode[]> {
  const sql = `
    SELECT
      table_schema AS schema,
      table_name AS name,
      view_definition AS definition
    FROM information_schema.views
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions')
      AND view_definition ILIKE '%' || $1 || '%'
      AND view_definition ILIKE '%' || $2 || '%';
  `;
  const rows = await query<{ schema: string; name: string }>(client, sql, [tableName, columnName]);
  return rows.map((row) => ({
    schema: row.schema,
    table: row.name,
    column: '*',
    kind: 'view' as const,
    relation: 'dependent_view',
  }));
}

export async function getDependentRoutines(
  client: PoolClient,
  tableSchema: string,
  tableName: string,
  columnName: string
): Promise<LineageNode[]> {
  const sql = `
    SELECT
      r.routine_schema AS schema,
      r.routine_name AS name
    FROM information_schema.routines r
    LEFT JOIN pg_catalog.pg_proc p
      ON p.proname = r.routine_name
    LEFT JOIN pg_catalog.pg_namespace n
      ON n.oid = p.pronamespace AND n.nspname = r.routine_schema
    WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions')
      AND p.prosrc ILIKE '%' || $1 || '%'
      AND p.prosrc ILIKE '%' || $2 || '%';
  `;
  const rows = await query<{ schema: string; name: string }>(client, sql, [tableName, columnName]);
  return rows.map((row) => ({
    schema: row.schema,
    table: row.name,
    column: '*',
    kind: 'routine' as const,
    relation: 'dependent_routine',
  }));
}

export async function traceColumnLineage(
  tableName: string,
  columnName: string,
  schema = 'public'
): Promise<LineageNode[]> {
  return withClient(async (client) => {
    const [childFks, dependentViews, dependentRoutines] = await Promise.all([
      getChildForeignKeys(client, schema, tableName, columnName),
      getDependentViews(client, schema, tableName, columnName),
      getDependentRoutines(client, schema, tableName, columnName),
    ]);

    return [
      {
        schema,
        table: tableName,
        column: columnName,
        kind: 'table',
        relation: 'origin',
      },
      ...childFks,
      ...dependentViews,
      ...dependentRoutines,
    ];
  });
}

export interface DdlImpact {
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
  affectedObjects: AffectedObject[];
}

export interface AffectedObject {
  type: 'column' | 'table' | 'view' | 'foreign_key' | 'routine';
  schema: string;
  name: string;
  detail: string;
}

export async function predictBreakingChanges(ddlStatement: string): Promise<DdlImpact> {
  return withClient(async (client) => {
    const normalized = ddlStatement.replace(/\s+/g, ' ').trim().toLowerCase();
    const affectedObjects: AffectedObject[] = [];

    const parsed = parseDdlTarget(normalized);
    if (!parsed) {
      return {
        risk: 'LOW',
        summary: 'Unable to parse DDL statement. No structural impact detected.',
        affectedObjects,
      };
    }

    const { action, tableName, columnName, newColumnName } = parsed;
    const schema = 'public';

    if (action === 'drop_column' || action === 'alter_column') {
      // Views depending on this column
      const dependentViews = await getDependentViews(client, schema, tableName, columnName);
      for (const view of dependentViews) {
        affectedObjects.push({
          type: 'view',
          schema: view.schema,
          name: view.table,
          detail: `View depends on ${tableName}.${columnName}`,
        });
      }

      // Foreign keys pointing to this column
      const childFks = await getChildForeignKeys(client, schema, tableName, columnName);
      for (const fk of childFks) {
        affectedObjects.push({
          type: 'foreign_key',
          schema: fk.schema,
          name: fk.table,
          detail: `Foreign key references ${tableName}.${columnName}`,
        });
      }

      // Routines depending on this column
      const dependentRoutines = await getDependentRoutines(client, schema, tableName, columnName);
      for (const routine of dependentRoutines) {
        affectedObjects.push({
          type: 'routine',
          schema: routine.schema,
          name: routine.table,
          detail: `Routine references ${tableName}.${columnName}`,
        });
      }
    }

    if (action === 'drop_table') {
      const fks = await getForeignKeys(client);
      for (const fk of fks) {
        if (fk.target_table.toLowerCase() === tableName.toLowerCase()) {
          affectedObjects.push({
            type: 'foreign_key',
            schema: fk.source_schema,
            name: fk.source_table,
            detail: `Foreign key references dropped table ${tableName}`,
          });
        }
      }

      const views = await getViews(client);
      for (const view of views) {
        if (view.definition?.toLowerCase().includes(tableName.toLowerCase())) {
          affectedObjects.push({
            type: 'view',
            schema: view.schema,
            name: view.name,
            detail: `View references dropped table ${tableName}`,
          });
        }
      }
    }

    if (action === 'rename_column') {
      const dependentViews = await getDependentViews(client, schema, tableName, columnName);
      for (const view of dependentViews) {
        affectedObjects.push({
          type: 'view',
          schema: view.schema,
          name: view.table,
          detail: `View references old column name ${tableName}.${columnName} (rename to ${newColumnName})`,
        });
      }

      const dependentRoutines = await getDependentRoutines(client, schema, tableName, columnName);
      for (const routine of dependentRoutines) {
        affectedObjects.push({
          type: 'routine',
          schema: routine.schema,
          name: routine.table,
          detail: `Routine references old column name ${tableName}.${columnName} (rename to ${newColumnName})`,
        });
      }
    }

    const risk: 'HIGH' | 'MEDIUM' | 'LOW' =
      affectedObjects.length > 3 ? 'HIGH' : affectedObjects.length > 0 ? 'MEDIUM' : 'LOW';

    return {
      risk,
      summary: `DDL "${action}" on ${tableName}${columnName ? `.${columnName}` : ''} affects ${affectedObjects.length} object(s).`,
      affectedObjects,
    };
  });
}

interface ParsedDdl {
  action: 'drop_column' | 'drop_table' | 'rename_column' | 'alter_column';
  tableName: string;
  columnName?: string;
  newColumnName?: string;
}

function parseDdlTarget(ddl: string): ParsedDdl | null {
  const dropColumnMatch = ddl.match(/alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+drop\s+(?:column\s+)?([a-z_][a-z0-9_]*)/i);
  if (dropColumnMatch) {
    return {
      action: 'drop_column',
      tableName: dropColumnMatch[2],
      columnName: dropColumnMatch[3],
    };
  }

  const dropTableMatch = ddl.match(/drop\s+table\s+(?:if\s+exists\s+)?(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)/i);
  if (dropTableMatch) {
    return {
      action: 'drop_table',
      tableName: dropTableMatch[2],
    };
  }

  const renameColumnMatch = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+rename\s+(?:column\s+)?([a-z_][a-z0-9_]*)\s+to\s+([a-z_][a-z0-9_]*)/i
  );
  if (renameColumnMatch) {
    return {
      action: 'rename_column',
      tableName: renameColumnMatch[2],
      columnName: renameColumnMatch[3],
      newColumnName: renameColumnMatch[4],
    };
  }

  const alterColumnMatch = ddl.match(/alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+(?:alter|modify)\s+(?:column\s+)?([a-z_][a-z0-9_]*)/i);
  if (alterColumnMatch) {
    return {
      action: 'alter_column',
      tableName: alterColumnMatch[2],
      columnName: alterColumnMatch[3],
    };
  }

  return null;
}
