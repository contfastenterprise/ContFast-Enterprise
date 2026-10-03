/**
 * Que facturas de un filtro se le preguntan a mSeller (lote 260).
 *
 * Todas las del filtro de la pantalla de e-CF -- con las MISMAS condiciones que
 * el listado -- menos las que la consulta no va a cambiar (aceptadas, dadas de
 * baja) y los borradores. Las que se dejan se CUENTAN, para que el aviso diga
 * cuantas y por que; y por encima de `TOPE_DEL_FILTRO` se toman las mas
 * recientes y se dice cuantas quedaron fuera.
 */
import { db, invoices } from '@/db';
import { and, desc, count, isNotNull, notInArray, sql } from 'drizzle-orm';
import { condicionesDelFiltro, type FiltroDelListadoEcf } from '@/services/dgii/filtroDelListadoEcf';
import { ESTADOS_QUE_NO_SE_SINCRONIZAN, TOPE_DEL_FILTRO } from '@/services/dgii/consultaDeEstado';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

export interface FacturaParaConsultar {
  id: string;
  ncf: string | null;
  status: string;
  msellerTrackId: string | null;
}

export async function facturasParaConsultar(
  alcance: { companyId: string; modo: ModoOperativo },
  filtro: FiltroDelListadoEcf,
  tope: number = TOPE_DEL_FILTRO
): Promise<{ facturas: FacturaParaConsultar[]; sinConsultar: number; recortadas: number }> {
  const delFiltro = condicionesDelFiltro(alcance, filtro);
  const consultable = and(
    isNotNull(invoices.ncf),
    notInArray(invoices.status, [...ESTADOS_QUE_NO_SE_SINCRONIZAN]),
  );

  const [cuenta] = await db
    .select({
      total: count(),
      consultables: sql<number>`count(*) filter (where ${consultable})`.mapWith(Number),
    })
    .from(invoices)
    .where(and(...delFiltro));
  const consultables = cuenta?.consultables ?? 0;

  const facturas = await db
    .select({
      id: invoices.id,
      ncf: invoices.ncf,
      status: invoices.status,
      msellerTrackId: invoices.msellerTrackId,
    })
    .from(invoices)
    .where(and(...delFiltro, consultable))
    .orderBy(desc(invoices.createdAt))
    .limit(tope);

  return {
    facturas,
    sinConsultar: (cuenta?.total ?? 0) - consultables,
    recortadas: Math.max(0, consultables - tope),
  };
}
