/**
 * P1-09: doble aprobacion de un conduce (carrera de inventario).
 * P1-10: transferStock reimplementaba a mano el patron sin candado que causo
 *        INV-09 en addStock, en vez de reutilizar addStock/deductStock.
 *
 * Ambos son findings de "Fase B" (P1) de la auditoria del 2026-09-03. Este
 * banco comprueba solo el codigo fuente (no toca la base de datos).
 *
 * Contraprobado: revirtiendo el WHERE de aprobacion a
 * `.where(eq(deliveryNotes.id, id))` a secas, o devolviendo transferStock a su
 * bucle manual sin `.for('update')` ni delegar en addStock/deductStock, las
 * comprobaciones correspondientes se ponen rojas (verificado con una copia de
 * prueba antes de entregar este banco).
 */
import { fuente, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n=== P1-09: doble aprobacion de conduce (deliveryRepository.ts) ===\n');

const delivery = fuente('src/repositories/deliveryRepository.ts');

const cuerpoApprove = bloque(delivery, /static\s+async\s+approve\s*\(/);
ok('se pudo aislar el cuerpo de approve()', cuerpoApprove.length > 0);

ok("el UPDATE de aprobacion exige status='draft' en el WHERE",
  /\.where\(and\(eq\(deliveryNotes\.id,\s*id\),\s*eq\(deliveryNotes\.status,\s*'draft'\)\)\)/.test(cuerpoApprove));

ok('el UPDATE devuelve el id con .returning(...) para saber si gano la carrera',
  /\.returning\(\{\s*id:\s*deliveryNotes\.id\s*\}\)/.test(cuerpoApprove));

ok('si .returning() vino vacio, se lanza un error explicando la carrera perdida',
  /if\s*\(\s*aprobado\.length\s*===\s*0\s*\)\s*\{\s*throw new Error/.test(cuerpoApprove));

const actualizacionesSinCondicion = (cuerpoApprove.match(/\.where\(eq\(deliveryNotes\.id,\s*id\)\)/g) || []).length;
ok("ya no queda un UPDATE de aprobacion sin exigir status='draft'", actualizacionesSinCondicion === 0,
  `encontrado ${actualizacionesSinCondicion} suelto(s)`);

ok('and sigue importado de drizzle-orm (lo necesita el nuevo WHERE)',
  /import\s*\{[^}]*\band\b[^}]*\}\s*from\s*'drizzle-orm'/.test(delivery));

console.log('\n=== P1-10: transferStock sin candado (inventoryService.ts) ===\n');

const inv = fuente('src/services/inventoryService.ts');

const marcaFirma = inv.indexOf('export async function transferStock');
ok('se encontro la funcion transferStock', marcaFirma >= 0);

const desdeTransfer = marcaFirma >= 0 ? inv.slice(marcaFirma) : '';
const cuerpoTransfer = bloque(desdeTransfer, /async\s*\(tx\)\s*=>\s*\{/);
ok('se pudo aislar el cuerpo de la transaccion de transferStock', cuerpoTransfer.length > 0);

ok("la lectura de existencia del almacen origen queda bloqueada (.for('update'))",
  /eq\(inventoryLevels\.warehouseId,\s*sourceWarehouseId\)[\s\S]{0,80}\)\s*\)\s*\.for\('update'\)/.test(cuerpoTransfer));

ok('se preserva el mensaje de existencia insuficiente',
  /Insufficient stock for product \$\{item\.productId\} in source warehouse/.test(cuerpoTransfer));

ok('el chequeo de llevaInventario sigue presente',
  /llevaInventario\(companyId, item\.productId, tx\)/.test(cuerpoTransfer));

ok('el descuento del origen delega en deductStock(...)',
  /deductStock\(companyId,\s*modo,\s*item\.productId,\s*sourceWarehouseId,\s*item\.quantity,\s*userId,\s*'transfer_out'/.test(cuerpoTransfer));

ok('el alta en destino delega en addStock(...)',
  /addStock\(companyId,\s*modo,\s*item\.productId,\s*destinationWarehouseId,\s*item\.quantity,\s*userId,\s*'transfer_in'/.test(cuerpoTransfer));

const updatesManuales = (cuerpoTransfer.match(/tx\.update\(inventoryLevels\)/g) || []).length;
ok('ya no queda ninguna escritura manual de inventoryLevels dentro de transferStock', updatesManuales === 0,
  `encontrado ${updatesManuales}`);

const insertsManuales = (cuerpoTransfer.match(/tx\.insert\(inventoryLevels\)/g) || []).length;
ok('ya no queda alta manual de fila de existencia dentro de transferStock', insertsManuales === 0,
  `encontrado ${insertsManuales}`);

const movimientosManuales = (cuerpoTransfer.match(/tx\.insert\(inventoryMovements\)/g) || []).length;
ok('ya no quedan inserciones manuales de inventoryMovements dentro de transferStock (las hacen addStock/deductStock)',
  movimientosManuales === 0, `encontrado ${movimientosManuales}`);

const marcaAddStock = inv.indexOf('export async function addStock');
ok("addStock conserva su propio .for('update') (sin regresion)",
  /\.for\('update'\)/.test(inv.slice(marcaAddStock, marcaAddStock + 2500)));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
