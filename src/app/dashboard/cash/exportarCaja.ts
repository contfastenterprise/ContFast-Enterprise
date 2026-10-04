/**
 * Lote 281: los CSV de la pantalla de Caja. Puro, para que el banco lo ejecute.
 *
 * El boton "Exportar" de los movimientos del turno no tenia `onClick` y no hacia nada (lo encontro la
 * auditoria de UI, lote 273). Ahora exporta lo mismo que enseña la tabla, y respeta el ARQUEO CIEGO
 * (lote 172): el "Total neto en caja" solo sale si quien exporta puede ver el saldo (`saldoVisible`, la
 * misma regla que la tabla, decidida en el servidor). Un cajero que cuenta a ciegas no se lleva en el
 * fichero el saldo que la pantalla le esconde.
 *
 * De paso, dos defectos del CSV del historico, que pasa por aqui:
 *  - una comilla dentro de un texto rompia la fila (las comillas no se doblaban);
 *  - un texto que empieza por `=`, `+`, `-` o `@` lo ejecuta Excel como FORMULA al abrir el fichero
 *    (inyeccion de CSV): el concepto de un movimiento lo escribe cualquiera. Se le antepone un apostrofo.
 * Y la marca UTF-8 al principio, sin la cual Excel enseña "DevoluciÃ³n".
 */
import { formatDateTimeDisplay, diaRD } from '@/utils/fechasLocales';
import type { Movement, Register, Session } from './caja';

const ETIQUETAS: Record<Movement['type'], string> = {
  sale: 'Venta',
  refund: 'Devolución',
  cash_in: 'Entrada',
  cash_out: 'Salida',
};

/** Una celda de texto: comillas dobladas y sin formulas. */
export function celdaCsv(valor: unknown): string {
  let s = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Un importe: numero con punto y dos decimales, sin comillas (que la hoja lo sume). */
export function importeCsv(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** El fichero: marca UTF-8, filas separadas por CRLF (lo que espera Excel). */
export function contenidoCsv(filas: string[][]): string {
  return '﻿' + filas.map((f) => f.join(',')).join('\r\n');
}

/** Si un movimiento suma a la caja: lo mismo que pinta la tabla en verde. */
export const sumaALaCaja = (tipo: Movement['type']) => tipo === 'sale' || tipo === 'cash_in';

export function csvDeMovimientos(
  movimientos: Movement[],
  opciones: { saldoVisible: boolean; saldoEsperado?: string | number | null },
): string {
  const filas: string[][] = [
    ['Fecha y hora', 'Tipo', 'Concepto', 'Referencia', 'Monto'].map(celdaCsv),
    ...movimientos.map((mv) => [
      celdaCsv(formatDateTimeDisplay(mv.createdAt)),
      celdaCsv(ETIQUETAS[mv.type] ?? mv.type),
      celdaCsv(mv.description ?? ''),
      celdaCsv(mv.reference ?? ''),
      importeCsv((sumaALaCaja(mv.type) ? 1 : -1) * Number(mv.amount || 0)),
    ]),
  ];
  if (opciones.saldoVisible && opciones.saldoEsperado !== undefined && opciones.saldoEsperado !== null) {
    filas.push([celdaCsv('Total neto en caja'), '', '', '', importeCsv(opciones.saldoEsperado)]);
  }
  return contenidoCsv(filas);
}

/**
 * El fichero de los movimientos del turno: lo que enseña la tabla, y el total solo si la SESION deja ver
 * el saldo (arqueo ciego, lote 172). El nombre lleva la terminal y el dia de RD.
 */
export function archivoDeMovimientos(
  movimientos: Movement[],
  sesion: Pick<Session, 'saldoVisible' | 'expectedBalance' | 'cashRegisterId'> | null,
  terminales: Register[],
  dia: string = diaRD(),
): { nombre: string; contenido: string } {
  const terminal = terminales.find((r) => r.id === sesion?.cashRegisterId);
  return {
    nombre: nombreDelCsv('movimientos caja', dia, terminal?.code ?? terminal?.name),
    contenido: csvDeMovimientos(movimientos, { saldoVisible: !!sesion?.saldoVisible, saldoEsperado: sesion?.expectedBalance }),
  };
}

/** El nombre del fichero: lo que es, la terminal y el dia de RD. */
export function nombreDelCsv(que: string, dia: string, terminal?: string | null): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
  return [limpio(que), terminal ? limpio(terminal) : '', dia].filter(Boolean).join('_') + '.csv';
}
