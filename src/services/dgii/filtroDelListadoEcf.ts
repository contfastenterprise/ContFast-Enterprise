/**
 * Las condiciones del filtro de la pantalla de e-CF, en UN sitio (lote 260).
 *
 * Las usan el listado (`GET /api/v1/ecf`) y la sincronizacion de todo el filtro
 * (`POST /api/v1/ecf/dgii-status/batch` con `filtro`). Tienen que ser las
 * mismas: si la sincronizacion copiara la regla, el dia que el listado cambie
 * un filtro "Consultar DGII" consultaria otro conjunto del que se ve, sin que
 * nada lo dijera. Es el defecto que este proyecto ha repetido con cada regla
 * copiada (tipos de comprobante, entorno, estado).
 */
import { invoices } from '@/db';
import { eq, and, isNull, gte, lte, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { tiposDelFiltro } from '@/services/dgii/tiposComprobante';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

export interface FiltroDelListadoEcf {
  status?: string | null;
  ecfType?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
}

const CAMPOS = ['status', 'ecfType', 'from', 'to', 'q'] as const;

/**
 * Lee el filtro de la direccion del listado. Cada parametro por su nombre, a
 * proposito: el trinquete de `verificar_listas_completas` (lote 135) deduce de
 * estas lecturas que parametros lee la ruta que delega aqui.
 */
export function filtroDeParametros(sp: URLSearchParams): FiltroDelListadoEcf {
  return {
    status: sp.get('status'),
    ecfType: sp.get('ecfType'),
    from: sp.get('from'),
    to: sp.get('to'),
    q: sp.get('q'),
  };
}

/**
 * Lee el filtro del cuerpo de una peticion. Solo texto; lo demas se descarta.
 * `null` si el cuerpo no trae un objeto: no es lo mismo que un filtro vacio
 * ("todo"), y confundirlos consultaria el historial entero por un error.
 */
export function filtroDelCuerpo(valor: unknown): FiltroDelListadoEcf | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const o = valor as Record<string, unknown>;
  const f: FiltroDelListadoEcf = {};
  for (const c of CAMPOS) {
    const v = o[c];
    if (typeof v === 'string' && v.trim() !== '') f[c] = v.trim();
  }
  return f;
}

/** Las condiciones del filtro, acotadas a la empresa y al modo de la sesion. */
export function condicionesDelFiltro(
  alcance: { companyId: string; modo: ModoOperativo },
  f: FiltroDelListadoEcf
): SQL[] {
  const conditions: SQL[] = [
    eq(invoices.companyId, alcance.companyId),
    eq(invoices.modo, alcance.modo),
    isNull(invoices.deletedAt),
  ];

  if (f.status) conditions.push(eq(invoices.status, f.status));
  //  `ecfType` puede ser una lista (`33,34`). La pantalla de notas la necesita
  //  para filtrar AQUI, donde se pagina, y no sobre una pagina ya cortada.
  //  Un tipo suelto sigue siendo la misma igualdad de antes.
  const tipos = tiposDelFiltro(f.ecfType ?? null);
  if (tipos.length === 1) conditions.push(eq(invoices.ecfType, tipos[0]));
  else if (tipos.length > 1) conditions.push(inArray(invoices.ecfType, tipos));
  //  Antes `ecfType=,` buscaba ese tipo literal y no devolvia nada. Que la
  //  lista quede vacia al limpiarla no puede convertirlo en "todos".
  if (f.ecfType && tipos.length === 0) conditions.push(sql`false`);
  if (f.from) {
    const fromDate = f.from.includes('T') ? new Date(f.from) : new Date(`${f.from}T00:00:00-04:00`);
    conditions.push(gte(invoices.createdAt, fromDate));
  }
  if (f.to) {
    const toDate = f.to.includes('T') ? new Date(f.to) : new Date(`${f.to}T23:59:59.999-04:00`);
    conditions.push(lte(invoices.createdAt, toDate));
  }
  if (f.q) {
    conditions.push(ilike(invoices.ncf, `%${f.q}%`));
  }
  return conditions;
}

/** Atajo para quien solo quiere el `WHERE`. */
export function dondeDelFiltro(
  alcance: { companyId: string; modo: ModoOperativo },
  f: FiltroDelListadoEcf
): SQL | undefined {
  return and(...condicionesDelFiltro(alcance, f));
}
