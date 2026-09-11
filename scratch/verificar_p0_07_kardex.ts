import { crudo } from './_fuente';

let fallos = 0;

function ok(t: string, c: boolean, d = ''): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
}

const src = crudo('src/app/api/v1/expenses/[id]/route.ts');

// El import crecio con `llevaInventario`, que usa el freno de existencia
// consumida. Se comprueba que traiga addStock, no la forma exacta de la linea.
ok("import addStock de @/services/inventoryService",
  /import \{[^}]*\baddStock\b[^}]*\} from '@\/services\/inventoryService';/.test(src));

ok("revertirAsientoContable: guarda 'ya revertido' antes de revertir (bug de doble-reversion encontrado al construir el reverso del kardex)",
  /if \(!original\) return;[\s\S]*?const \[yaRevertido\] = await tx\s*\n\s*\.select\(\{ id: journalEntries\.id \}\)\s*\n\s*\.from\(journalEntries\)\s*\n\s*\.where\(eq\(journalEntries\.reference, journalEntryId\)\)\s*\n\s*\.limit\(1\);\s*\n\s*if \(yaRevertido\) return;/.test(src));

ok('nueva funcion revertirMovimientosInventario declarada',
  src.includes('async function revertirMovimientosInventario('));

ok('revertirMovimientosInventario: lee originales por referenceId=expenseId',
  /\.from\(inventoryMovements\)\s*\n\s*\.where\(and\(\s*\n\s*eq\(inventoryMovements\.referenceId, expenseId\),\s*\n\s*eq\(inventoryMovements\.companyId, companyId\),\s*\n\s*eq\(inventoryMovements\.modo, modo\)\s*\n\s*\)\);/.test(src));

ok('revertirMovimientosInventario: detecta ya-revertidos via inArray sobre los ids originales, y los salta',
  src.includes('const yaRevertidos = await tx') &&
  src.includes('.where(inArray(inventoryMovements.referenceId, idsOriginales));') &&
  src.includes('if (idsYaRevertidos.has(mov.id)) continue;'));

ok('revertirMovimientosInventario: llama addStock con cantidad negativa y referenceId=mov.id (id del movimiento ORIGINAL, no el de la compra)',
  // P1-12 metio `unitCost` ANTES de `tx` (undefined en una reversion: salir no
  // tiene costo propio). Este banco seguia esperando la firma vieja y llevaba
  // en rojo desde entonces, sin que nadie lo corriera. Se admite el parametro.
  /await addStock\(\s*\n\s*companyId,\s*\n\s*modo,\s*\n\s*mov\.productId,\s*\n\s*mov\.warehouseId,\s*\n\s*-Number\(mov\.quantity\),\s*\n\s*userId,\s*\n\s*'adjustment',\s*\n\s*mov\.id,\s*\n\s*motivo,\s*\n\s*undefined,\s*\n\s*tx\s*\n\s*\);/.test(src));

// El comentario explicativo cita `tx.delete(inventoryMovements)` entre backticks a
// proposito (para narrar que asi funcionaba ANTES) -- por eso la comprobacion busca
// la llamada real (`await tx` seguido de `.delete(...)` en la linea siguiente), no
// el simple substring, que tambien matchearia dentro del comentario.
const llamadasDeleteReales = (src.match(/await tx\s*\n\s*\.delete\(inventoryMovements\)/g) || []).length;
ok('DELETE/PUT: ya no hay llamadas reales a tx.delete(inventoryMovements), ni el clamp Math.max(0, currentBalance - qty)',
  llamadasDeleteReales === 0 && !src.includes('Math.max(0, currentBalance - qty)'));

ok('DELETE: llama revertirMovimientosInventario con el motivo de eliminacion',
  /await revertirMovimientosInventario\(\s*\n\s*tx,\s*\n\s*session\.companyId,\s*\n\s*session\.modo,\s*\n\s*id,\s*\n\s*session\.userId,\s*\n\s*`Eliminación de compra NCF: \$\{expenseRow\.ncf \|\| 'N\/A'\}`\s*\n\s*\);/.test(src));

ok('PUT: llama revertirMovimientosInventario con el motivo de edicion',
  /await revertirMovimientosInventario\(\s*\n\s*tx,\s*\n\s*session\.companyId,\s*\n\s*session\.modo,\s*\n\s*id,\s*\n\s*session\.userId,\s*\n\s*`Edición de compra NCF: \$\{existing\[0\]\.ncf \|\| 'N\/A'\}`\s*\n\s*\);/.test(src));

ok("no quedan referencias muertas a 'linesList'/'oldLines'/'oldWarehouseId'",
  !src.includes('linesList') && !src.includes('oldLines') && !src.includes('oldWarehouseId'));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
