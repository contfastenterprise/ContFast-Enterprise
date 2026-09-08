import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════ P2-28: N+1 de lectura al aprobar un conduce ═══════════
// `approve` llamaba a checkStock DENTRO del bucle de lineas, y cada checkStock
// hace dos consultas (el producto, para saber si lleva inventario, y su nivel en
// el almacen). Un conduce de 30 lineas eran 60 consultas, ademas dentro de la
// transaccion que mantiene bloqueadas las filas de inventario.
{
  const s = crudo('src/services/inventoryService.ts');

  ok(
    'inventoryService: la regla de existencia sale a su propia funcion',
    s.includes('function alcanzaLaExistencia(existencia: number, minimo: number, cantidadPedida: number): boolean {')
  );
  ok(
    'inventoryService: checkStock delega en ella (una sola fuente de verdad)',
    s.includes('return alcanzaLaExistencia(currentStock, minStock, quantityNeeded);')
  );
  ok(
    'inventoryService: la regla ya no esta escrita a mano dentro de checkStock',
    !s.includes('const restante = currentStock - quantityNeeded;')
  );
  ok(
    'inventoryService: la nota recuerda que esta regla ya se corrigio una vez (F1-04)',
    s.includes('ya se corrigio una vez (F1-04)')
  );

  ok('inventoryService: existe checkStockBatch', s.includes('export async function checkStockBatch('));
  ok(
    'inventoryService: recibe las lineas y devuelve un array de booleanos',
    s.includes('items: { productId: string; quantityNeeded: number }[],') && s.includes('): Promise<boolean[]> {')
  );
  ok('inventoryService: resuelve los productos en UNA consulta con inArray', s.includes('inArray(products.id, ids)'));
  ok(
    'inventoryService: resuelve los niveles en UNA consulta con inArray',
    s.includes('inArray(inventoryLevels.productId, ids)')
  );
  ok(
    'inventoryService: rechaza igual un producto de otra empresa',
    s.includes("if (!llevaPorProducto.has(id)) throw new Error('Producto no encontrado en esta empresa.');")
  );
  ok(
    'inventoryService: un servicio (sin inventario) sigue sin bloquear el despacho',
    s.includes('if (!llevaPorProducto.get(productId)) return true;')
  );
  ok(
    'inventoryService: la nota explica por que array por indice y no mapa por producto',
    s.includes('NO un mapa por producto') && s.includes('no se suman entre si')
  );
  ok(
    'inventoryService: la nota deja claro que el camino provisional no cambia',
    s.includes('No cubre el camino provisional')
  );
}

{
  const s = crudo('src/repositories/deliveryRepository.ts');

  ok(
    'deliveryRepository: importa la version por lote',
    s.includes("import { checkStockBatch, deductStock } from '@/services/inventoryService';")
  );
  ok(
    'deliveryRepository: la comprobacion se hace UNA vez, antes del bucle',
    s.includes('const hayExistencia = await checkStockBatch(') &&
      s.indexOf('checkStockBatch(') < s.indexOf('for (const [idx, line] of note.lines.entries())')
  );
  ok(
    'deliveryRepository: el bucle consulta el resultado por indice',
    s.includes('for (const [idx, line] of note.lines.entries()) {') && s.includes('if (!hayExistencia[idx]) {')
  );
  ok(
    'deliveryRepository: ya no queda ningun await checkStock dentro del bucle',
    !s.includes('await checkStock(companyId, modo, line.productId')
  );
  ok(
    'deliveryRepository: se conserva el aviso sobre el modo',
    s.includes('aprobar un conduce en PRUEBA comprobaba y descontaba las')
  );
}

// ═══════════ P2-31: createAccountsPayable no devolvia nada ═══════════
// Insertaba, pedia .returning() y tiraba el resultado. Su hermana
// createAccountsReceivable, justo encima, si devuelve la fila.
{
  const s = crudo('src/repositories/accountingRepository.ts');
  ok('accountingRepository: createAccountsPayable devuelve la fila creada', s.includes('    return ap;\n  }\n'));
  ok(
    'accountingRepository: la nota explica que era una trampa a futuro',
    s.includes('reutilice esperando el id de la cuenta por pagar')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
