/**
 * Cuando avisar: cheques en garantia por vencer, y caja sin cerrar.
 *
 * POR QUE ESTE FICHERO (lote 158)
 * -------------------------------
 * El panel ya avisaba de un cheque en garantia VENCIDO, pero no antes. Medido
 * el 2026-09-18 en Latin Doors (PRODUCCION): el cheque 120 vencio ayer (avisa),
 * el 123 vence mañana por RD$144.092,15 (no avisa nada) y el 125 el 08/10. Un
 * cheque en garantia se cobra contra la cuenta el dia de su fecha: enterarse el
 * mismo dia, o despues, es enterarse tarde.
 *
 * Y de la caja no avisaba nadie: habia una sesion abierta desde el 06/08 -43
 * dias- en PRODUCCION y otra de 17 dias en PRUEBA. De la unica sesion cerrada
 * en toda la historia, ninguna se cerro el mismo dia. Mientras una sesion sigue
 * abierta, el arqueo no cuadra contra nada y los cobros en efectivo se siguen
 * metiendo dentro.
 *
 * Decidido por el dueño el 2026-09-18: avisar 3 dias antes del cobro del
 * cheque, y avisar de la caja que no se cerro el MISMO DIA en que se abrio.
 *
 * Aqui no hay base de datos: son fechas y comparaciones, y por eso se ejecuta
 * en un banco. La hora es la de Republica Dominicana (UTC-4, sin horario de
 * verano), que es la que ve quien abre la caja.
 */

/** Dias de antelacion con que se avisa de un cheque en garantia. */
export const DIAS_AVISO_CHEQUE = 3;

// `diaRD` y `diaRDMas` nacieron aqui (lote 158) y subieron a
// `utils/fechasLocales.ts` en el lote 174, cuando el panel necesito el mismo
// dia de RD. Se reexportan para no tocar a quien ya los importaba de aqui.
export { diaRD, diaRDMas, DESFASE_RD_MS } from '@/utils/fechasLocales';
import { diaRD, diaRDMas } from '@/utils/fechasLocales';

/**
 * Hasta que fecha de cobro hay que avisar. Incluye los ya vencidos: quien mira
 * el panel quiere ver todo lo que le va a salir de la cuenta, no solo lo de
 * mañana.
 */
export function limiteDeAvisoDeCheques(ahora: Date, dias = DIAS_AVISO_CHEQUE): string {
  return diaRDMas(ahora, dias);
}

/** Como de urgente es un cheque, segun su fecha de cobro. */
export type UrgenciaCheque = 'vencido' | 'hoy' | 'proximo';

export function urgenciaDelCheque(fechaCobro: string, ahora: Date): UrgenciaCheque {
  const hoy = diaRD(ahora);
  if (fechaCobro < hoy) return 'vencido';
  if (fechaCobro === hoy) return 'hoy';
  return 'proximo';
}

/** Cuantos dias faltan (negativo si ya paso). */
export function diasHastaElCobro(fechaCobro: string, ahora: Date): number {
  const hoy = diaRD(ahora);
  if (!fechaCobro || !hoy) return 0;
  const ms = Date.parse(`${fechaCobro}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** El texto del aviso de un cheque, segun lo cerca que este. */
export function tituloDelCheque(numero: string, fechaCobro: string, ahora: Date): string {
  const urgencia = urgenciaDelCheque(fechaCobro, ahora);
  if (urgencia === 'vencido') return `Cheque en garantía vencido (#${numero})`;
  if (urgencia === 'hoy') return `Cheque en garantía se cobra HOY (#${numero})`;
  const dias = diasHastaElCobro(fechaCobro, ahora);
  return `Cheque en garantía se cobra en ${dias} día(s) (#${numero})`;
}

/**
 * ¿Hay que avisar de esta sesion de caja?
 *
 * Solo si sigue abierta Y se abrio en un dia ANTERIOR al de hoy, en hora de RD.
 * Una sesion abierta esta mañana no es un descuido: es la caja del dia.
 */
export function cajaSinCerrar(sesion: { status?: string | null; openedAt?: Date | string | null }, ahora: Date): boolean {
  if ((sesion.status || '') !== 'open') return false;
  if (!sesion.openedAt) return false;
  const abierta = diaRD(sesion.openedAt);
  return !!abierta && abierta < diaRD(ahora);
}

/** Cuantos dias lleva abierta (0 si se abrio hoy). */
export function diasAbierta(openedAt: Date | string, ahora: Date): number {
  return -diasHastaElCobro(diaRD(openedAt), ahora);
}
