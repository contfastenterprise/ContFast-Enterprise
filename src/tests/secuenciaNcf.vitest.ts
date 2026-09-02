/**
 * secuenciaNcf.vitest.ts
 *
 * Guarda permanente del hallazgo DB-04 de la auditoria.
 *
 * La emision de un e-CF hacia esto:
 *
 *   1. leer la secuencia SIN bloqueo  (`predictNextNcf`)
 *   2. firmar y enviar el comprobante a la DGII con ese numero
 *   3. reservar el numero con `SELECT ... FOR UPDATE`
 *
 * Entre el paso 1 y el 3 estaba la llamada de red. Dos facturas simultaneas
 * leian el mismo NCF y **las dos lo enviaban a la DGII**; al serializarse, la
 * segunda detectaba el conflicto y abortaba su transaccion entera. Quedaban dos
 * comprobantes con el mismo numero ante la DGII y una venta entregada al
 * cliente que no existia en el sistema: sin ingreso, sin ITBIS, sin inventario.
 *
 * El orden correcto es reservar primero. Un hueco en la secuencia se explica
 * ante la DGII; un NCF duplicado no.
 *
 * Esta prueba lee el codigo fuente y comprueba ese orden. Es una prueba
 * estructural, no de comportamiento: la de comportamiento exigiria dos
 * emisiones concurrentes contra una base real, y el fallo que cubre es
 * precisamente el que no se reproduce en una prueba secuencial.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

/**
 * Quita comentarios de bloque y de linea.
 *
 * La prueba mira lo que el codigo HACE. Las notas de la auditoria citan por su
 * nombre las funciones retiradas (`predictNextNcf`) y el mensaje de error que
 * dejo de existir, y sin esta limpieza esas menciones darian falsos positivos.
 */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const leer = (...partes: string[]) => sinComentarios(readFileSync(join(SRC, ...partes), 'utf8'));

const invoiceService = leer('services', 'invoiceService.ts');
const dbBooker = leer('services', 'invoice', 'invoiceDbBooker.ts');
const companyRepository = leer('repositories', 'companyRepository.ts');

/** Posicion de la primera llamada a un metodo, o -1. */
const posicion = (texto: string, llamada: string) => texto.indexOf(llamada);

describe('DB-04 · orden de reserva del NCF', () => {
  it('el NCF se reserva ANTES de enviar el comprobante a la DGII', () => {
    const reserva = posicion(invoiceService, 'reservarNcf(');
    const envio = posicion(invoiceService, 'submitToDgii(');

    expect(reserva, 'invoiceService ya no reserva el NCF').toBeGreaterThan(-1);
    expect(envio, 'invoiceService ya no envia a la DGII').toBeGreaterThan(-1);
    expect(
      reserva,
      'La reserva del NCF tiene que ocurrir antes del envio a la DGII. ' +
        'Si se invierte, dos emisiones simultaneas mandan el mismo numero.'
    ).toBeLessThan(envio);
  });

  it('no queda rastro de la lectura sin bloqueo', () => {
    for (const [nombre, contenido] of [
      ['invoiceService.ts', invoiceService],
      ['invoiceDbBooker.ts', dbBooker],
    ] as const) {
      expect(
        contenido.includes('predictNextNcf'),
        `${nombre} vuelve a predecir el NCF sin bloquear la secuencia`
      ).toBe(false);
    }
  });

  it('la reserva ocurre en un solo sitio y con bloqueo de fila', () => {
    // `allocateNextNcf` es la unica que puede avanzar la secuencia, y lo hace
    // con SELECT ... FOR UPDATE.
    expect(companyRepository).toContain("for('update')");

    // Un unico llamador en todo el flujo de emision: `reservarNcf`.
    const llamadas = (dbBooker.match(/CompanyRepository\.allocateNextNcf\(/g) || []).length;
    expect(
      llamadas,
      'La secuencia debe avanzar en un solo punto. Si `executeDbTransaction` o ' +
        '`saveRejectedInvoice` vuelven a reservar, el numero se consume dos veces.'
    ).toBe(1);
  });

  it('los huecos de secuencia quedan registrados', () => {
    // Reservar antes de enviar implica que un envio fallido deja el numero
    // consumido. Ese hueco tiene que ser explicable ante la DGII.
    expect(dbBooker).toContain('registrarNcfSinUsar');
    expect(dbBooker).toContain("action: 'ncf_reservado_sin_usar'");
    expect(
      (invoiceService.match(/registrarNcfSinUsar\(/g) || []).length,
      'Faltan trazas: hay que registrar el hueco tanto si falla el envio como ' +
        'si falla el registro de la factura ya enviada.'
    ).toBe(2);
  });

  it('un rechazo de la DGII no deja hueco: la factura se guarda con su NCF', () => {
    expect(invoiceService).toContain('saveRejectedInvoice(');
    // La factura rechazada se persiste con el numero ya reservado, sin volver a
    // pedir otro.
    expect(dbBooker).not.toContain('Conflicto de concurrencia NCF');
  });
});
