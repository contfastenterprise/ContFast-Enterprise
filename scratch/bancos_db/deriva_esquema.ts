/**
 * Compara el esquema de Drizzle (src/db/schema) con una base: que tablas y
 * columnas pide la aplicacion y la base no tiene.
 *
 * Solo lectura. Contra la base desechable dice si las migraciones de
 * `drizzle/` reproducen el esquema; contra otra base (con su DATABASE_URL),
 * si esa base lo tiene.
 *
 *   DATABASE_URL=... npx tsx scratch/bancos_db/deriva_esquema.ts
 */
import postgres from 'postgres';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../../src/db/schema';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const filas = await sql<{ t: string; c: string }[]>`
      SELECT table_name::text AS t, column_name::text AS c
      FROM information_schema.columns WHERE table_schema = 'public'`;
    const enBase = new Map<string, Set<string>>();
    for (const f of filas) {
      if (!enBase.has(f.t)) enBase.set(f.t, new Set());
      enBase.get(f.t)!.add(f.c);
    }

    const faltanTablas: string[] = [];
    const faltanColumnas: string[] = [];
    const vistas = new Set<string>();
    for (const valor of Object.values(schema)) {
      if (!(valor instanceof PgTable)) continue;
      const cfg = getTableConfig(valor);
      if ((cfg.schema ?? 'public') !== 'public' || vistas.has(cfg.name)) continue;
      vistas.add(cfg.name);
      const cols = enBase.get(cfg.name);
      if (!cols) { faltanTablas.push(cfg.name); continue; }
      for (const c of cfg.columns) if (!cols.has(c.name)) faltanColumnas.push(`${cfg.name}.${c.name}`);
    }

    console.log(`Tablas en el esquema TS: ${vistas.size}`);
    console.log(`Tablas que faltan en la base (${faltanTablas.length}): ${faltanTablas.join(', ') || '-'}`);
    console.log(`Columnas que faltan en la base (${faltanColumnas.length}):`);
    for (const c of faltanColumnas) console.log(`  ${c}`);
    // Codigo de salida: `base_desechable.ps1` no corre ningun banco contra una
    // base a la que le falte algo del esquema (daria errores que no son suyos).
    process.exitCode = faltanTablas.length + faltanColumnas.length > 0 ? 1 : 0;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
