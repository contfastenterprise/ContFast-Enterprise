import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

const crudo = (rutaRelativa: string): string =>
  readFileSync(join(RAIZ, rutaRelativa), 'utf8').replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════ La misma factura de compra se podia registrar dos veces ═══════
//
// `expenses` no tenia ningun indice unico sobre el NCF del suplidor: solo
// indices normales. Nada impedia registrar dos veces la misma factura, y cada
// copia duplica su ITBIS en el 606, que es lo que se reporta a la DGII. Mismo
// caso que el codigo de empleado en P2-27, y mismo arreglo.
//
// La clave es (empresa, suplidor, NCF, modo), no solo el NCF: dos suplidores
// distintos SI pueden emitir el mismo numero, porque la secuencia es por RNC
// emisor. Parcial sobre deleted_at IS NULL (anular y volver a registrar tiene
// que seguir siendo posible) y sobre que existan suplidor y NCF: los gastos
// menores informales no llevan ninguno de los dos y quedan fuera a proposito.

let s = crudo('src/db/schema/accounting.ts');
ok(
  'expenses: indice unico sobre (empresa, suplidor, NCF, modo)',
  s.includes("uniqueIndex('expenses_company_supplier_ncf_modo_uq')") &&
    s.includes('.on(table.companyId, table.supplierId, table.ncf, table.modo)')
);
ok(
  'expenses: parcial -- fuera los borrados y los gastos sin suplidor o sin NCF',
  s.includes('.where(sql`deleted_at IS NULL AND supplier_id IS NOT NULL AND ncf IS NOT NULL`)')
);
ok('expenses: la nota explica por que el suplidor va en la clave', s.includes('la secuencia es por RNC emisor'));

s = crudo('src/app/api/v1/expenses/route.ts');
ok(
  'POST: el duplicado responde 409 con codigo propio',
  s.includes("code: 'DUPLICATE_NCF'") &&
    s.includes('{ status: 409 }') &&
    s.includes("e.code === '23505' || e.message?.includes('expenses_company_supplier_ncf_modo_uq')")
);

s = crudo('src/app/api/v1/expenses/[id]/route.ts');
ok(
  'PUT: editar el NCF a uno que ya existe responde igual, 409',
  s.includes("code: 'DUPLICATE_NCF'") &&
    s.includes('{ status: 409 }') &&
    s.includes("e.code === '23505' || e.message?.includes('expenses_company_supplier_ncf_modo_uq')")
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
