/**
 * Lote 170, contra una base -- la compra por banco no acredita la caja.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado.
 * Y aqui se EJECUTAN las tres rutas de verdad (POST, PUT, DELETE de
 * `/api/v1/expenses`), no se leen: lo que hay que demostrar es que el asiento
 * acredita el banco elegido, que su libro recibe el retiro y -- lo que ningun
 * banco de solo codigo puede demostrar -- que editar mueve **solo la
 * diferencia** y cambiar de banco le devuelve el dinero al anterior.
 *
 * Las rutas se llaman con las cabeceras internas firmadas (`INTERNAL_API_KEY`),
 * que es el camino que `verifyAuth` ya tiene para el proxy. Sin eso habria que
 * inventar una sesion, y una sesion inventada no comprueba la ruta: comprueba
 * el invento.
 *
 * La REGLA (que se exige, que se rechaza y con que mensaje) va en
 * `verificar_origen_de_compra.ts`, sin base de datos.
 */
// `middleware/auth.ts` exige estos secretos al cargarse (no al usarse): sin
// ellos, importar la ruta revienta. Aqui no se firma ningun JWT -- la sesion
// entra por las cabeceras internas --, pero el modulo tiene que poder cargar.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-170-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-170-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-170';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { limpiar as limpiarTodo } from './_limpieza';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const SUP = 'ffff0000-0000-0000-0000-0000000000d1';
const POPULAR = 'ffff0000-0000-0000-0000-0000000000d2';
const RESERVAS = 'ffff0000-0000-0000-0000-0000000000d3';
const AJENO = 'ffff0000-0000-0000-0000-0000000000d4';
const CAJA = 'ffff0000-0000-0000-0000-0000000000d5';
const SESION = 'ffff0000-0000-0000-0000-0000000000d6';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const exige = (t: string, c: boolean, d = '') => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`); console.log(`  pre   ${t}`); };
const uno = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as Record<string, unknown>[])[0];
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
const cuenta = async (code: string) => (await uno(sql`SELECT id FROM chart_of_accounts WHERE company_id = ${A}::uuid AND code = ${code}`)).id as string;

const cabeceras = () => ({
  'content-type': 'application/json',
  'x-user-id': USER,
  'x-company-id': A,
  'x-user-role': 'sistemas',
  'x-role-id': ROL,
  'x-environment': 'PRODUCCION',
  'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
});

/** El saldo del banco en este entorno. */
const saldo = async (banco: string) => Number((await uno(sql`
  SELECT balance FROM bank_account_balances WHERE bank_account_id = ${banco}::uuid AND modo = 'PRODUCCION'`))?.balance ?? NaN);

/** Los movimientos del libro de ese banco, del mas viejo al mas nuevo. */
const libro = async (banco: string) => await todas(sql`
  SELECT type, amount::text AS amount, status, reference FROM bank_transactions
   WHERE bank_account_id = ${banco}::uuid ORDER BY created_at, id`);

/** Lo que una compra dejo en el HABER de una cuenta, sumando todos sus asientos. */
const acreditado = async (expenseId: string, cuentaId: string) => Number((await uno(sql`
  SELECT COALESCE(SUM(jel.credit - jel.debit), 0) AS n
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE jel.account_id = ${cuentaId}::uuid
     AND (je.reference = ${expenseId} OR je.reference IN (
           SELECT id::text FROM journal_entries WHERE reference = ${expenseId}))`)).n);

const esperadoCaja = async () => Number((await uno(sql`SELECT expected_balance FROM cash_sessions WHERE id = ${SESION}::uuid`)).expected_balance);

/** La cuenta de gasto del debe; se resuelve en `main` y no cambia en todo el banco. */
let ctaGasto = '';

const cuerpo = (extra: Record<string, unknown>) => ({
  supplierId: SUP, isMinorExpense: false, expenseType: '02', issueDate: '2026-09-10',
  amount: 1000, itbis: 180, description: 'Compra de prueba', isGeneralAmount: true,
  debitAccountId: ctaGasto, lines: [], ...extra,
});

let POST!: (req: NextRequest) => Promise<Response>;
let PUT!: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let DELETE!: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const alta = async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('http://localhost/api/v1/expenses', {
    method: 'POST', headers: cabeceras(), body: JSON.stringify(body),
  }));
  return { estado: res.status, cuerpo: await res.json() as { success?: boolean; data?: { id: string }; error?: { message: string } } };
};

const editar = async (id: string, body: Record<string, unknown>) => {
  const res = await PUT(new NextRequest(`http://localhost/api/v1/expenses/${id}`, {
    method: 'PUT', headers: cabeceras(), body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
  return { estado: res.status, cuerpo: await res.json() as { success?: boolean; error?: { message: string } } };
};

const borrar = async (id: string) => {
  const res = await DELETE(new NextRequest(`http://localhost/api/v1/expenses/${id}`, {
    method: 'DELETE', headers: cabeceras(),
  }), { params: Promise.resolve({ id }) });
  return { estado: res.status, cuerpo: await res.json() as { success?: boolean; error?: { message: string } } };
};

async function main() {
  const rutaAlta = await import('../src/app/api/v1/expenses/route');
  const rutaId = await import('../src/app/api/v1/expenses/[id]/route');
  POST = rutaAlta.POST as typeof POST;
  PUT = rutaId.PUT as typeof PUT;
  DELETE = rutaId.DELETE as typeof DELETE;

  console.log('\n0) Precondiciones\n');
  exige('las tres rutas existen', typeof POST === 'function' && typeof PUT === 'function' && typeof DELETE === 'function');
  exige('la tabla expenses admite el origen (migracion 0011 aplicada)',
    (await todas(sql`SELECT column_name FROM information_schema.columns
                      WHERE table_name = 'expenses' AND column_name IN ('payment_account_id','bank_account_id')`)).length === 2);

  await limpiarTodo(['cash_registers', 'bank_accounts', 'bank_account_balances']);
  const ctaPopular = await cuenta('1.1.01.02');
  const ctaReservas = await cuenta('1.1.01.03');
  const ctaCaja = await cuenta('1.1.01.01');
  const ctaTarjeta = await cuenta('2.1.01.02');   // Otras Cuentas por Pagar: pasivo transaccional
  const ctaNoPasivo = await cuenta('1.1.03.01');  // Inventario: activo, sirve de contraejemplo
  const ctaAgrupacion = await cuenta('1.1.01');   // Efectivo en Caja y Bancos: agrupacion
  ctaGasto = await cuenta('5.1.01');              // Costo de Ventas: el debe de la compra

  await db.execute(sql`INSERT INTO suppliers (id, company_id, name) VALUES (${SUP}::uuid, ${A}::uuid, 'Suplidor Banco')`);
  await db.execute(sql`INSERT INTO bank_accounts (id, company_id, bank_name, account_number, balance, chart_account_id) VALUES
    (${POPULAR}::uuid, ${A}::uuid, 'Popular', '111', 100000, ${ctaPopular}::uuid),
    (${RESERVAS}::uuid, ${A}::uuid, 'Reservas', '222', 100000, ${ctaReservas}::uuid),
    (${AJENO}::uuid, ${B}::uuid, 'Ajeno', '333', 100000, NULL)`);
  await db.execute(sql`INSERT INTO cash_registers (id, company_id, name, code) VALUES (${CAJA}::uuid, ${A}::uuid, 'Caja 1', 'C1')`);
  await db.execute(sql`INSERT INTO cash_sessions (id, company_id, modo, cash_register_id, user_id, status, initial_balance, expected_balance)
    VALUES (${SESION}::uuid, ${A}::uuid, 'PRODUCCION', ${CAJA}::uuid, ${USER}::uuid, 'open', 5000, 5000)`);

  console.log('\n1) Una compra con cheque/transferencia sale del BANCO, no de la caja\n');
  // Ojo al escribir estas comprobaciones: "la compra se registra" es verdad
  // ANTES del lote tambien (antes se registraba, solo que contra la caja), asi
  // que sola seria un OK regalado en la contraprueba. Va unida a DONDE quedo.
  const c1 = await alta(cuerpo({ ncf: 'B0100000801', paymentMethod: '02', bankAccountId: POPULAR }));
  const id1 = c1.cuerpo.data?.id ?? '00000000-0000-0000-0000-000000000000';
  ok('la compra se registra y su asiento acredita la cuenta del BANCO por el total (1.180)',
    c1.estado === 200 && (await acreditado(id1, ctaPopular)) === 1180,
    `${c1.estado} ${await acreditado(id1, ctaPopular)}`);
  ok('  y NO acredita la Caja General', c1.estado === 200 && (await acreditado(id1, ctaCaja)) === 0, String(await acreditado(id1, ctaCaja)));
  const g1 = await uno(sql`SELECT payment_account_id, bank_account_id FROM expenses WHERE id = ${id1}::uuid`);
  ok('la compra GUARDA de donde salio', g1.payment_account_id === ctaPopular && g1.bank_account_id === POPULAR, JSON.stringify(g1));
  ok('el saldo del banco baja 1.180', (await saldo(POPULAR)) === 98820, String(await saldo(POPULAR)));
  const l1 = await libro(POPULAR);
  ok('su libro tiene el retiro, PENDIENTE de conciliar',
    l1.length === 1 && l1[0].type === 'withdrawal' && l1[0].amount === '1180.00' && l1[0].status === 'pending', JSON.stringify(l1));
  ok('  referido al NCF de la compra', String(l1[0]?.reference) === 'COM-B0100000801', String(l1[0]?.reference));
  // Unida al banco: que la caja no se mueva era cierto antes del lote tambien
  // (el metodo 02 nunca toco la sesion). Lo que este lote añade es que el
  // dinero aparezca en el banco EN VEZ de en la caja.
  ok('la sesion de caja no se entera: el dinero salio del banco, no de la caja',
    (await esperadoCaja()) === 5000 && (await saldo(POPULAR)) === 98820, `caja ${await esperadoCaja()} / banco ${await saldo(POPULAR)}`);

  console.log('\n2) Sin decir de donde sale, la compra NO se registra\n');
  const antes = Number((await uno(sql`SELECT count(*)::int AS n FROM expenses`)).n);
  const c2 = await alta(cuerpo({ ncf: 'B0100000802', paymentMethod: '02' }));
  ok('una compra 02 sin banco se niega con 400', c2.estado === 400, `${c2.estado} ${c2.cuerpo.error?.message}`);
  ok('  y no deja nada escrito', Number((await uno(sql`SELECT count(*)::int AS n FROM expenses`)).n) === antes);
  const c3 = await alta(cuerpo({ ncf: 'B0100000803', paymentMethod: '02', bankAccountId: AJENO }));
  ok('un banco de OTRA empresa se niega', c3.estado === 400, `${c3.estado} ${c3.cuerpo.error?.message}`);
  ok('  sin tocar el saldo de nadie', (await saldo(POPULAR)) === 98820 && (await saldo(RESERVAS)).toString() === 'NaN');
  const c4 = await alta(cuerpo({ ncf: 'B0100000804', paymentMethod: '03', paymentAccountId: ctaNoPasivo }));
  ok('una tarjeta contra una cuenta que no es pasivo se niega', c4.estado === 400, `${c4.estado} ${c4.cuerpo.error?.message}`);
  const c5 = await alta(cuerpo({ ncf: 'B0100000805', paymentMethod: '03', paymentAccountId: ctaAgrupacion }));
  ok('una tarjeta contra una cuenta de agrupacion se niega', c5.estado === 400, `${c5.estado} ${c5.cuerpo.error?.message}`);

  console.log('\n3) La tarjeta de credito no es un banco: se DEBE\n');
  const c6 = await alta(cuerpo({ ncf: 'B0100000806', paymentMethod: '03', paymentAccountId: ctaTarjeta }));
  const id6 = c6.cuerpo.data?.id ?? '00000000-0000-0000-0000-000000000000';
  ok('la compra con tarjeta de credito se registra y acredita la cuenta POR PAGAR de la tarjeta',
    c6.estado === 200 && (await acreditado(id6, ctaTarjeta)) === 1180, `${c6.estado} ${await acreditado(id6, ctaTarjeta)}`);
  ok('  y no la caja', c6.estado === 200 && (await acreditado(id6, ctaCaja)) === 0);
  ok('ningun banco se mueve (una tarjeta de credito no es un banco)', (await libro(POPULAR)).length === 1);

  console.log('\n4) El efectivo sigue yendo a la caja (lote 169 intacto)\n');
  // Todo esto era cierto antes del lote: va unido a que la compra por banco
  // NO haga lo mismo, que es justo la distincion que el lote introduce.
  const c7 = await alta(cuerpo({ ncf: 'B0100000807', paymentMethod: '01', amount: 100, itbis: 0 }));
  const id7 = c7.cuerpo.data?.id ?? '00000000-0000-0000-0000-000000000000';
  ok('la compra en efectivo acredita la Caja General, y la del banco no',
    c7.estado === 200 && (await acreditado(id7, ctaCaja)) === 100 && (await acreditado(id1, ctaCaja)) === 0,
    `${await acreditado(id7, ctaCaja)} / ${await acreditado(id1, ctaCaja)}`);
  ok('y solo ella baja la sesion de caja (100)', (await esperadoCaja()) === 4900 && (await saldo(POPULAR)) === 98820, String(await esperadoCaja()));
  ok('el banco no se entera de una compra en efectivo', (await libro(POPULAR)).length === 1);

  console.log('\n5) Editar mueve SOLO la diferencia\n');
  const e1 = await editar(id1, cuerpo({ ncf: 'B0100000801', paymentMethod: '02', bankAccountId: POPULAR, description: 'Mismo importe, otro texto' }));
  ok('editar sin cambiar el importe se acepta y no mueve el banco ni un centavo',
    e1.estado === 200 && (await saldo(POPULAR)) === 98820, `${e1.estado} ${await saldo(POPULAR)}`);
  ok('  ni añade un movimiento al libro', (await libro(POPULAR)).length === 1, String((await libro(POPULAR)).length));

  const e2 = await editar(id1, cuerpo({ ncf: 'B0100000801', paymentMethod: '02', bankAccountId: POPULAR, amount: 2000, itbis: 360 }));
  ok('subir la compra a 2.360 se acepta y el saldo baja solo lo que subio (1.180 mas)',
    e2.estado === 200 && (await saldo(POPULAR)) === 97640, `${e2.estado} ${await saldo(POPULAR)}`);
  const l2 = await libro(POPULAR);
  ok('  con un segundo retiro por la DIFERENCIA, no por el total',
    l2.length === 2 && l2[1].type === 'withdrawal' && l2[1].amount === '1180.00', JSON.stringify(l2.map(m => `${m.type} ${m.amount}`)));
  ok('el mayor del banco queda acreditado por el importe nuevo', (await acreditado(id1, ctaPopular)) === 2360, String(await acreditado(id1, ctaPopular)));

  console.log('\n6) Cambiar de banco le devuelve el dinero al anterior\n');
  const e3 = await editar(id1, cuerpo({ ncf: 'B0100000801', paymentMethod: '02', bankAccountId: RESERVAS, amount: 2000, itbis: 360 }));
  ok('cambiar de banco se acepta y el banco viejo vuelve a su saldo',
    e3.estado === 200 && (await saldo(POPULAR)) === 100000, `${e3.estado} ${await saldo(POPULAR)}`);
  const l3 = await libro(POPULAR);
  ok('  con un deposito por lo que se le habia sacado',
    l3.length === 3 && l3[2].type === 'deposit' && l3[2].amount === '2360.00', JSON.stringify(l3.map(m => `${m.type} ${m.amount}`)));
  ok('el banco nuevo carga con la compra', (await saldo(RESERVAS)) === 97640, String(await saldo(RESERVAS)));
  const lr = await libro(RESERVAS);
  ok('  con su retiro pendiente', lr.length === 1 && lr[0].type === 'withdrawal' && lr[0].amount === '2360.00', JSON.stringify(lr.map(m => `${m.type} ${m.amount}`)));
  // El "queda a cero" es verdad de balde si nunca se le cargo nada: va unido a
  // que el nuevo SI cargue con los 2.360.
  ok('en el mayor, el banco viejo queda a cero por esta compra y el nuevo carga los 2.360',
    (await acreditado(id1, ctaPopular)) === 0 && (await acreditado(id1, ctaReservas)) === 2360,
    `viejo ${await acreditado(id1, ctaPopular)} / nuevo ${await acreditado(id1, ctaReservas)}`);

  console.log('\n7) Borrar devuelve el dinero al banco\n');
  const d1 = await borrar(id1);
  ok('la compra se borra y el banco recupera los 2.360',
    d1.estado === 200 && (await saldo(RESERVAS)) === 100000, `${d1.estado} ${await saldo(RESERVAS)}`);
  const lr2 = await libro(RESERVAS);
  ok('  con un deposito en su libro', lr2.length === 2 && lr2[1].type === 'deposit' && lr2[1].amount === '2360.00', JSON.stringify(lr2.map(m => `${m.type} ${m.amount}`)));
  ok('  y la sesion de caja no se movio por nada de esto (solo por la compra en efectivo)',
    (await esperadoCaja()) === 4900 && (await saldo(RESERVAS)) === 100000, String(await esperadoCaja()));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
