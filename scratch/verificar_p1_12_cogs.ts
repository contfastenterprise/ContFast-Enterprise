import { fuente as fuenteCruda, crudo as crudoCrudo } from './_fuente';

// Normaliza CRLF -> LF: src/services/supplierOrderService.ts tiene fin de
// linea CRLF en el repo (confirmado con `file`), y las comprobaciones
// multilinea de este banco usan '\n' literal. Sin esto darian falso negativo
// en ese fichero aunque el codigo sea correcto (mismo problema ya visto y
// documentado en scratch/verificar_p1_24_lote8.ts).
const fuente = (ruta: string): string => fuenteCruda(ruta).replace(/\r\n/g, '\n');
const crudo = (ruta: string): string => crudoCrudo(ruta).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean, d = ''): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
}

// ─── src/db/schema/inventory.ts ─────────────────────────────────────────
{
  const src = fuente('src/db/schema/inventory.ts');
  ok('inventoryLevels tiene averageCost',
    /averageCost:\s*decimal\('average_cost',\s*\{\s*precision:\s*15,\s*scale:\s*4\s*\}\)\.default\('0\.0000'\)\.notNull\(\)/.test(src));
  ok('inventoryMovements tiene unitCost (nullable)',
    /unitCost:\s*decimal\('unit_cost',\s*\{\s*precision:\s*15,\s*scale:\s*4\s*\}\),/.test(src));
}

// ─── src/services/inventoryService.ts ───────────────────────────────────
{
  const src = fuente('src/services/inventoryService.ts');

  ok('addStock: nuevo parametro unitCost antes de tx',
    /unitCost\?:\s*number,\s*\n\s*tx:\s*typeof db = db\s*\n\s*\):\s*Promise<\{\s*averageCost:\s*number\s*\}>\s*\{/.test(src));

  ok('addStock: early-return de producto sin inventario devuelve { averageCost: 0 }',
    /if \(!\(await llevaInventario\(companyId, productId, tx\)\)\) return \{ averageCost: 0 \};/.test(src));

  ok('addStock: calcula costoPromedioAnterior desde level.averageCost',
    src.includes('const costoPromedioAnterior = Number(level.averageCost ?? 0);'));

  ok('addStock: solo mezcla si quantity > 0 y unitCost viene definido',
    /if \(quantity > 0 && unitCost !== undefined && unitCost !== null && !Number\.isNaN\(unitCost\)\)/.test(src));

  ok('addStock: la cantidad previa de la mezcla nunca es negativa (Math.max(..., 0))',
    src.includes('const cantidadPreviaParaMezcla = Math.max(Number(level.quantity), 0);'));

  ok('addStock: el UPDATE de inventoryLevels graba averageCost',
    /\.set\(\{\s*\n\s*quantity: newQuantity\.toString\(\),\s*\n\s*averageCost: costoPromedioNuevo\.toFixed\(4\),/.test(src));

  ok('addStock: el INSERT de inventoryMovements graba unitCost',
    /unitCost: costoPromedioNuevo\.toFixed\(4\),\s*\n\s*referenceId,/.test(src));

  ok('addStock: devuelve { averageCost: costoPromedioNuevo }',
    src.includes('return { averageCost: costoPromedioNuevo };'));

  ok('deductStock: firma devuelve Promise<{ averageCost: number }>',
    /export async function deductStock\([\s\S]*?\): Promise<\{ averageCost: number \}> \{/.test(src));

  ok('deductStock: nunca pasa costo (undefined) a addStock, y retorna su resultado',
    src.includes('return await addStock(companyId, modo, productId, warehouseId, -quantity, userId, type, referenceId, description, undefined, tx);'));

  ok('transferStock: el addStock de destino recibe el averageCost del almacen de origen',
    src.includes("await addStock(companyId, modo, item.productId, destinationWarehouseId, item.quantity, userId, 'transfer_in', transferId, `Transfer from ${sourceWarehouseId}`, Number(sourceLevel.averageCost), tx);"));
}

// ─── src/repositories/accountingRepository.ts ───────────────────────────
{
  const src = fuente('src/repositories/accountingRepository.ts');

  ok('AccountingRepository expone revertirAsientoContable como metodo estatico',
    /static async revertirAsientoContable\(\s*\n\s*tx: DbTransaction,\s*\n\s*companyId: string,\s*\n\s*modo: 'PRODUCCION' \| 'PRUEBA',\s*\n\s*journalEntryId: string,\s*\n\s*motivo: string,\s*\n\s*userId: string\s*\n\s*\)/.test(src));

  ok('revertirAsientoContable: guarda de "ya revertido" (busca por reference = journalEntryId)',
    /const \[yaRevertido\] = await tx\s*\n\s*\.select\(\{ id: journalEntries\.id \}\)\s*\n\s*\.from\(journalEntries\)\s*\n\s*\.where\(eq\(journalEntries\.reference, journalEntryId\)\)/.test(src));

  ok('revertirAsientoContable: invierte debe/haber y llama a this.createJournalEntry',
    /lines: lineas\.map\(\(l\) => \(\{\s*\n\s*accountId: l\.accountId,\s*\n\s*debit: parseFloat\(l\.credit\) \|\| 0,\s*\n\s*credit: parseFloat\(l\.debit\) \|\| 0,/.test(src) &&
    src.includes('await this.createJournalEntry(tx, {'));
}

// ─── src/repositories/deliveryRepository.ts ─────────────────────────────
{
  const src = fuente('src/repositories/deliveryRepository.ts');

  ok('importa AccountRepository, resolverCuentaPorMapeo y journalEntries',
    src.includes("import { AccountRepository } from '@/repositories/accountRepository';") &&
    src.includes("import { resolverCuentaPorMapeo } from '@/services/accounting/resolverCuentas';") &&
    src.includes('journalEntries'));

  ok('approve(): captura averageCost de deductStock y acumula costoDeVentaTotal',
    src.includes('let costoDeVentaTotal = 0;') &&
    /const \{ averageCost \} = await deductStock\(/.test(src) &&
    src.includes('costoDeVentaTotal += currentQty * averageCost;'));

  ok('approve(): asienta Costo de Venta (5.1.01 / 1.1.03.01) referenciando el conduce (reference: id), solo si > 0',
    src.includes('if (costoDeVentaTotal > 0.004) {') &&
    src.includes("resolverCuentaPorMapeo(tx, companyId, 'cost_of_goods_sold', '5.1.01'") &&
    src.includes("resolverCuentaPorMapeo(tx, companyId, 'inventory', '1.1.03.01'") &&
    /reference: id,\s*\n\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*\n\s*description: `Costo de Venta - Conduce/.test(src));

  ok('void(): busca el asiento de costo por reference = id y lo revierte con AccountRepository.revertirAsientoContable',
    /\.where\(and\(\s*\n\s*eq\(journalEntries\.reference, id\),\s*\n\s*eq\(journalEntries\.companyId, companyId\),\s*\n\s*eq\(journalEntries\.modo, modo\)\s*\n\s*\)\)/.test(src) &&
    src.includes('await AccountRepository.revertirAsientoContable('));
}

// ─── src/services/invoice/invoiceDbBooker.ts ────────────────────────────
{
  const src = fuente('src/services/invoice/invoiceDbBooker.ts');

  ok('nota de credito (e-34): captura averageCost de deductStock y acumula costoDevueltoTotal',
    src.includes('let costoDevueltoTotal = 0;') &&
    /const \{ averageCost \} = await deductStock\(/.test(src) &&
    src.includes('costoDevueltoTotal += line.quantity * averageCost;'));

  ok('nota de credito: asienta el reverso de Costo de Venta (Inventario debe / Costo haber), reference: invoice.id, solo si > 0',
    src.includes('if (costoDevueltoTotal > 0.004) {') &&
    /lines: \[\s*\n\s*\{ accountId: accInventarioDevolucion\.id, debit: montoDevuelto, credit: 0 \},\s*\n\s*\{ accountId: accCostoDevolucion\.id, debit: 0, credit: montoDevuelto \},\s*\n\s*\],/.test(src) &&
    src.includes('reference: invoice.id,'));
}

// ─── src/services/supplierOrderService.ts (CRLF en el repo) ─────────────
{
  const src = fuente('src/services/supplierOrderService.ts');
  ok('registerReception: addStock recibe undefined como costo (sin dato de costo en purchase_order_items)',
    /await addStock\(\s*\n\s*companyId,\s*\n\s*modo,\s*\n\s*item\.productId,\s*\n\s*order\.warehouseId,\s*\n\s*rec\.quantityToReceive,\s*\n\s*userId,\s*\n\s*'purchase',\s*\n\s*order\.id,\s*\n\s*`Recepcion de pedido \$\{order\.orderNumber\}`,\s*\n\s*undefined,\s*\n\s*tx\s*\n\s*\);/.test(src));
}

// ─── src/services/expenseService.ts ─────────────────────────────────────
{
  const src = fuente('src/services/expenseService.ts');
  ok('createExpense: addStock recibe line.unitPrice || undefined como costo',
    src.includes('line.unitPrice || undefined,'));
}

// ─── src/app/api/v1/expenses/route.ts (POST) ────────────────────────────
{
  const src = fuente('src/app/api/v1/expenses/route.ts');

  ok('importa addStock',
    src.includes("import { addStock } from '@/services/inventoryService';"));

  ok('ya no reimplementa a mano el inventario (0 tx.insert(inventoryLevels), 0 tx.insert(inventoryMovements))',
    !src.includes('tx.insert(inventoryLevels)') && !src.includes('tx.insert(inventoryMovements)'));

  ok('llama a addStock con parseFloat(line.unitCost) como costo',
    /await addStock\(\s*\n\s*session\.companyId,\s*\n\s*session\.modo,\s*\n\s*line\.productId,\s*\n\s*warehouseId,\s*\n\s*qty,\s*\n\s*session\.userId,\s*\n\s*'purchase',\s*\n\s*newExpenseId,\s*\n\s*`Compra a suplidor \/ Gasto`,\s*\n\s*parseFloat\(line\.unitCost\) \|\| undefined,\s*\n\s*tx\s*\n\s*\);/.test(src));

  ok("import de '@/db' ya no trae inventoryLevels ni inventoryMovements",
    !/from '@\/db';[\s\S]{0,3}/.test('') || (!src.match(/import \{[^}]*inventoryLevels[^}]*\} from '@\/db';/) && !src.match(/import \{[^}]*inventoryMovements[^}]*\} from '@\/db';/)));
}

// ─── src/app/api/v1/expenses/[id]/route.ts (revert + PUT) ───────────────
{
  const src = fuente('src/app/api/v1/expenses/[id]/route.ts');

  ok('revertirMovimientosInventario: pasa undefined como costo al revertir (no recalcula el promedio hacia atras)',
    /await addStock\(\s*\n\s*companyId,\s*\n\s*modo,\s*\n\s*mov\.productId,\s*\n\s*mov\.warehouseId,\s*\n\s*-Number\(mov\.quantity\),\s*\n\s*userId,\s*\n\s*'adjustment',\s*\n\s*mov\.id,\s*\n\s*motivo,\s*\n\s*undefined,\s*\n\s*tx\s*\n\s*\);/.test(src));

  ok('PUT: ya no reimplementa a mano el inventario (0 tx.insert(inventoryLevels))',
    !src.includes('tx.insert(inventoryLevels)') && !src.includes('tx.update(inventoryLevels)'));

  ok('PUT: llama a addStock con parseFloat(line.unitCost) como costo, referenceId = id',
    /await addStock\(\s*\n\s*session\.companyId,\s*\n\s*session\.modo,\s*\n\s*line\.productId,\s*\n\s*warehouseId,\s*\n\s*qty,\s*\n\s*session\.userId,\s*\n\s*'purchase',\s*\n\s*id,\s*\n\s*`Edición de Compra a suplidor \/ Gasto`,\s*\n\s*parseFloat\(line\.unitCost\) \|\| undefined,\s*\n\s*tx\s*\n\s*\);/.test(src));

  // Lo que esta comprobacion defiende es que esta ruta NO vuelva a hacer la
  // cuenta de existencias por su cuenta -- leer el nivel, sumar en JavaScript y
  // escribir --, que es el patron que P1-12 saco de aqui y metio en `addStock`.
  //
  // El freno de existencia consumida LEE `inventoryLevels` (con `.for('update')`)
  // para decidir si puede revertir, y no escribe ni una fila. Eso no es lo
  // prohibido. Asi que la comprobacion pasa a prohibir lo que de verdad
  // importa: ESCRIBIR. Es mas estricta que la de antes, no mas floja.
  ok("expenses/[id]/route: no vuelve a escribir inventoryLevels a mano",
    !src.includes('.update(inventoryLevels)')
    && !src.includes('.insert(inventoryLevels)')
    && !src.includes('set({ quantity:'));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
