/**
 * El mismo producto en dos lineas de un conduce.
 *
 * Un conduce puede traer el mismo producto repetido. Las comprobaciones que
 * autorizan el despacho miraban LINEA A LINEA contra el total entero, nunca
 * contra la suma:
 *
 *   1. EXISTENCIA -- `checkStockBatch` decidia cada linea por separado contra
 *      la misma existencia. Con 10 en almacen, dos lineas de 8 pasaban las dos
 *      y el paso 5 de `approve` descontaba las dos: el nivel quedaba en -6.
 *
 *   2. LO FACTURADO -- `previouslyDelivered + currentQty > invoicedQty` con
 *      `currentQty` de UNA linea. Facturaste 10, el conduce lleva dos de 8:
 *      cada una se comparaba con los 10 y pasaba. Se despachaban 16.
 *
 *   3. LA FACTURA TAMBIEN REPITE -- `invLines.find(...)` se quedaba con la
 *      PRIMERA linea de la factura para ese producto. Una factura con el
 *      producto en dos lineas de 5 contaba 5 facturados en vez de 10 y
 *      RECHAZABA entregas legitimas. Falla al reves que los otros dos, pero es
 *      el mismo error.
 *
 * Las tres se arreglan igual: sumar por producto antes de comparar.
 *
 * Este banco comprueba la ESTRUCTURA. El comportamiento lo prueba
 * `src/tests/inventoryService.vitest.ts`, que ejecuta `checkStockBatch` de
 * verdad con un doble de `tx` (las dos ultimas comprobaciones de aqui solo
 * verifican que esas pruebas siguen en la suite).
 *
 * Contra el HEAD anterior: las 10 fallan.
 */
import { fuente as fuenteCruda, crudo as crudoCrudo, bloque } from './_fuente';

const fuente = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');
const crudo = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ─── src/services/inventoryService.ts ───────────────────────────────────
{
  const src = fuente('src/services/inventoryService.ts');

  // OJO: no vale marcar 'export async function checkStockBatch(' -- la primera
  // llave que sigue es la del TIPO del parametro `items`, no la del cuerpo.
  const b = bloque(src, '): Promise<boolean[]>');

  ok('existencia: se suma por producto antes de decidir, no linea a linea',
    b.includes('pedidoPorProducto.set(productId, (pedidoPorProducto.get(productId) || 0) + quantityNeeded);')
    && !b.includes('alcanzaLaExistencia(existencia, minimo, quantityNeeded)')
    && b.includes('alcanzaLaExistencia(existencia, minimo, totalPedido)'));

  ok('existencia: el resultado sigue alineado con `items` por indice',
    b.includes('return items.map(({ productId }) => alcanzaPorProducto.get(productId) ?? false);'));

  ok('existencia: un servicio se resuelve una vez por producto y nunca bloquea',
    b.includes('if (!llevaPorProducto.get(productId)) {')
    && b.includes('alcanzaPorProducto.set(productId, true);'));

  // Este mira el COMENTARIO a proposito: el docblock viejo prometia por escrito
  // que las lineas no se sumaban ("se conserva a proposito"). Mientras esa
  // promesa siga escrita, el siguiente que lea la funcion la creera.
  const conComentarios = crudo('src/services/inventoryService.ts');
  ok('existencia: el docblock ya no promete que las lineas no se suman',
    !conComentarios.includes('lineas no se suman entre si')
    && conComentarios.includes('lo que tiene que caber'));
}

// ─── src/repositories/deliveryRepository.ts ─────────────────────────────
{
  const src = fuente('src/repositories/deliveryRepository.ts');
  const b = bloque(src, 'static async approve(');

  ok('facturado: se suma por producto, porque la FACTURA tambien puede repetir',
    b.includes('facturadoPorProducto.set(')
    && b.includes('const invoicedQty = facturadoPorProducto.get(line.productId) || 0;')
    && !src.includes('invLines.find('));

  ok('pedido: se suma el total de ESTE conduce por producto',
    b.includes('pedidoPorProducto.set(')
    && b.includes('const currentQty = pedidoPorProducto.get(line.productId) || 0;'));

  ok('el mensaje de exceso reporta el total del conduce, no el de una linea',
    b.includes('const currentQty = pedidoPorProducto.get(line.productId) || 0;')
    && b.includes('Solicitado: ${currentQty}'));

  // El descuento del paso 5 NO cambia: dos lineas de 8 se descuentan como dos
  // salidas de 8, y esta bien -- suman 16. Lo que estaba mal era autorizarlas.
  ok('el descuento sigue linea a linea aunque la comprobacion sea por producto',
    b.includes('pedidoPorProducto.set(')
    && b.includes('for (const line of note.lines) {')
    && b.includes('const currentQty = Number(line.quantity);'));
}

// ─── src/tests/inventoryService.vitest.ts ───────────────────────────────
{
  const t = crudo('src/tests/inventoryService.vitest.ts');

  ok('suite: prueba el caso de las dos lineas de 8 contra una existencia de 10',
    t.includes("import { checkStock, checkStockBatch } from '../services/inventoryService';")
    && t.includes('8 + 8 no salen de una existencia de 10'));

  ok('suite: prueba que el producto que no alcanza no arrastra al que si',
    t.includes('el producto que no alcanza no arrastra al que si')
    && t.includes('[false, false, true]'));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
