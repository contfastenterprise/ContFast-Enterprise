/**
 * Lote 304, contra una base -- la antiguedad de saldos y las demas fuentes de CxC/CxP dan LAS MISMAS
 * cifras, y son las de los documentos.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado. Siembra documentos con
 * cada caso del lote -- una factura rechazada y una dada de baja con su CxC viva, un vencimiento
 * pactado distinto del de la CxC, un pago parcial, una que vence hoy, dos clientes con el mismo
 * nombre, una de PRUEBA, una CxP de una compra borrada -- y ejecuta las consultas de verdad:
 * `CarteraRepository` (la antiguedad y su estado de cuenta), `ArRepository.getPendingAR` (Cuentas
 * por Cobrar), `FinancialRepository.getCustomerStatement` (estado de cuenta del cliente) y
 * `getFinancialDashboard` (panel financiero).
 *
 * Se ejecuta con: powershell -File scratch/bancos_db/base_desechable.ps1 -Accion correr -Bancos verificar_antiguedad_de_saldos_db.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { CarteraRepository } from '../src/repositories/carteraRepository';
import { ArRepository } from '../src/repositories/arRepository';
import { FinancialRepository } from '../src/repositories/financialRepository';
import { repartirEnTramos } from '../src/services/cartera/vencimiento';
import { diaRD } from '../src/utils/fechasLocales';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const C1 = '30400000-0000-4000-8000-0000000000c1';
const C2 = '30400000-0000-4000-8000-0000000000c2';
const S1 = '30400000-0000-4000-8000-0000000000a1';

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const exige = (t: string, c: boolean) => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}`); console.log(`  pre   ${t}`); };
const q = async <T>(s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as T[];
/** Cada consulta en su `try`: una que lanza es una FALLA de su comprobacion, no un banco reventado. */
async function intenta(t: string, f: () => Promise<boolean>, d?: () => string) {
  try { const r = await f(); ok(t, r, r ? '' : d?.() ?? ''); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
}
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 'AAAA-MM-DD' de hoy (RD) mas N dias. */
const dia = (n: number) => { const d = new Date(`${diaRD()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function factura(id: string, cliente: string, ncf: string, estado: string, pactado: string | null, modo = 'PRODUCCION') {
  const [f] = await q<{ id: string }>(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, ncf, ecf_type, total, codigo_factura, status, payment_type, payment_due_date)
    VALUES (${A}::uuid, ${modo}, ${USER}::uuid, ${cliente}::uuid, ${ncf}, '31', 1000, ${'FAC-' + id}, ${estado}, 'credit', ${pactado}::date)
    RETURNING id`);
  return f.id;
}
async function cxc(fac: string, cliente: string, monto: number, saldo: number, vence: string, modo = 'PRODUCCION') {
  await db.execute(sql`INSERT INTO accounts_receivable (company_id, modo, invoice_id, customer_id, amount, balance, due_date)
    VALUES (${A}::uuid, ${modo}, ${fac}::uuid, ${cliente}::uuid, ${monto}, ${saldo}, ${vence}::date)`);
}

async function sembrar() {
  await db.execute(sql`DELETE FROM accounts_receivable WHERE customer_id IN (${C1}::uuid, ${C2}::uuid)`);
  await db.execute(sql`DELETE FROM invoices WHERE customer_id IN (${C1}::uuid, ${C2}::uuid)`);
  await db.execute(sql`DELETE FROM customers WHERE id IN (${C1}::uuid, ${C2}::uuid)`);
  await db.execute(sql`DELETE FROM accounts_payable WHERE supplier_id = ${S1}::uuid`);
  await db.execute(sql`DELETE FROM expenses WHERE supplier_id = ${S1}::uuid`);
  await db.execute(sql`DELETE FROM suppliers WHERE id = ${S1}::uuid`);
  // Dos clientes con el MISMO nombre (y distinto RNC): no pueden mezclarse.
  await db.execute(sql`INSERT INTO customers (id, company_id, name, rnc_cedula) VALUES
    (${C1}::uuid, ${A}::uuid, 'Cliente Gemelo 304', '101304001'), (${C2}::uuid, ${A}::uuid, 'Cliente Gemelo 304', '101304002')`);

  // C1
  await cxc(await factura('F1', C1, 'E310000304001', 'accepted', dia(-10)), C1, 1000, 1000, dia(20)); // pactada vencio hace 10; la CxC dice +20
  await cxc(await factura('F2', C1, 'E310000304002', 'rejected', dia(5)), C1, 500, 500, dia(5));        // rechazada: NO es deuda
  await cxc(await factura('F3', C1, 'E310000304003', 'void', dia(5)), C1, 300, 300, dia(-60));           // dada de baja: NO es deuda
  await cxc(await factura('F4', C1, 'E310000304004', 'submitted', null), C1, 800, 200, dia(-40));      // sin pactada; pago parcial; 40 dias
  await cxc(await factura('F5', C1, 'E310000304005', 'accepted', dia(0)), C1, 150, 150, dia(30));       // vence HOY: no esta vencida
  await cxc(await factura('F6', C1, 'E310000304006', 'accepted', dia(-100), 'PRUEBA'), C1, 999, 999, dia(-100), 'PRUEBA'); // otro modo
  // C2
  await cxc(await factura('G1', C2, 'E310000304011', 'accepted', dia(-1)), C2, 700, 700, dia(29));      // vencio ayer
  await cxc(await factura('G2', C2, 'E310000304012', 'accepted', dia(-50)), C2, 400, 0, dia(-50));      // saldada

  // Suplidor: una CxP viva vencida hace 5 dias y otra de una compra BORRADA.
  await db.execute(sql`INSERT INTO suppliers (id, company_id, name) VALUES (${S1}::uuid, ${A}::uuid, 'Suplidor 304')`);
  const [viva] = await q<{ id: string }>(sql`INSERT INTO expenses (company_id, modo, supplier_id, expense_type, issue_date, amount, itbis, payment_method, ncf)
    VALUES (${A}::uuid, 'PRODUCCION', ${S1}::uuid, '01', ${dia(-35)}::date, 600, 0, '04', 'B0100304001') RETURNING id`);
  const [borrada] = await q<{ id: string }>(sql`INSERT INTO expenses (company_id, modo, supplier_id, expense_type, issue_date, amount, itbis, payment_method, ncf, deleted_at)
    VALUES (${A}::uuid, 'PRODUCCION', ${S1}::uuid, '01', ${dia(-35)}::date, 400, 0, '04', 'B0100304002', now()) RETURNING id`);
  await db.execute(sql`INSERT INTO accounts_payable (company_id, modo, supplier_id, expense_id, amount, balance, due_date) VALUES
    (${A}::uuid, 'PRODUCCION', ${S1}::uuid, ${viva.id}::uuid, 600, 600, ${dia(-5)}::date),
    (${A}::uuid, 'PRODUCCION', ${S1}::uuid, ${borrada.id}::uuid, 400, 400, ${dia(-5)}::date)`);
}

async function main() {
  console.log('\n0) Precondiciones\n');
  exige('la empresa A y su usuario existen', (await q(sql`SELECT 1 FROM users WHERE id = ${USER}::uuid AND company_id = ${A}::uuid`)).length === 1);
  await sembrar();
  exige('sembradas 7 CxC de PRODUCCION y 1 de PRUEBA', (await q<{ n: number }>(sql`SELECT count(*)::int n FROM accounts_receivable WHERE customer_id IN (${C1}::uuid, ${C2}::uuid) AND modo = 'PRODUCCION'`))[0].n === 7);
  const hoy = diaRD();

  // Lo esperado, documento a documento (lo que dice la factura, no la tabla de CxC):
  //   C1: F1 1000 (10 dias, 1-30) + F4 200 (40 dias, 31-60) + F5 150 (vence hoy) = 1350, nivel alto
  //   C2: G1 700 (1 dia, 1-30), nivel medio
  //   S1: 600 (5 dias, 1-30)
  const ESPERADO: Record<string, { saldo: number; atraso: number; tramos: Record<string, number> }> = {
    [C1]: { saldo: 1350, atraso: 40, tramos: { 'por-vencer': 150, '1-30': 1000, '31-60': 200, '61-90': 0, '90+': 0 } },
    [C2]: { saldo: 700, atraso: 1, tramos: { 'por-vencer': 0, '1-30': 700, '31-60': 0, '61-90': 0, '90+': 0 } },
  };
  const cuadra = (t: AnyRec | undefined, e: Record<string, number>) => !!t && Object.keys(e).every((k) => Math.abs((t[k] ?? -1) - e[k]) < 0.005);

  console.log('\n1) La antiguedad de saldos (CarteraRepository.resumen)\n');
  let resumen: AnyRec[] = [];
  try { resumen = (await CarteraRepository.resumen(A, 'PRODUCCION', 'clientes')) as AnyRec[]; } catch (e) { console.log('  lanzo:', (e as Error).message); }
  const fila = (id: string) => resumen.find((f) => f.id === id);
  ok('C1 debe 1.350: sin la RECHAZADA (500), sin la dada de BAJA (300) y sin la de PRUEBA (999)', fila(C1)?.saldo === 1350, String(fila(C1)?.saldo));
  ok('  sus tramos son los de cada documento con el vencimiento PACTADO', cuadra(fila(C1)?.tramos, ESPERADO[C1].tramos), JSON.stringify(fila(C1)?.tramos));
  ok('  40 dias de atraso (la cuota mas atrasada), riesgo alto, 3 documentos', fila(C1)?.diasAtraso === 40 && fila(C1)?.nivelRiesgo === 'alto' && fila(C1)?.documentosPendientes === 3,
    `${fila(C1)?.diasAtraso} ${fila(C1)?.nivelRiesgo} ${fila(C1)?.documentosPendientes}`);
  ok('C2 (mismo nombre, otro cliente) va aparte: 700, 1 dia, riesgo medio, todo en 1-30',
    fila(C2)?.saldo === 700 && fila(C2)?.diasAtraso === 1 && fila(C2)?.nivelRiesgo === 'medio' && cuadra(fila(C2)?.tramos, ESPERADO[C2].tramos),
    JSON.stringify(fila(C2) && { s: fila(C2)!.saldo, d: fila(C2)!.diasAtraso, t: fila(C2)!.tramos }));

  console.log('\n2) Las demas fuentes dan lo mismo\n');
  await intenta('Cuentas por Cobrar (getPendingAR): los mismos saldos por cliente', async () => {
    const p = (await ArRepository.getPendingAR(A, 'PRODUCCION')) as AnyRec[];
    return [C1, C2].every((id) => Math.abs((p.find((x) => x.customerId === id)?.totalBalance ?? -1) - ESPERADO[id].saldo) < 0.005);
  });
  await intenta('Cuentas por Cobrar (getPendingAR): sus vencimientos dan los mismos tramos que la antiguedad', async () => {
    const p = (await ArRepository.getPendingAR(A, 'PRODUCCION')) as AnyRec[];
    return [C1, C2].every((id) => cuadra(repartirEnTramos(p.find((x) => x.customerId === id)?.invoices ?? [], (x: AnyRec) => x.balance, (x: AnyRec) => x.dueDate, hoy), ESPERADO[id].tramos));
  });
  await intenta('estado de cuenta del cliente (FinancialRepository): mismo saldo pendiente y mismos tramos', async () => {
    const e = (await FinancialRepository.getCustomerStatement(A, 'PRODUCCION', C1)) as AnyRec;
    const ag = e.aging ?? {};
    const pendiente = (e.pendingInvoices ?? []).reduce((s: number, x: AnyRec) => s + Number(x.balance), 0);
    return Math.abs(pendiente - 1350) < 0.005 && ag.notExpired === 150 && ag.overdue1to30 === 1000 && ag.overdue31to60 === 200;
  });
  await intenta('panel financiero: total por cobrar y vencido iguales a la suma de la antiguedad (de A, sin los demas clientes de la semilla)', async () => {
    const d = (await FinancialRepository.getFinancialDashboard(A, 'PRODUCCION')) as AnyRec;
    const todos = (await CarteraRepository.resumen(A, 'PRODUCCION', 'clientes')) as AnyRec[];
    const total = todos.reduce((s, f) => s + f.saldo, 0);
    const vencido = todos.reduce((s, f) => s + f.tramos['1-30'] + f.tramos['31-60'] + f.tramos['61-90'] + f.tramos['90+'], 0);
    return Math.abs(d.cxc.totalPending - total) < 0.005 && Math.abs(d.cxc.totalOverdue - vencido) < 0.005 && total >= 2050;
  });
  await intenta('el estado de cuenta de la antiguedad (detalle): 3 documentos, con 10, 40 y 0 dias', async () => {
    const d = (await CarteraRepository.detalle(A, 'PRODUCCION', 'clientes', C1)) as AnyRec[];
    return d.length === 3 && JSON.stringify(d.map((x) => x.diasAtraso).sort((a, b) => a - b)) === JSON.stringify([0, 10, 40]);
  });
  await intenta('el estado de cuenta por NCF (el impreso): las mismas 3 partidas y el mismo saldo', async () => {
    const d = (await CarteraRepository.estadoPorNcf(A, 'PRODUCCION', 'clientes', C1)) as AnyRec[];
    return d.length === 3 && Math.abs(d.reduce((s, x) => s + x.saldo, 0) - 1350) < 0.005 && d.some((x) => x.diasAtraso === 10);
  });

  console.log('\n3) Suplidores\n');
  await intenta('la CxP de una compra BORRADA no es deuda: el suplidor debe 600, con 5 dias en 1-30', async () => {
    const s = ((await CarteraRepository.resumen(A, 'PRODUCCION', 'suplidores')) as AnyRec[]).find((f) => f.id === S1);
    return !!s && s.saldo === 600 && s.diasAtraso === 5 && s.tramos['1-30'] === 600;
  });

  console.log('\n4) Lo que no cambia (invariantes)\n');
  invariante('la tabla de CxC sigue guardando las 7 cuentas (el lote no toca datos)',
    (await q<{ n: number }>(sql`SELECT count(*)::int n FROM accounts_receivable WHERE customer_id IN (${C1}::uuid, ${C2}::uuid) AND modo = 'PRODUCCION' AND deleted_at IS NULL`))[0].n === 7);
  invariante('la rechazada sigue con su saldo en la CxC (se da de baja desde e-CF, lote 140)',
    (await q<{ b: string }>(sql`SELECT ar.balance b FROM accounts_receivable ar JOIN invoices i ON i.id = ar.invoice_id WHERE i.ncf = 'E310000304002'`))[0]?.b === '500.00');

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S), ${rotas} invariante(s) rota(s)`}`);
  setTimeout(() => process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1), 300);
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
