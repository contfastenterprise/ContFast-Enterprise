/**
 * Que todo lo que mueve la Caja General en el mayor se vea tambien en la
 * sesion de caja abierta.
 *
 * POR QUE EXISTE (lote 169)
 * -------------------------
 * La caja se cuadra en dos sitios: al cerrar la sesion (lo contado contra lo
 * esperado) y en el mayor (1.1.01.01 Caja General contra el efectivo real). Para
 * que los dos cuenten lo mismo, todo lo que entra o sale de la caja tiene que
 * pasar por los dos. Las ventas y los cobros en efectivo ya pasaban por la
 * sesion; las SALIDAS no: medido el 2026-09-19 en Latin Doors, 86 compras en
 * efectivo (904.351,51) y 2 pagos a suplidores en efectivo (30.679,84) bajaron
 * la Caja General del mayor sin tocar la sesion, y llevar efectivo al banco
 * tampoco se registraba como salida. Resultado: la sesion cerrada el 19/09
 * "esperaba" 2.204.992,49 con 85.000,00 reales en caja, y el esperado ya no
 * servia para nada.
 *
 * El principio: se mide el efecto de la operacion en el MAYOR de la caja (lo
 * que el asiento hizo a la cuenta de efectivo) y se refleja ese mismo importe
 * en la sesion -- una salida si bajo, una entrada si subio. Asi no se
 * recalculan importes por otro camino, y una compra antigua que se edita sin
 * cambiar lo pagado no genera movimiento (su efecto antes y despues es igual).
 *
 * Que sesion: la abierta del usuario; si no tiene, la UNICA abierta de la
 * empresa en ese entorno (quien registra una compra suele no ser el cajero).
 * Si no hay ninguna, o hay varias y ninguna es suya, se niega -- como ya
 * niegan las ventas y los cobros en efectivo: "abra caja primero".
 */
import { and, eq } from 'drizzle-orm';
import { cashSessions } from '@/db/schema';
import type { DbTransaction } from '@/db';
import { CashRepository } from '@/repositories/cashRepository';
import { resolverCuentaPorMapeo } from '@/services/accounting/resolverCuentas';
import { efectoEnCuentaDeDocumento } from '@/services/contabilidad/efectoEnCuenta';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

const centavos = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) : 0);

/**
 * El movimiento de caja que corresponde a un cambio en el mayor de la caja
 * (debe - haber). Positivo: entro efectivo. Negativo: salio. Cero: nada.
 */
export function movimientoDeCaja(cambioEnCaja: number): { tipo: 'cash_in' | 'cash_out'; monto: number } | null {
  const c = centavos(cambioEnCaja);
  if (c === 0) return null;
  return c > 0 ? { tipo: 'cash_in', monto: c / 100 } : { tipo: 'cash_out', monto: -c / 100 };
}

/** La sesion donde se apunta el efectivo, o el motivo por el que no hay. */
export async function sesionParaEfectivo(
  tx: DbTransaction,
  companyId: string,
  modo: ModoOperativo,
  userId: string | null | undefined,
): Promise<string> {
  const abiertas = await tx
    .select({ id: cashSessions.id, userId: cashSessions.userId })
    .from(cashSessions)
    .where(and(eq(cashSessions.companyId, companyId), eq(cashSessions.modo, modo), eq(cashSessions.status, 'open')));

  const propia = userId ? abiertas.find((s) => s.userId === userId) : undefined;
  if (propia) return propia.id;
  if (abiertas.length === 1) return abiertas[0].id;
  if (abiertas.length === 0) {
    throw new Error('No hay una caja abierta para registrar el efectivo. Abra caja primero: la salida tiene que constar en la sesión para que la caja cuadre.');
  }
  throw new Error(`Hay ${abiertas.length} cajas abiertas y ninguna es suya: abra la suya para registrar el efectivo.`);
}

/**
 * El efecto de un documento en el mayor de la CAJA (debe - haber sobre la
 * cuenta de efectivo): su asiento (`reference = documentoId`) y las
 * reversiones de ese asiento (`reference = id del asiento`, lo que hace
 * `revertirAsientoContable`).
 */
export async function efectoEnCajaDeDocumento(
  tx: DbTransaction,
  companyId: string,
  modo: ModoOperativo,
  documentoId: string,
): Promise<number> {
  // El calculo general vive en `services/contabilidad/efectoEnCuenta.ts` desde
  // el lote 170: el banco lo necesita igual.
  const caja = await resolverCuentaPorMapeo(tx, companyId, 'cash', '1.1.01.01', 'Caja General');
  return await efectoEnCuentaDeDocumento(tx, companyId, modo, documentoId, caja.id);
}

/**
 * Apunta en la sesion abierta el cambio que una operacion hizo en la caja del
 * mayor. Sin cambio no busca sesion (editar una compra sin tocar lo pagado no
 * exige tener la caja abierta).
 */
export async function reflejarEnCaja(tx: DbTransaction, datos: {
  companyId: string;
  modo: ModoOperativo;
  userId: string | null | undefined;
  referencia: string;
  descripcion: string;
  cambioEnCaja: number;
}): Promise<void> {
  const mov = movimientoDeCaja(datos.cambioEnCaja);
  if (!mov) return;
  const sesion = await sesionParaEfectivo(tx, datos.companyId, datos.modo, datos.userId);
  await CashRepository.addMovement(tx, {
    companyId: datos.companyId,
    cashSessionId: sesion,
    type: mov.tipo,
    amount: mov.monto,
    description: datos.descripcion,
    reference: datos.referencia,
  });
}
