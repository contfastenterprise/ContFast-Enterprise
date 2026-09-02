/**
 * Grupo G -- Libro diario, informes financieros y estados de cuenta.
 *
 * QUE ESTABA MAL
 * --------------
 * Los CUATRO informes de contabilidad leian los asientos sin mirar el entorno:
 *
 *     getJournalEntries  libro diario
 *     getLedger          mayor de una cuenta
 *     getTrialBalance    balanza de comprobacion
 *     getFinancials      balance general y estado de resultados
 *
 * Cada factura de practicas genera su asiento igual que una real. Sin filtro,
 * esos asientos entraban en la balanza y de ahi al balance general y al estado
 * de resultados -- los dos documentos con los que se toman decisiones y se
 * sustentan las declaraciones.
 *
 * Y los estados de cuenta de cliente y de suplidor, que se imprimen y se
 * entregan, incluian los movimientos de practicas dentro del saldo que se le
 * reclama al cliente.
 *
 * LO QUE SE COMPRUEBA
 * -------------------
 * No solo que los numeros salgan separados: que la balanza CUADRE en cada
 * entorno. Una balanza que no cuadra es la senal clasica de que se estan
 * sumando asientos de dos sitios distintos.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { AccountingRepository } from '../src/repositories/accountingRepository';
import { FinancialRepository } from '../src/repositories/financialRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente, crudo } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const CLIENTE = 'ffffffff-0000-0000-0000-00000000cc01';
const SUPLIDOR = 'ffffffff-0000-0000-0000-00000000cc02';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

let CAJA = '';
let VENTAS = '';

async function sembrar() {
  await limpiarTodo(['accounting_periods']);
  await db.execute(sql`DELETE FROM customers WHERE id = ${CLIENTE}::uuid`);
  await db.execute(sql`DELETE FROM suppliers WHERE id = ${SUPLIDOR}::uuid`);
  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente G')`);
  await db.execute(sql`
    INSERT INTO suppliers (id, company_id, name) VALUES (${SUPLIDOR}::uuid, ${A}::uuid, 'Suplidor G')`);
  await db.execute(sql`
    INSERT INTO accounting_periods (company_id, modo, name, start_date, end_date, status)
    VALUES (${A}::uuid, 'PRODUCCION', 'Real', '2026-01-01', '2026-12-31', 'open'),
           (${A}::uuid, 'PRUEBA', 'Practicas', '2026-01-01', '2026-12-31', 'open')`);

  const cuenta = async (code: string, name: string, tipo: string, nature: string) => {
    const r = (await db.execute(sql`
      INSERT INTO chart_of_accounts (company_id, code, name, type, nature, level, status)
      VALUES (${A}::uuid, ${code}, ${name}, ${tipo}, ${nature}, 1, 'active')
      ON CONFLICT DO NOTHING
      RETURNING id`)) as unknown as { id: string }[];
    if (r[0]) return r[0].id;
    const e = (await db.execute(sql`
      SELECT id FROM chart_of_accounts WHERE company_id = ${A}::uuid AND code = ${code}`
    )) as unknown as { id: string }[];
    return e[0].id;
  };
  CAJA = await cuenta('1.1.01', 'Efectivo en Caja y Bancos', 'asset', 'debit');
  VENTAS = await cuenta('4.1.01', 'Ingresos por Ventas', 'revenue', 'credit');
}

const asiento = (modo: 'PRODUCCION' | 'PRUEBA', monto: number, desc: string) =>
  AccountingRepository.createJournalEntry(db, {
    companyId: A,
    modo,
    date: '2026-06-15',
    reference: desc,
    description: desc,
    lines: [
      { accountId: CAJA, debit: monto, credit: 0 },
      { accountId: VENTAS, debit: 0, credit: monto },
    ],
  } as any);

const movimiento = (
  modo: 'PRODUCCION' | 'PRUEBA',
  quien: 'customer' | 'supplier',
  monto: number,
  nota: string
) => db.execute(sql`
  INSERT INTO financial_movements
    (company_id, modo, entity_type, customer_id, supplier_id, date, time, movement_type,
     document_id, document_number, origin_module, debit, credit, notes, status)
  VALUES (${A}::uuid, ${modo}, ${quien},
          ${quien === 'customer' ? CLIENTE : null}::uuid,
          ${quien === 'supplier' ? SUPLIDOR : null}::uuid,
          '2026-06-15', '10:00:00', 'invoice', gen_random_uuid(), ${nota}, 'sales',
          ${quien === 'customer' ? monto : 0}, ${quien === 'supplier' ? monto : 0},
          ${nota}, 'active')`);

async function main() {
  await sembrar();

  // Real: 10.000. Practicas: 777. Numeros que no se puedan confundir.
  await asiento('PRODUCCION', 10000, 'Venta real');
  await asiento('PRUEBA', 777, 'Venta de practicas');

  console.log('\n1) Libro diario\n');
  const diarioReal = await AccountingRepository.getJournalEntries(A, 'PRODUCCION', 100);
  const diarioPrueba = await AccountingRepository.getJournalEntries(A, 'PRUEBA', 100);
  ok('en PRODUCCION hay un solo asiento', diarioReal.length === 1, String(diarioReal.length));
  ok('y es el real', diarioReal[0]?.description === 'Venta real', String(diarioReal[0]?.description));
  ok('en PRUEBA hay uno, el de practicas', diarioPrueba.length === 1 &&
    diarioPrueba[0]?.description === 'Venta de practicas', String(diarioPrueba.length));

  console.log('\n2) Mayor de la cuenta de caja\n');
  const mayorReal = await AccountingRepository.getLedger(A, 'PRODUCCION', CAJA, '2026-01-01', '2026-12-31');
  const mayorPrueba = await AccountingRepository.getLedger(A, 'PRUEBA', CAJA, '2026-01-01', '2026-12-31');
  ok('el mayor real suma 10.000', Number(mayorReal.endingBalance) === 10000,
    String(mayorReal.endingBalance));
  ok('el de practicas suma 777', Number(mayorPrueba.endingBalance) === 777,
    String(mayorPrueba.endingBalance));
  ok('el real NO incluye los 777', Number(mayorReal.endingBalance) !== 10777,
    String(mayorReal.endingBalance));

  console.log('\n3) Balanza de comprobacion: y que CUADRE\n');
  const balReal = await AccountingRepository.getTrialBalance(A, 'PRODUCCION', '2026-01-01', '2026-12-31');
  const balPrueba = await AccountingRepository.getTrialBalance(A, 'PRUEBA', '2026-01-01', '2026-12-31');
  // Los campos se llaman `debit` y `credit`. Escribi `periodDebit` la primera
  // vez y las dos sumas daban 0: la balanza "cuadraba" (0 vs 0) sin comprobar
  // nada. Un verde falso de manual, y del mismo tipo que llevamos toda la
  // auditoria persiguiendo.
  const suma = (b: any[], campo: 'debit' | 'credit') =>
    b.reduce((t: number, r: any) => t + Number(r[campo] || 0), 0);

  ok('la balanza real mueve algo (si diera 0, el aserto de cuadre no valdria)',
    suma(balReal, 'debit') > 0, String(suma(balReal, 'debit')));
  ok('la balanza real cuadra (debe = haber)',
    Math.abs(suma(balReal, 'debit') - suma(balReal, 'credit')) < 0.01,
    `${suma(balReal, 'debit')} vs ${suma(balReal, 'credit')}`);
  ok('y suma 10.000, no 10.777', suma(balReal, 'debit') === 10000,
    String(suma(balReal, 'debit')));
  ok('la de practicas tambien cuadra',
    Math.abs(suma(balPrueba, 'debit') - suma(balPrueba, 'credit')) < 0.01,
    `${suma(balPrueba, 'debit')} vs ${suma(balPrueba, 'credit')}`);
  ok('y suma 777', suma(balPrueba, 'debit') === 777, String(suma(balPrueba, 'debit')));

  console.log('\n4) Estado de resultados\n');
  const finReal = await AccountingRepository.getFinancials(A, 'PRODUCCION', '2026-01-01', '2026-12-31');
  const finPrueba = await AccountingRepository.getFinancials(A, 'PRUEBA', '2026-01-01', '2026-12-31');
  ok('los ingresos reales son 10.000', finReal.incomeStatement.totals.revenues === 10000,
    String(finReal.incomeStatement.totals.revenues));
  ok('los de practicas, 777', finPrueba.incomeStatement.totals.revenues === 777,
    String(finPrueba.incomeStatement.totals.revenues));
  ok('el activo real es 10.000', finReal.balanceSheet.totals.assets === 10000,
    String(finReal.balanceSheet.totals.assets));

  console.log('\n5) Estados de cuenta que se imprimen y se entregan\n');
  await movimiento('PRODUCCION', 'customer', 9000, 'FAC-REAL');
  await movimiento('PRUEBA', 'customer', 55, 'FAC-PRUEBA');
  await movimiento('PRODUCCION', 'supplier', 6000, 'COMPRA-REAL');
  await movimiento('PRUEBA', 'supplier', 33, 'COMPRA-PRUEBA');

  const ecReal = await FinancialRepository.getCustomerStatement(A, 'PRODUCCION', CLIENTE);
  const ecPrueba = await FinancialRepository.getCustomerStatement(A, 'PRUEBA', CLIENTE);
  const docs = (r: any) => r.movements.map((m: any) => m.documentNumber).join(', ');
  ok('el estado real solo trae el documento real', docs(ecReal) === 'FAC-REAL', docs(ecReal));
  ok('y su saldo es 9.000', Number(ecReal.summary.currentBalance) === 9000,
    String(ecReal.summary.currentBalance));
  ok('el de practicas solo el suyo', docs(ecPrueba) === 'FAC-PRUEBA', docs(ecPrueba));
  ok('CONTROL: y su saldo es 55, no 9.055', Number(ecPrueba.summary.currentBalance) === 55,
    String(ecPrueba.summary.currentBalance));

  const esReal = await FinancialRepository.getSupplierStatement(A, 'PRODUCCION', SUPLIDOR);
  ok('el del suplidor tampoco mezcla', docs(esReal) === 'COMPRA-REAL', docs(esReal));

  console.log('\n6) El codigo: nada quedo con valor por defecto\n');
  const ar = fuente('src/repositories/accountingRepository.ts');
  ok('los cinco filtros del libro y los informes estan',
    (ar.match(/eq\(journalEntries\.modo, modo\)/g) || []).length === 5,
    String((ar.match(/eq\(journalEntries\.modo, modo\)/g) || []).length));
  const fr = fuente('src/repositories/financialRepository.ts');
  // Eran DOCE consultas sin filtrar, no dos. La primera revision solo vio las
  // que usan el array `conditions`; las otras diez tienen su propio where.
  // Dos de ellas ya estaban bien: usan withTenantMode, que aplica empresa y
  // entorno de una vez, y el escaner no lo reconocia.
  ok('las ocho consultas de movimientos financieros filtran',
    (fr.match(/eq\(financialMovements\.modo, modo\)/g) || []).length === 8,
    String((fr.match(/eq\(financialMovements\.modo, modo\)/g) || []).length));
  ok('y las de cuentas por cobrar y pagar tambien',
    (fr.match(/eq\(accountsReceivable\.modo, modo\)/g) || []).length === 2 &&
    (fr.match(/eq\(accountsPayable\.modo, modo\)/g) || []).length === 2);
  ok('el panel financiero ya no tiene entorno por defecto',
    !/modo: 'PRODUCCION' \| 'PRUEBA' = 'PRODUCCION'/.test(fr));

  for (const [nombre, r, re] of [
    ['libro diario', 'src/app/api/v1/accounting/journals/route.ts', /getJournalEntries\(session\.companyId, session\.modo/],
    ['balanza', 'src/app/api/v1/accounting/reports/trial-balance/route.ts', /getTrialBalance\(session\.companyId, session\.modo/],
    ['mayor', 'src/app/api/v1/accounting/reports/ledger/route.ts', /getLedger\(session\.companyId, session\.modo/],
    ['estados financieros', 'src/app/api/v1/accounting/reports/financials/route.ts', /getFinancials\(session\.companyId, session\.modo/],
  ] as [string, string, RegExp][]) {
    ok(`la ruta de ${nombre} pasa el entorno`, re.test(fuente(r)));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
