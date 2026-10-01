/**
 * Leer y guardar la portada de la tienda (lote 235).
 *
 * Las cuatro columnas (`tienda_*`, migracion 0016) NO estan en el esquema de
 * Drizzle a proposito -- ver la nota en `db/schema/companies.ts` --, asi que
 * aqui se leen y se escriben con SQL propio. Dos reglas:
 *
 *  · LEER NUNCA TUMBA LA TIENDA. Si la migracion aun no se aplico (la columna
 *    no existe) o la base falla, se devuelve `null` y la tienda ensena la
 *    portada de siempre. Es una pagina publica: una portada por defecto es
 *    mejor que un error.
 *  · GUARDAR SI DICE LA VERDAD: si la migracion falta, lanza un error que lo
 *    nombra, para que quien configura sepa que hacer.
 */
import { cache } from 'react';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { Logger } from '@/utils/logger';
import type { PortadaGuardada } from './portada';

type Fila = { tienda_anuncio: string | null; tienda_titulo: string | null; tienda_texto: string | null; tienda_imagen_url: string | null };

/** Postgres 42703: la columna no existe (falta la migracion 0016). */
const faltaLaMigracion = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return err?.code === '42703' || err?.cause?.code === '42703' || /tienda_(anuncio|titulo|texto|imagen_url)/.test(String(err?.message ?? ''));
};

export class FaltaLaMigracionDePortada extends Error {
  constructor() {
    super('La portada aún no se puede guardar: falta aplicar la migración 0016_portada_de_la_tienda.sql en la base de datos.');
    this.name = 'FaltaLaMigracionDePortada';
  }
}

export const PortadaRepositorio = {
  /** La portada guardada, o `null` si no hay fila, falta la migracion o falla la lectura. */
  async leer(companyId: string): Promise<PortadaGuardada | null> {
    try {
      const filas = (await db.execute(sql`
        SELECT tienda_anuncio, tienda_titulo, tienda_texto, tienda_imagen_url
          FROM company_settings
         WHERE company_id = ${companyId}::uuid AND deleted_at IS NULL
         LIMIT 1`)) as unknown as Fila[];
      const f = filas[0];
      if (!f) return null;
      return { anuncio: f.tienda_anuncio, titulo: f.tienda_titulo, texto: f.tienda_texto, imagenUrl: f.tienda_imagen_url };
    } catch (e) {
      //  Aviso y no error: con la migracion sin aplicar esto pasa en cada visita,
      //  y es un estado previsto, no una averia.
      Logger.warn('[portada] no se pudo leer la portada; se usa la de siempre', {
        motivo: faltaLaMigracion(e) ? 'falta la migracion 0016' : (e as Error)?.message,
      });
      return null;
    }
  },

  /** Guarda la portada. `false` si la empresa no tiene fila de ajustes. */
  async guardar(companyId: string, p: PortadaGuardada): Promise<boolean> {
    try {
      const filas = (await db.execute(sql`
        UPDATE company_settings
           SET tienda_anuncio = ${p.anuncio}, tienda_titulo = ${p.titulo},
               tienda_texto = ${p.texto}, tienda_imagen_url = ${p.imagenUrl}, updated_at = now()
         WHERE company_id = ${companyId}::uuid AND deleted_at IS NULL
        RETURNING company_id`)) as unknown as unknown[];
      return filas.length > 0;
    } catch (e) {
      if (faltaLaMigracion(e)) throw new FaltaLaMigracionDePortada();
      throw e;
    }
  },
};

/**
 * La portada para la tienda, UNA lectura por visita: el layout (la barra de
 * anuncio) y la portada la piden los dos, y `cache` de React las junta.
 */
export const leerPortadaDeLaTienda = cache((companyId: string) => PortadaRepositorio.leer(companyId));
