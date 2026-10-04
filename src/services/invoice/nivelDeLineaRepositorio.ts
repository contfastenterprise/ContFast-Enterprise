/**
 * Lote 266: guardar y leer el nivel de precio de las lineas de factura (columna `price_tier`).
 *
 * La columna llega con la migracion 0019 y NO esta en el esquema de Drizzle, a proposito: cuatro
 * consultas leen la fila entera de `invoice_lines`, y declarada antes de aplicar la migracion las
 * romperia (la leccion de las 0013 y 0015). Por eso aqui se mira si existe ANTES de nombrarla (el
 * metodo de `hayPrecioUsd`, lote 258) y, si no existe, no se guarda ni se lee nada: el borrador se
 * guarda y se abre como hoy, y la pantalla deduce el nivel.
 */
import { sql } from 'drizzle-orm';
import { db, type DbOTx } from '@/db';
import { esNivelDePrecio } from './preciosDelBorrador';
import type { NivelDePrecio } from '@/services/precios/cambioDeTasa';

let columnaVista = false;
async function hayNivelDePrecio(tx: DbOTx = db): Promise<boolean> {
  if (columnaVista) return true;
  const filas = (await tx.execute(sql`SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'price_tier' LIMIT 1`)) as unknown as unknown[];
  columnaVista = filas.length > 0;
  return columnaVista;
}

/**
 * Apunta el nivel de cada linea recien insertada. `filas` empareja el id de la linea con su nivel;
 * los que no traen un nivel valido no se tocan (se quedan nulos).
 */
export async function guardarNivelesDeLineas(tx: DbOTx, filas: ReadonlyArray<{ id: string; nivel: unknown }>): Promise<void> {
  const validas = filas.filter((f): f is { id: string; nivel: NivelDePrecio } => esNivelDePrecio(f.nivel));
  if (validas.length === 0 || !(await hayNivelDePrecio(tx))) return;
  //  Una lista VALUES y no `unnest(${array}::uuid[])`: Drizzle no pasa un array de JS como UN
  //  parametro, lo expande en una lista separada por comas y el `::uuid[]` queda mal formado. Lo
  //  cazo el banco de integracion (un 500 al guardar el borrador con la columna puesta).
  const valores = sql.join(validas.map((f) => sql`(${f.id}::uuid, ${f.nivel}::varchar)`), sql`, `);
  await tx.execute(sql`UPDATE invoice_lines AS l SET price_tier = v.nivel
    FROM (VALUES ${valores}) AS v(id, nivel)
    WHERE l.id = v.id`);
}

/** El nivel de cada linea de una factura (id de linea -> nivel). Vacio sin la migracion. */
export async function nivelesDeLineas(invoiceId: string): Promise<Map<string, NivelDePrecio>> {
  if (!(await hayNivelDePrecio())) return new Map();
  const filas = (await db.execute(sql`SELECT id::text AS id, price_tier AS nivel FROM invoice_lines
    WHERE invoice_id = ${invoiceId}::uuid AND price_tier IS NOT NULL`)) as unknown as Array<{ id: string; nivel: string }>;
  return new Map(filas.flatMap((f) => (esNivelDePrecio(f.nivel) ? [[f.id, f.nivel] as const] : [])));
}
