/**
 * P0-05 + P0-07: cuentas contables correctas al facturar/comprar, y borrado
 * controlado de compras.
 *
 * LO QUE PASO (P0-05)
 * --------------------
 * `invoiceDbBooker.ts`, `expenses/route.ts`, `expenses/[id]/route.ts` y
 * `expenseService.ts` resolvian sus cuentas contables con una copia local de
 * `getOrCreateAccount(tx, companyId, codigo, nombre, tipo)`: busca por CODIGO
 * LITERAL y CREA la cuenta si no la encuentra, sin comprobar si es
 * transaccional. '1.1.02' y '1.1.01' ya existian en el catalogo real como
 * cuentas de AGRUPACION (Cuentas por Cobrar es la primera, no Efectivo);
 * postear ahi duplica el saldo entre padre e hijo. '2.1.03' (ITBIS por Pagar
 * en ventas) y '2.1.01' (Cuentas por Pagar en compras, usado como cuenta de
 * CREDITO) no son las cuentas transaccionales reales -- las reales son
 * '2.1.02.01' y '2.1.01.01'. `resolverCuentas.ts` (ya existente, disenado
 * exactamente para esto) solo lo usaban 2 de 6 rutas.
 *
 * LO QUE PASO (P0-07)
 * --------------------
 * `DELETE`/`PUT /api/v1/expenses/[id]` borraban fisicamente, dentro de una
 * transaccion, los asientos contables de la compra -- sin comprobar si el
 * periodo ya estaba cerrado y sin dejar rastro en `audit_logs`. Contradice el
 * propio diseño del schema: `journal_entries.deletedAt` existe para poder
 * ocultar un asiento sin destruirlo.
 *
 * Este banco comprueba el codigo fuente (sin tocar la base de datos ni
 * ejecutar nada). Contraprobado: revirtiendo cualquiera de los cambios a su
 * forma anterior, la comprobacion correspondiente se pone roja.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n1) Red de seguridad en createJournalEntry (P0-05)\n');

const repo = fuente('src/repositories/accountingRepository.ts');
ok("importa inArray de drizzle-orm", /import \{[^}]*inArray[^}]*\} from 'drizzle-orm'/.test(repo));
ok("valida cada cuenta del asiento contra chartOfAccounts (existencia + empresa)",
  /inArray\(chartOfAccounts\.id, idsDeCuentas\)/.test(repo) && /eq\(chartOfAccounts\.companyId, data\.companyId\)/.test(repo));
ok("rechaza cuenta inactiva o borrada", /cuenta\.deletedAt \|\| cuenta\.status !== 'active'/.test(repo));
ok("rechaza cuenta de agrupacion (isTransactional false)", /!cuenta\.isTransactional/.test(repo));

console.log('\n2) Las 4 copias de getOrCreateAccount, eliminadas (P0-05)\n');

const ARCHIVOS_P0_05 = [
  'src/services/invoice/invoiceDbBooker.ts',
  'src/app/api/v1/expenses/route.ts',
  'src/app/api/v1/expenses/[id]/route.ts',
  'src/services/expenseService.ts',
];

for (const archivo of ARCHIVOS_P0_05) {
  const src = fuente(archivo);
  ok(`${archivo}: ya no define ni llama a getOrCreateAccount`, !/getOrCreateAccount\(/.test(src));
  ok(`${archivo}: importa resolverCuentaPorMapeo`, /resolverCuentaPorMapeo/.test(src) && /from '[^']*resolverCuentas'/.test(src));
}

console.log('\n3) Las cuentas del flujo de venta usan las claves corregidas (invoiceDbBooker.ts)\n');

const booker = fuente('src/services/invoice/invoiceDbBooker.ts');
ok("Cuentas por Cobrar -> 'accounts_receivable' / '1.1.02.01' (antes '1.1.02', de agrupacion)",
  /resolverCuentaPorMapeo\(tx, data\.companyId, 'accounts_receivable', '1\.1\.02\.01'/.test(booker));
ok("Efectivo -> 'cash' / '1.1.01.01' (antes '1.1.01', de agrupacion)",
  /resolverCuentaPorMapeo\(tx, data\.companyId, 'cash', '1\.1\.01\.01'/.test(booker));
ok("ITBIS por Pagar -> 'itbis_sales' / '2.1.02.01' (antes '2.1.03', codigo inexistente)",
  /resolverCuentaPorMapeo\(tx, data\.companyId, 'itbis_sales', '2\.1\.02\.01'/.test(booker));
ok("Ingresos por Ventas -> 'sales_revenue' / '4.1.01'",
  /resolverCuentaPorMapeo\(tx, data\.companyId, 'sales_revenue', '4\.1\.01'/.test(booker));

console.log('\n4) Las cuentas del flujo de compra usan las claves corregidas (los 3 archivos de expenses)\n');

for (const archivo of ['src/app/api/v1/expenses/route.ts', 'src/app/api/v1/expenses/[id]/route.ts', 'src/services/expenseService.ts']) {
  const src = fuente(archivo);
  ok(`${archivo}: Cuentas por Pagar -> 'supplier_payable' / '2.1.01.01' (antes '2.1.01', de agrupacion)`,
    /resolverCuentaPorMapeo\(tx, [a-zA-Z.]+, 'supplier_payable', '2\.1\.01\.01'/.test(src));
  ok(`${archivo}: Efectivo -> 'cash' / '1.1.01.01' (antes '1.1.01', de agrupacion)`,
    /resolverCuentaPorMapeo\(tx, [a-zA-Z.]+, 'cash', '1\.1\.01\.01'/.test(src));
  ok(`${archivo}: Costo de Ventas -> 'cost_of_goods_sold' / '5.1.01'`,
    /resolverCuentaPorMapeo\(tx, [a-zA-Z.]+, 'cost_of_goods_sold', '5\.1\.01'/.test(src));
}

console.log('\n5) expenses/[id]/route.ts -- revierte en vez de borrar, y bloquea periodo cerrado (P0-07)\n');

const expId = fuente('src/app/api/v1/expenses/[id]/route.ts');
ok("define revertirAsientoContable (asiento de reversion, no borrado)", /async function revertirAsientoContable\(/.test(expId));
ok("la reversion invierte debe y haber de cada linea original",
  /debit: parseFloat\(l\.credit\) \|\| 0,\s*credit: parseFloat\(l\.debit\) \|\| 0,/.test(expId));
ok("ya no queda ningun borrado fisico de journalEntries/journalEntryLines",
  !/\.delete\(journalEntries\)/.test(expId) && !/\.delete\(journalEntryLines\)/.test(expId));

const bloquesIsPeriodOpen = (expId.match(/AccountRepository\.isPeriodOpen\(session\.companyId, [a-zA-Z0-9_.\[\]]+\.issueDate, session\.modo, tx\)/g) || []).length;
ok("DELETE y PUT comprueban isPeriodOpen contra la fecha guardada de la compra (2 sitios)", bloquesIsPeriodOpen >= 2, `encontrado ${bloquesIsPeriodOpen} vez(es)`);

const insertsAuditoria = (expId.match(/tx\.insert\(auditLogs\)\.values\(/g) || []).length;
ok("DELETE y PUT registran auditLogs con el estado previo ANTES de mutar (2 sitios)", insertsAuditoria >= 2, `encontrado ${insertsAuditoria} vez(es)`);

ok("el listado GET ordena por fecha de creacion para no devolver un asiento antiguo tras varias ediciones",
  /orderBy\(desc\(journalEntries\.createdAt\)\)/.test(expId));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
