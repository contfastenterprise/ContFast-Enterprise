/**
 * Quien ve el saldo de una caja ABIERTA (lote 228).
 *
 * EL DEFECTO
 * ----------
 * El lote 172 hizo el arqueo CIEGO (decision del dueño, 2026-09-20): con la caja
 * abierta, `/cash/sessions/active` deja de devolver el saldo esperado, para que
 * quien cuenta no lo copie -- y se copiaba: las tres sesiones cerradas de Latin
 * Doors cuadraban al centavo con 85.000,00 reales. Pero la tarjeta "Balance
 * Actual" y el pie "Total Neto en Caja" de /dashboard/cash siguieron leyendo ese
 * campo, y con el campo ausente pintaban `fmt('0')`: **RD$0,00**. No ocultaban el
 * dato, decian uno FALSO. Medido el 2026-09-29: la caja abierta de Latin Doors
 * (PRODUCCION, desde el 23/09) tenia RD$328.719,58.
 *
 * LA REGLA (decision del dueño, 2026-09-29)
 * -----------------------------------------
 * Administracion y sistemas ven el saldo real; el resto cuenta a ciegas, y donde
 * iria la cifra se dice que se ve al cerrar. El control del 172 se queda donde
 * importa: en el cajero que cuenta.
 *
 * Quien es "administracion o sistemas" no se decide aqui: es `esAdminOSistemas`,
 * la unica fuente de esa comparacion desde la auditoria P0-02. Una copia podria
 * dejar a la pantalla y al permiso de anular diciendo cosas distintas.
 *
 * El saldo se quita en el SERVIDOR (lo que no se manda no se puede leer en la
 * red); `saldoVisible` le dice a la pantalla que pintar en su lugar.
 *
 * Sin base de datos: aqui solo se decide.
 */
import { esAdminOSistemas } from '@/utils/rolMatch';

export function veElSaldoEsperado(rol: string | null | undefined): boolean {
  return esAdminOSistemas(rol);
}

/** Lo que dice la pantalla donde iria el saldo, para quien cuenta a ciegas. */
export const TEXTO_SALDO_OCULTO = 'Se ve al cerrar la caja';

/**
 * La sesion abierta tal como sale por la API: con su saldo para quien puede
 * verlo, y sin el para el resto. Siempre lleva `saldoVisible`.
 */
export function sesionParaMostrar<T extends { expectedBalance?: unknown }>(
  sesion: T | null | undefined,
  rol: string | null | undefined,
): (T & { saldoVisible: boolean }) | null {
  if (!sesion) return null;
  if (veElSaldoEsperado(rol)) return { ...sesion, saldoVisible: true };
  return { ...sesion, expectedBalance: undefined, saldoVisible: false };
}
