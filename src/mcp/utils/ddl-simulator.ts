import { Pool, type PoolClient } from 'pg';
import { parseDdlTarget } from '@/mcp/utils/schema-analyzer';

export interface DdlSimulation {
  attempted: boolean;
  ok: boolean;
  message: string;
  schemaUsed?: string;
}

const BLOCKED_PATTERNS: RegExp[] = [
  /\bconcurrently\b/i,
  /\bvacuum\b/i,
  /\balter\s+system\b/i,
  /\bcreate\s+database\b/i,
  /\bdrop\s+database\b/i,
  /\bcommit\b/i,
  /\brollback\b/i,
  /\bbegin\b/i,
  /\bsavepoint\b/i,
  /\bend\b/i,
];

const PREFERRED_SCHEMAS = ['empresa', 'tienda', 'concesionario', 'public'];
const MAX_DDL_LENGTH = 4000;

let pool: Pool | null = null;
let poolConnectionString: string | null = null;

export function isSimulationEnabled(): boolean {
  if (process.env.DISABLE_DDL_SIMULATION === 'true') return false;
  return Boolean(process.env.SANDBOX_DATABASE_URL || process.env.DATABASE_URL);
}

function getPool(connectionString: string): Pool {
  if (pool && poolConnectionString === connectionString) return pool;

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : undefined,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
  });
  poolConnectionString = connectionString;
  return pool;
}

function checkStatement(ddl: string): { ok: boolean; message: string } {
  const trimmed = ddl.trim();
  if (!trimmed) return { ok: false, message: 'Sentencia vacía.' };
  if (trimmed.length > MAX_DDL_LENGTH) return { ok: false, message: 'Sentencia demasiado larga.' };
  if (!/^(alter|drop|create|truncate|comment)\b/i.test(trimmed)) {
    return { ok: false, message: 'Solo se permiten sentencias DDL (ALTER/DROP/CREATE/TRUNCATE/COMMENT).' };
  }
  const body = trimmed.replace(/;\s*$/, '');
  if (body.includes(';')) return { ok: false, message: 'Solo se permite una sentencia.' };
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(body)) {
      return { ok: false, message: 'La sentencia contiene una operación no reversible y ha sido bloqueada.' };
    }
  }
  return { ok: true, message: '' };
}

async function resolveSchema(
  db: PoolClient,
  tableName: string,
  preferredSchema?: string
): Promise<string | undefined> {
  const schemas = preferredSchema
    ? [preferredSchema, ...PREFERRED_SCHEMAS.filter((s) => s !== preferredSchema)]
    : PREFERRED_SCHEMAS;
  try {
    const result = await db.query<{ table_schema: string }>(
      `SELECT table_schema
         FROM information_schema.tables
        WHERE lower(table_name) = lower($1)
          AND table_schema = ANY($2::text[])
        ORDER BY array_position($2::text[], table_schema)
        LIMIT 1`,
      [tableName, schemas]
    );
    return result.rows[0]?.table_schema;
  } catch {
    return undefined;
  }
}

export async function simulateDdl(ddl: string, preferredSchema?: string): Promise<DdlSimulation> {
  if (!isSimulationEnabled()) {
    return { attempted: false, ok: false, message: 'La simulación está desactivada.' };
  }

  const guard = checkStatement(ddl);
  if (!guard.ok) {
    return { attempted: false, ok: false, message: guard.message };
  }

  const connectionString = process.env.SANDBOX_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    return { attempted: false, ok: false, message: 'No hay conexión configurada para la simulación.' };
  }

  let db: PoolClient | null = null;
  try {
    db = await getPool(connectionString).connect();

    await db.query('BEGIN');

    const first = await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const second = await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    if (String(first.rows[0]?.pid) !== String(second.rows[0]?.pid)) {
      await db.query('ROLLBACK');
      return {
        attempted: false,
        ok: false,
        message: 'La conexión no es transaccional (pooler en modo transacción); no se garantiza el ROLLBACK.',
      };
    }

    await db.query("SET LOCAL statement_timeout = '8s'");
    await db.query("SET LOCAL lock_timeout = '3s'");

    const parsed = parseDdlTarget(ddl);
    const schemaUsed = parsed?.tableName
      ? await resolveSchema(db, parsed.tableName, preferredSchema)
      : undefined;
    if (schemaUsed) {
      await db.query('SELECT set_config($1, $2, true)', ['search_path', `${schemaUsed}, public`]);
    }

    try {
      await db.query(ddl);
      await db.query('ROLLBACK');
      return {
        attempted: true,
        ok: true,
        message: 'El cambio se aplica sin errores en la base de datos (revertido).',
        schemaUsed,
      };
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      return {
        attempted: true,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        schemaUsed,
      };
    }
  } catch (error) {
    if (db) {
      await db.query('ROLLBACK').catch(() => undefined);
    }
    return {
      attempted: false,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db?.release();
  }
}
