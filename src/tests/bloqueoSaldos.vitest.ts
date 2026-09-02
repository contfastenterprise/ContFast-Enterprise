/**
 * bloqueoSaldos.vitest.ts
 *
 * Guarda permanente de los hallazgos ARP-05, ARP-06, ARP-07, ARP-13 e INV-09.
 *
 * Los saldos —cuentas por cobrar, cuentas por pagar y existencia— se
 * actualizaban leyendo el valor, calculando en JavaScript y escribiendo el
 * resultado, sin bloquear la fila. Bajo concurrencia eso es una *lost update*:
 * dos operaciones leen el mismo saldo y la ultima escritura gana.
 *
 *   ARP-06  dos pagos simultaneos de la deuda completa emitian dos cheques
 *           contra una sola deuda; ademas el saldo se leia con la conexion
 *           global, fuera de la transaccion.
 *   ARP-07  dos cajeros cobrando la misma factura: entraban los dos recibos y
 *           el auxiliar bajaba una sola vez.
 *   ARP-13  el mismo cheque en garantia se aplicaba dos veces.
 *   INV-09  dos despachos del mismo producto dejaban existencia inventada, con
 *           un `balanceAfter` falso en el kardex.
 *
 * La correccion es siempre la misma: bloquear la fila con `SELECT ... FOR
 * UPDATE` ANTES de calcular, dentro de la transaccion que escribe.
 *
 * Esta prueba es estructural. La de comportamiento exigiria concurrencia real
 * contra una base de datos, y el fallo que cubre es justamente el que no se
 * reproduce ejecutando las operaciones una detras de otra.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

/**
 * Quita comentarios. Las notas de la auditoria citan por su nombre las
 * construcciones retiradas (`Math.max(0, ...)`, `findById`), y sin esta
 * limpieza esas menciones darian falsos positivos.
 */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const leer = (...partes: string[]) => sinComentarios(readFileSync(join(SRC, ...partes), 'utf8'));

const arRepository = leer('repositories', 'arRepository.ts');
const apRepository = leer('repositories', 'apRepository.ts');
const apService = leer('services', 'apService.ts');
const inventoryService = leer('services', 'inventoryService.ts');

/** Cuerpo de una funcion o metodo, desde su firma hasta el siguiente `\n  }`. */
function cuerpo(fuente: string, firma: string): string {
  const inicio = fuente.indexOf(firma);
  if (inicio === -1) return '';
  const fin = fuente.indexOf('\n  }', inicio);
  return fuente.slice(inicio, fin === -1 ? undefined : fin);
}

describe('ARP-07 · cobro a clientes', () => {
  const registerReceipt = cuerpo(arRepository, 'static async registerReceipt(');

  it('la cuenta por cobrar se bloquea antes de calcular el nuevo saldo', () => {
    expect(registerReceipt, 'no se encontro registerReceipt').not.toBe('');
    expect(registerReceipt).toContain(".for('update')");

    const bloqueo = registerReceipt.indexOf(".for('update')");
    const escritura = registerReceipt.indexOf('.update(accountsReceivable)');
    expect(bloqueo, 'el bloqueo tiene que ir antes de la escritura').toBeLessThan(escritura);
  });

  it('la aplicacion se valida antes de insertarse, no despues', () => {
    const validacion = registerReceipt.indexOf('.from(accountsReceivable)');
    const insercion = registerReceipt.indexOf('.insert(customerReceiptApplied)');
    expect(
      validacion,
      'ARP-04: la fila de aplicacion se insertaba antes de comprobar el arId, ' +
        'de modo que una aplicacion invalida quedaba guardada igualmente.'
    ).toBeLessThan(insercion);
  });

  it('se comprueba que la cuenta por cobrar sea del mismo cliente', () => {
    expect(
      registerReceipt,
      'ARP-04: sin esto, un cobro del cliente A salda la factura del cliente B.'
    ).toContain('accountsReceivable.customerId');
  });

  it('se rechaza aplicar mas de lo que se debe', () => {
    expect(
      registerReceipt,
      'ARP-05: sin tope, un sobrepago deja el saldo negativo y marcado como pagado.'
    ).toContain('excede el saldo pendiente');
  });
});

describe('ARP-06 y ARP-13 · cuentas por pagar', () => {
  it('existe un bloqueo de fila para la cuenta por pagar', () => {
    expect(apRepository).toContain('static async bloquearAp(');
    expect(cuerpo(apRepository, 'static async bloquearAp(')).toContain(".for('update')");
  });

  it('el pago no lee el saldo con la conexion global', () => {
    const registerPayment = cuerpo(apService, 'static async registerPayment(');
    expect(registerPayment, 'no se encontro registerPayment').not.toBe('');
    expect(
      registerPayment.includes('ApRepository.findById('),
      'ARP-06: findById consulta `db`, no la transaccion, y sin bloqueo.'
    ).toBe(false);
    expect(registerPayment).toContain('ApRepository.bloquearAp(');
  });

  it('los tres puntos que descargan saldo lo hacen sobre una fila bloqueada', () => {
    // pago manual, aplicacion masiva de cheques y aplicacion individual
    expect((apService.match(/ApRepository\.bloquearAp\(/g) || []).length).toBe(3);
  });

  it('el cobro de un cheque exige que siga pendiente', () => {
    expect(apRepository).toContain('static async marcarChequeCobrado(');
    expect(cuerpo(apRepository, 'static async marcarChequeCobrado(')).toContain("eq(checks.status, 'pending')");
    expect((apService.match(/marcarChequeCobrado\(/g) || []).length).toBe(2);
  });

  it('el descuadre de un cheque mayor que la deuda no se oculta', () => {
    expect(
      apService.includes('Math.max(0, apBalance - amountNum)'),
      'ARP-13: Math.max(0, ...) recortaba el exceso en silencio.'
    ).toBe(false);
    expect(apService).toContain('descuadres');
  });
});

describe('INV-09 · existencia', () => {
  it('el nivel se bloquea antes de calcular la nueva cantidad', () => {
    const addStock = inventoryService.slice(inventoryService.indexOf('inventoryLevels'));
    expect(addStock).toContain(".for('update')");

    const bloqueo = inventoryService.indexOf(".for('update')");
    const calculo = inventoryService.indexOf('const newQuantity =');
    expect(bloqueo, 'el bloqueo tiene que ir antes del calculo').toBeLessThan(calculo);
  });

  it('crear el nivel por primera vez tolera la carrera', () => {
    // FOR UPDATE no bloquea filas que aun no existen: el empate lo resuelve el
    // indice unico (product_id, warehouse_id, modo).
    expect(inventoryService).toContain('onConflictDoNothing()');
  });
});
