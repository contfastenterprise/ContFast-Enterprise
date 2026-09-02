/**
 * Los informes que salen HACIA FUERA mezclaban PRODUCCION y PRUEBA.
 *
 * `modo` tiene DEFAULT 'PRODUCCION' en las 40 tablas que lo tienen, asi que
 * omitirlo en un WHERE nunca da error: simplemente entran las filas de los dos
 * entornos. En un listado de pantalla eso es molesto. En estos seis sitios es
 * otra cosa:
 *
 *   606 y su TXT          declaracion de compras a la DGII
 *   607 TXT               declaracion de ventas a la DGII
 *   libro de ventas       el equivalente del 607 en pantalla
 *   estado de resultados  presentado como oficial
 *   balance general       idem
 *   reports/pdf           los seis PDF: resultados, balance, estados de cuenta
 *                         de cliente y suplidor, y ventas contra compras
 *
 * Una factura emitida practicando en el entorno de pruebas entraba en el fichero
 * que se remite a la DGII con su NCF y su monto, indistinguible de una real.
 *
 * El banco monta una empresa con un documento en cada entorno y comprueba las
 * dos mitades: que el de PRUEBA no sale en PRODUCCION, y que estando en PRUEBA
 * si se ve (el entorno de practicas tiene que servir para practicar).
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { ReportRepository } from '../src/repositories/reportRepository';
import { getExpenses, generate606Txt } from '../src/services/expenseService';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const CLIENTE = 'ffffffff-0000-0000-0000-000000000001';
const SUPLIDOR = 'ffffffff-0000-0000-0000-000000000002';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);
  // Las lineas cuelgan de la factura por clave foranea: van primero. Otro banco
  // puede haber dejado lineas sembradas, y este tiene que poder correr igual.

  await db.execute(sql`
    INSERT INTO customers (id, company_id, name, rnc_cedula) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente Uno', '101010101')
    ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`
    INSERT INTO suppliers (id, company_id, name, rnc) VALUES (${SUPLIDOR}::uuid, ${A}::uuid, 'Suplidor Uno', '202020202')
    ON CONFLICT (id) DO NOTHING`);

  // Una factura real y una de practicas, el mismo dia.
  //
  // La fecha va EXPLICITA, y no es un detalle: sin ella `created_at` tomaba
  // `now()`, y el apartado 4 consulta la ventana fija '2026-08-01'..'2026-08-31'.
  // El banco pasaba en agosto y empezo a fallar solo el 1 de septiembre, sin
  // que nadie tocara nada -- el gasto si llevaba fecha explicita y por eso
  // seguia apareciendo, lo que hacia parecer que el fallo era de las ventas.
  // Un banco que depende del calendario no comprueba lo que dice comprobar.
  const facturas = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, ncf, ecf_type, subtotal, total_taxes, total, codigo_factura, status, created_at)
    VALUES
      (${A}::uuid, 'PRODUCCION', ${USER_A}::uuid, ${CLIENTE}::uuid, 'E310000000001', '31', 10000, 1800, 11800, 'FAC-REAL', 'issued', '2026-08-10 10:00:00'),
      (${A}::uuid, 'PRUEBA',     ${USER_A}::uuid, ${CLIENTE}::uuid, 'E310000000999', '31',   500,   90,   590, 'FAC-PRUEBA', 'issued', '2026-08-10 10:00:00')
    RETURNING id, modo
  `)) as unknown as { id: string; modo: string }[];
  const facReal = facturas.find((f) => f.modo === 'PRODUCCION')!.id;
  const facPrueba = facturas.find((f) => f.modo === 'PRUEBA')!.id;

  // Un gasto real y uno de practicas, en el mismo mes.
  await db.execute(sql`
    INSERT INTO expenses (company_id, modo, supplier_id, expense_type, issue_date, amount, itbis, payment_method, ncf)
    VALUES
      (${A}::uuid, 'PRODUCCION', ${SUPLIDOR}::uuid, '01', '2026-08-10', 7000, 1260, '01', 'B0100000001'),
      (${A}::uuid, 'PRUEBA',     ${SUPLIDOR}::uuid, '01', '2026-08-11',  300,   54, '01', 'B0100000999')
  `);

  // Un asiento contabilizado en cada entorno.
  // El tipo tiene que ser 'revenue': getIncomeStatement filtra
  // type IN ('revenue', 'expense', 'cost'). Se fuerza en cada ejecucion para no
  // depender de lo que dejara una anterior.
  await db.execute(sql`DELETE FROM chart_of_accounts WHERE company_id = ${A}::uuid AND code = '4100'`);
  const cuenta = (await db.execute(sql`
    INSERT INTO chart_of_accounts (company_id, code, name, type)
    VALUES (${A}::uuid, '4100', 'Ingresos por ventas', 'revenue')
    RETURNING id`)) as unknown as { id: string }[];
  const cuentaId = cuenta[0].id;

  for (const [modo, monto] of [['PRODUCCION', 90000], ['PRUEBA', 4000]] as const) {
    const je = (await db.execute(sql`
      INSERT INTO journal_entries (company_id, modo, date, description, status)
      VALUES (${A}::uuid, ${modo}, '2026-08-15', ${'Venta ' + modo}, 'posted')
      RETURNING id`)) as unknown as { id: string }[];
    await db.execute(sql`
      INSERT INTO journal_entry_lines (company_id, modo, journal_entry_id, account_id, debit, credit)
      VALUES (${A}::uuid, ${modo}, ${je[0].id}::uuid, ${cuentaId}::uuid, 0, ${monto})`);
  }

  await db.execute(sql`
    INSERT INTO accounts_receivable (company_id, modo, invoice_id, customer_id, amount, balance, due_date)
    VALUES (${A}::uuid, 'PRODUCCION', ${facReal}::uuid,   ${CLIENTE}::uuid, 11800, 11800, '2026-09-10'),
           (${A}::uuid, 'PRUEBA',     ${facPrueba}::uuid, ${CLIENTE}::uuid,   590,   590, '2026-09-10')`);
  await db.execute(sql`
    INSERT INTO accounts_payable (company_id, modo, supplier_id, amount, balance, due_date)
    VALUES (${A}::uuid, 'PRODUCCION', ${SUPLIDOR}::uuid, 8260, 8260, '2026-09-10'),
           (${A}::uuid, 'PRUEBA',     ${SUPLIDOR}::uuid,  354,  354, '2026-09-10')`);
}

async function main() {
  await sembrar();

  console.log('\n1) El 606: compras que se declaran a la DGII\n');
  const compras = await getExpenses(A, '2026-08', 'PRODUCCION');
  ok('en PRODUCCION solo sale la compra real', compras.length === 1 && compras[0].ncf === 'B0100000001',
    JSON.stringify(compras.map((e) => e.ncf)));

  const txt = await generate606Txt(A, '2026-08', 'PRODUCCION');
  ok('el TXT no lleva el NCF de pruebas', !txt.includes('B0100000999'));
  ok('y si lleva el real (control)', txt.includes('B0100000001'));

  const enPrueba = await getExpenses(A, '2026-08', 'PRUEBA');
  ok('practicando en PRUEBA se ve la de pruebas', enPrueba.length === 1 && enPrueba[0].ncf === 'B0100000999',
    JSON.stringify(enPrueba.map((e) => e.ncf)));

  console.log('\n2) Estado de resultados y balance general\n');
  const resultados = await ReportRepository.getIncomeStatement(A, '2026-08-01', '2026-08-31', 'PRODUCCION');
  const ingresos = JSON.stringify(resultados);
  ok('los 90.000 reales estan', ingresos.includes('90000'));
  ok('los 4.000 de pruebas NO', !ingresos.includes('4000'), ingresos.slice(0, 160));

  const balance = await ReportRepository.getBalanceSheet(A, '2026-08-31', 'PRODUCCION');
  ok('el balance tampoco arrastra el asiento de pruebas', !JSON.stringify(balance).includes('4000'));

  console.log('\n3) Estados de cuenta de cliente y suplidor\n');
  const ar = await ReportRepository.getARStatement(A, CLIENTE, 'PRODUCCION');
  ok('el cliente debe una sola partida', ar.openItems.length === 1,
    JSON.stringify(ar.openItems.map((r) => r.balance)));
  ok('y el pendiente son los 11.800 reales, no 12.390', Number(ar.totalPending) === 11800,
    String(ar.totalPending));

  const ap = await ReportRepository.getAPStatement(A, SUPLIDOR, 'PRODUCCION');
  ok('al suplidor se le debe una sola partida', ap.openItems.length === 1);
  ok('y el pendiente son los 8.260 reales, no 8.614', Number(ap.totalPending) === 8260,
    String(ap.totalPending));

  // Control del otro lado: practicando en PRUEBA se ven las cifras de practicas.
  const arPrueba = await ReportRepository.getARStatement(A, CLIENTE, 'PRUEBA');
  ok('en PRUEBA el pendiente es el de practicas', Number(arPrueba.totalPending) === 590,
    String(arPrueba.totalPending));

  console.log('\n4) Ventas contra compras\n');
  const vsc = await ReportRepository.getSalesVsPurchases(A, '2026-08-01', '2026-08-31', 'PRODUCCION');
  const j = JSON.stringify(vsc);
  ok('no aparece la factura de pruebas', !j.includes('E310000000999'), j.slice(0, 200));
  ok('ni el gasto de pruebas', !j.includes('B0100000999'));
  ok('control: si aparecen los reales', j.includes('E310000000001') && j.includes('B0100000001'));

  console.log('\n5) El filtro sigue en las rutas que no se pueden invocar aqui\n');

  ok('607 TXT filtra el entorno',
    /eq\(invoices\.modo, auth\.modo\)/.test(fuente('src/app/api/v1/reports/607/txt/route.ts')));
  ok('el libro de ventas filtra el entorno',
    /eq\(invoices\.modo, auth\.modo\)/.test(fuente('src/app/api/v1/reports/sales-book/route.ts')));
  ok('el estado de resultados de pantalla filtra el entorno',
    /eq\(journalEntries\.modo, auth\.modo\)/.test(fuente('src/app/api/v1/reports/income-statement/route.ts')));
  ok('el balance general de pantalla filtra el entorno',
    /eq\(journalEntries\.modo, auth\.modo\)/.test(fuente('src/app/api/v1/reports/balance-sheet/route.ts')));

  console.log('\n6) Las herramientas de IA siguen la sesion\n');
  const tools = ['GetSalesSummaryTool', 'GetPurchasesSummaryTool', 'GetInventorySummaryTool',
                 'GetAccountingSummaryTool', 'GetCashSummaryTool', 'GetCustomerCatalogTool',
                 'GetCustomerSummaryTool', 'GetSupplierCatalogTool', 'GetSupplierSummaryTool'];
  for (const t of tools) {
    const src = fuente(`src/ai/tools/${t}.ts`);
    ok(`${t} no fija 'PRODUCCION' a mano`, !/\.modo, 'PRODUCCION'\)/.test(src));
  }
  ok('el contexto del agente transporta el modo',
    /modo: auth\.modo/.test(fuente('src/app/api/v1/ai/chat/route.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
