import { Pool, type PoolClient, type QueryResultRow } from 'pg';

// Cached on globalThis so dev-server hot reloads reuse one pool instead of
// opening a new set of connections on every edit.
const globalForDb = globalThis as typeof globalThis & { pgPool?: Pool };

// The database is shared with other apps, so all of TalkNinja's tables live
// in their own schema. Every connection uses only this schema, so unqualified
// table names never reach another app's tables in public.
export const DB_SCHEMA = 'talkninja';

// DATABASE_URL is a standard Postgres connection string; hosted providers
// that require TLS take `?sslmode=require` on the end of it.
function getPool(): Pool {
  if (!globalForDb.pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    globalForDb.pgPool = new Pool({ connectionString, options: `-c search_path=${DB_SCHEMA}` });
  }
  return globalForDb.pgPool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<Row[]> {
  const result = await getPool().query<Row>(sql, params);
  return result.rows;
}

// Runs `fn` inside a transaction on a single connection, rolling back if it throws.
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Postgres SQLSTATE for a unique constraint violation.
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}
