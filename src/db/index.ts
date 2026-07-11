import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL || '';

// Disable prefetching to avoid issues with transaction poolers (like Supabase connection pooler)
// Cache the connection in development to prevent connection exhaustion during hot reloads.
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const poolMax = process.env.DATABASE_POOL_MAX
  ? parseInt(process.env.DATABASE_POOL_MAX, 10)
  : (process.env.NODE_ENV === 'production' ? 2 : 10);

const conn = globalForDb.conn ?? postgres(connectionString, { 
  prepare: false,
  max: poolMax,
});
if (process.env.NODE_ENV !== 'production') globalForDb.conn = conn;

export const db = drizzle(conn, { schema });

/**
 * Executes operations in a database transaction with app.current_company_id and app.current_environment set
 * to enforce Row Level Security (RLS) tenant and environment isolation.
 */
export async function withTenantContext<T>(
  companyId: string,
  modo: 'PRODUCCION' | 'PRUEBA',
  fn: (tx: any) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // Set the tenant and environment context locally in the transaction
    await tx.execute(sql`SELECT set_config('app.current_company_id', ${companyId}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_environment', ${modo}, true)`);
    return await fn(tx);
  });
}

export * from './schema';
export * from './db-helper';
