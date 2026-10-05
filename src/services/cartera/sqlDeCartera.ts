/**
 * Lote 304: las reglas de `reglasDeCartera.ts`, escritas en SQL para las consultas que no pueden
 * traer las filas a memoria. Recibe las COLUMNAS y no importa `@/db`: asi lo usan todas las
 * consultas de CxC (cartera, cuentas por cobrar, el reporte, el estado de cuenta, el panel
 * financiero) con su propio alias, y el banco lo renderiza sin conexion.
 *
 * Si cambia una regla, cambia aqui Y en `reglasDeCartera.ts`; el banco del lote 304 compara las dos.
 */
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { ESTADOS_QUE_SON_DEUDA } from './reglasDeCartera';

/** La factura de la cuenta por cobrar es deuda: estado aceptado, enviado o firmado, y no borrada. */
export function facturaEsDeudaSql(estado: SQLWrapper, borradaEn: SQLWrapper): SQL {
  const lista = sql.join(ESTADOS_QUE_SON_DEUDA.map((e) => sql`${e}`), sql`, `);
  return sql`(${estado} IN (${lista}) AND ${borradaEn} IS NULL)`;
}

/** El vencimiento de una CxC: el pactado en la factura y, si no lo tiene, el de la cuenta. */
export function vencimientoDeCxcSql(pactado: SQLWrapper, deLaCuenta: SQLWrapper): SQL<string> {
  return sql<string>`COALESCE(${pactado}, ${deLaCuenta})`;
}

/** Vencida a fecha de `hoy` (dia de RD, 'AAAA-MM-DD'): vence ANTES de hoy. El dia que vence aun no. */
export function vencidaSql(vence: SQLWrapper, hoy: string): SQL<boolean> {
  return sql<boolean>`(${vence} < ${hoy}::date)`;
}
