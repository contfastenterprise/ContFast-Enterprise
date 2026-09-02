/**
 * Limpieza compartida de los bancos de pruebas.
 *
 * POR QUE EXISTE ESTO
 * -------------------
 * Cada banco llevaba su propia lista de `DELETE FROM ...` escrita a mano y en
 * el orden que hacia falta el dia que se escribio. Eso fallo tres veces:
 *
 *   - `invoice_lines` referenciaba `invoices`
 *   - `customer_receipt_applied` referenciaba `accounts_receivable`
 *   - `cash_movements` referenciaba `cash_sessions`
 *   - `expenses` referenciaba `suppliers`
 *
 * y cada vez el sintoma era el mismo y enganoso: un banco ANTIGUO reventaba
 * por clave foranea despues de correr uno NUEVO, y parecia que el codigo se
 * habia roto cuando lo que estaba mal era el orden de borrado.
 *
 * La lista no se puede mantener a mano: cada tabla nueva con `modo`, cada
 * tabla de detalle nueva, la deja obsoleta en silencio. Asi que se DERIVA del
 * esquema en cada ejecucion:
 *
 *   1. Todas las tablas con columna `modo` (las transaccionales).
 *   2. Mas las que apuntan a alguna de ellas por clave foranea sin tenerla
 *      (las de detalle: invoice_lines, expense_lines, ...).
 *
 * Y se vacian con TRUNCATE ... CASCADE, que resuelve el orden por si mismo.
 * Lo que NO se toca: empresas, usuarios, roles, productos, almacenes y demas
 * catalogo, que es la semilla de la que viven los bancos.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

let cache: string[] | null = null;

/** Las tablas transaccionales, segun el esquema de verdad, no segun memoria. */
export async function tablasTransaccionales(): Promise<string[]> {
  if (cache) return cache;
  const filas = (await db.execute(sql`
    WITH con_modo AS (
      SELECT table_name::text AS t
      FROM information_schema.columns
      WHERE column_name = 'modo' AND table_schema = 'public'
    ),
    hijas AS (
      SELECT DISTINCT c.conrelid::regclass::text AS t
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid::regclass::text IN (SELECT t FROM con_modo)
        AND c.conrelid::regclass::text NOT IN (SELECT t FROM con_modo)
    )
    SELECT t FROM con_modo
    UNION
    SELECT t FROM hijas
    ORDER BY t
  `)) as unknown as { t: string }[];
  cache = filas.map((f) => f.t);
  return cache;
}

/**
 * Vacia todo lo transaccional. `extra` es para las tablas de utileria que un
 * banco concreto siembre y que no son transaccionales (cash_registers,
 * accounting_periods, y los clientes o suplidores que cree para si mismo).
 */
export async function limpiar(extra: string[] = []): Promise<void> {
  const tablas = [...(await tablasTransaccionales()), ...extra];
  const lista = tablas.map((t) => `"${t}"`).join(', ');
  // CASCADE resuelve el orden de dependencias. RESTART IDENTITY no hace falta:
  // las claves son uuid.
  await db.execute(sql.raw(`TRUNCATE ${lista} CASCADE`));
}

/** Para el banco que quiera comprobar que la derivacion sigue viva. */
export async function resumen(): Promise<string> {
  const t = await tablasTransaccionales();
  return `${t.length} tablas transaccionales derivadas del esquema`;
}
