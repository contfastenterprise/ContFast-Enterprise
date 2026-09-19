/**
 * Lote 169, contra una base -- las salidas de efectivo pasan por la sesion.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado.
 * Ejecuta de verdad la compra (servicio), el pago a suplidor y el movimiento
 * de banco, y mira el esperado de la sesion de caja. El cableado de la edicion
 * y el borrado de compras (rutas) lo vigila `verificar_salidas_de_caja.ts`.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { createExpense } from '../src/services/expenseService';
import { ApService } from '../src/services/apService';
import { BankRepository } from '../src/repositories/bankRepository';

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const CAJA = 'ffff0000-0000-0000-0000-0000000000c9';
const SESION = 'ffff0000-0000-0000-0000-0000000000c8';
const SUP = 'ffff0000-0000-0000-0000-0000000000c7';
const BANCO = 'ffff0000-0000-0000-0000-0000000000c6';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const uno = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as Record<string, unknown>[])[0];
const lanza = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
const esperado = async () => Number((await uno(sql`SELECT expected_balance FROM cash_sessions WHERE id = ${SESION}::uuid`)).expected_balance);
const cuenta = async (code: string) => (await uno(sql`SELECT id FROM chart_of_accounts WHERE company_id = ${A}::uuid AND code = ${code}`)).id as string;
const base = { companyId: A, modo: 'PRODUCCION' as const, supplierId: SUP, expenseType: '02', issueDate: '2026-09-10', userId: USER_A };

async function main() {
  await limpiarTodo(['cash_registers', 'bank_accounts', 'bank_account_balances']);
  await db.execute(sql`INSERT INTO suppliers (id, company_id, name) VALUES (${SUP}::uuid, ${A}::uuid, 'Suplidor Caja')`);
  await db.execute(sql`INSERT INTO cash_registers (id, company_id, name, code) VALUES (${CAJA}::uuid, ${A}::uuid, 'Caja 1', 'C1')`);
  await db.execute(sql`INSERT INTO cash_sessions (id, company_id, modo, cash_register_id, user_id, status, initial_balance, expected_balance)
    VALUES (${SESION}::uuid, ${A}::uuid, 'PRODUCCION', ${CAJA}::uuid, ${USER_A}::uuid, 'open', 1000, 1000)`);
  await db.execute(sql`INSERT INTO bank_accounts (id, company_id, bank_name, account_number, balance, chart_account_id)
    VALUES (${BANCO}::uuid, ${A}::uuid, 'Popular', '777', 50000, ${await cuenta('1.1.01.02')}::uuid)`);

  console.log('\n1) Compras\n');
  const e1 = await createExpense({ ...base, ncf: 'B0100000901', amount: 300, itbis: 54, paymentMethod: '01' });
  ok('compra en efectivo de 354: el esperado baja de 1.000 a 646', (await esperado()) === 646, String(await esperado()));
  const m1 = await uno(sql`SELECT type, amount::text AS amount FROM cash_movements WHERE reference = ${e1.id}`);
  ok('  con su salida en la sesion, referida a la compra', m1?.type === 'cash_out' && m1?.amount === '354.00', JSON.stringify(m1));
  await createExpense({ ...base, ncf: 'B0100000902', amount: 500, paymentMethod: '04' });
  ok('compra a credito: la caja no se mueve', (await esperado()) === 646, String(await esperado()));
  // Una compra "al contado" con cheque o transferencia (02) acredita hoy la
  // CAJA en el mayor -- eso es otro defecto, anotado en el lote 169 --, pero no
  // es efectivo: no toca la sesion. Si tocara, habria que tener la caja abierta
  // para pagar por transferencia.
  await createExpense({ ...base, ncf: 'B0100000907', amount: 400, paymentMethod: '02' });
  ok('compra con cheque/transferencia (02): la caja tampoco se mueve', (await esperado()) === 646, String(await esperado()));

  console.log('\n2) Pagos a suplidor\n');
  const ap = await uno(sql`INSERT INTO accounts_payable (company_id, modo, supplier_id, amount, balance, due_date, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${SUP}::uuid, 1000, 1000, '2026-12-31', 'pending') RETURNING id`);
  const pagoBase = { companyId: A, modo: 'PRODUCCION' as const, apId: ap.id as string, debitAccountId: await cuenta('2.1.01.01'),
    paymentDate: new Date('2026-09-11'), createdBy: USER_A };
  await ApService.registerPayment({ ...pagoBase, amount: 100, paymentMethod: 'cash', creditAccountId: await cuenta('1.1.01.01') });
  ok('pago en efectivo de 100: el esperado baja a 546', (await esperado()) === 546, String(await esperado()));
  await ApService.registerPayment({ ...pagoBase, amount: 200, paymentMethod: 'transfer', creditAccountId: await cuenta('1.1.01.02'), bankAccountId: BANCO });
  ok('pago por transferencia: la caja no se mueve', (await esperado()) === 546, String(await esperado()));

  console.log('\n3) Banco contra caja\n');
  const mover = (type: 'deposit' | 'withdrawal', amount: number, contra: string) => BankRepository.registerTransaction({
    companyId: A, modo: 'PRODUCCION', bankAccountId: BANCO, date: '2026-09-12', type, amount,
    description: `prueba ${type}`, contraAccountId: contra, createdBy: USER_A,
  } as Parameters<typeof BankRepository.registerTransaction>[0]);
  await mover('deposit', 200, await cuenta('1.1.01.01'));
  ok('deposito de 200 desde la caja al banco: el esperado baja a 346', (await esperado()) === 346, String(await esperado()));
  await mover('withdrawal', 50, await cuenta('1.1.01.01'));
  ok('retiro de 50 del banco a la caja: sube a 396', (await esperado()) === 396, String(await esperado()));
  await mover('deposit', 1000, await cuenta('3.1.01'));
  ok('deposito con otra contrapartida (capital): la caja no se mueve', (await esperado()) === 396, String(await esperado()));

  console.log('\n4) Sin caja abierta\n');
  await db.execute(sql`UPDATE cash_sessions SET status = 'closed' WHERE id = ${SESION}::uuid`);
  const antes = Number((await uno(sql`SELECT count(*)::int AS n FROM expenses WHERE company_id = ${A}::uuid`)).n);
  const sinCaja = await lanza(() => createExpense({ ...base, ncf: 'B0100000903', amount: 100, paymentMethod: '01' }));
  ok('una compra en efectivo sin caja abierta se niega', !!sinCaja && /No hay una caja abierta/.test(sinCaja), String(sinCaja));
  ok('  y no deja nada escrito', Number((await uno(sql`SELECT count(*)::int AS n FROM expenses WHERE company_id = ${A}::uuid`)).n) === antes);
  // Unida a la negativa de arriba: sola es verdad de balde (una compra a
  // credito siempre se registro), y la contraprueba la daba en OK.
  const credito = await lanza(() => createExpense({ ...base, ncf: 'B0100000904', amount: 100, paymentMethod: '04' }));
  ok('  pero a credito si se registra (no toca la caja), en el mismo estado en que la de efectivo se niega',
    credito === null && !!sinCaja, String(credito));

  console.log('\n5) Que sesion\n');
  await db.execute(sql`INSERT INTO cash_sessions (company_id, modo, cash_register_id, user_id, status, initial_balance, expected_balance) VALUES
    (${A}::uuid, 'PRODUCCION', ${CAJA}::uuid, ${USER_B}::uuid, 'open', 0, 0)`);
  const ajena = await createExpense({ ...base, ncf: 'B0100000905', amount: 10, paymentMethod: '01' }).then(() => null, (e: Error) => e.message);
  const [unica] = (await db.execute(sql`SELECT expected_balance::text AS e FROM cash_sessions WHERE status = 'open'`)) as unknown as { e: string }[];
  ok('si la unica caja abierta es de otro, se usa esa (quien compra no suele ser el cajero)', ajena === null && unica.e === '-10.00', `${ajena} ${unica?.e}`);
  await db.execute(sql`INSERT INTO cash_sessions (company_id, modo, cash_register_id, user_id, status, initial_balance, expected_balance) VALUES
    (${A}::uuid, 'PRODUCCION', ${CAJA}::uuid, ${USER_B}::uuid, 'open', 0, 0)`);
  const varias = await lanza(() => createExpense({ ...base, ncf: 'B0100000906', amount: 10, paymentMethod: '01' }));
  ok('con varias abiertas y ninguna suya, se niega', !!varias && /ninguna es suya/.test(varias), String(varias));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
