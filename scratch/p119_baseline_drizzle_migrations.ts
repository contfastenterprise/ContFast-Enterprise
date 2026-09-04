/**
 * P1-19: marcar la migracion 0000 (la nueva, generada hoy desde schema.ts)
 * como "ya aplicada", SIN correr su SQL contra la base -- porque todo lo que
 * crea (91 tablas, indices, las 78 restricciones de aislamiento) ya existe
 * en produccion.
 *
 * Por que hace falta este script y no un INSERT escrito a mano
 * --------------------------------------------------------------
 * drizzle-orm decide si una migracion "ya corrio" comparando por HASH
 * (sha256 del contenido crudo del archivo .sql), no por nombre. Si el hash
 * que quedara insertado en drizzle.__drizzle_migrations no coincide
 * EXACTAMENTE con el hash que Node calcula del archivo tal como esta en tu
 * disco en el momento de leerlo (drizzle/0000_next_makkari.sql puede
 * cambiar de finales de linea -- LF/CRLF -- al pasar por git, segun
 * .gitattributes), un hash fijo calculado de antemano podria quedar
 * obsoleto. Este script calcula el hash del archivo real, en el momento en
 * que lo corres, asi que siempre coincide con lo que migrate.ts vera despues.
 *
 * Que hace
 * --------
 * 1. Lee drizzle/0000_next_makkari.sql y calcula su sha256 (mismo algoritmo
 *    que usa drizzle-orm internamente: sha256 del contenido completo).
 * 2. Lee drizzle/meta/_journal.json para tomar el "when" de esa entrada
 *    (el timestamp que drizzle-orm usara como created_at).
 * 3. Si ya existe una fila en drizzle.__drizzle_migrations con ese hash, no
 *    hace nada (idempotente -- se puede correr mas de una vez sin riesgo).
 * 4. Si no existe, inserta esa unica fila. NO corre ninguna sentencia SQL
 *    de la migracion -- solo el bookkeeping.
 *
 * Esto es lo unico que toca la base real en todo este lote de P1-19. No
 * crea nada, no borra nada, no toca ninguna tabla de negocio -- solo
 * agrega una fila a la tabla de contabilidad interna de drizzle-kit.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch {
  console.warn('.env no cargado nativamente, usando process.env existente.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
if (!connectionString) {
  console.error('Falta DIRECT_DATABASE_URL o DATABASE_URL');
  process.exit(1);
}

async function main() {
  const sqlPath = 'drizzle/0000_next_makkari.sql';
  const journalPath = 'drizzle/meta/_journal.json';

  const query = readFileSync(sqlPath).toString();
  const hash = createHash('sha256').update(query).digest('hex');

  const journal = JSON.parse(readFileSync(journalPath).toString());
  const entry = journal.entries.find((e: any) => e.tag === '0000_next_makkari');
  if (!entry) {
    console.error(`No se encontro la entrada "0000_next_makkari" en ${journalPath}`);
    process.exit(1);
  }
  const createdAt = entry.when;

  console.log(`Archivo:     ${sqlPath}`);
  console.log(`Hash sha256: ${hash}`);
  console.log(`created_at:  ${createdAt} (${new Date(createdAt).toISOString()})`);

  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await client`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    const existente = await client`
      SELECT id, created_at FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
    `;
    if (existente.length > 0) {
      console.log(`Ya existe una fila con este hash (id=${existente[0].id}). No se inserta nada -- ya estaba marcada.`);
      return;
    }

    const insertado = await client`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${createdAt})
      RETURNING id
    `;
    console.log(`Insertada fila id=${insertado[0].id}. La migracion 0000_next_makkari queda marcada como aplicada.`);
    console.log('No se ejecuto ninguna sentencia de la migracion -- solo este registro.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
