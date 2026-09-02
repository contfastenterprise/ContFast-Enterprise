/**
 * Grupo E -- La caja. Es el unico sitio de la auditoria donde el cruce de
 * entornos se convierte en dinero que falta fisicamente en una gaveta.
 *
 * EL FALLO PRINCIPAL: arRepository.registerReceipt
 * ------------------------------------------------
 * Al cobrar en efectivo, buscaba la sesion de caja abierta del cajero por
 * empresa y usuario, SIN el entorno. Un cobro registrado en PRUEBA encontraba
 * la sesion REAL y le insertaba un `cash_in` que le subia el saldo esperado.
 * Al cerrar, el cajero contaba el efectivo de verdad, le salia de menos, y el
 * descuadre no tenia ninguna explicacion visible: el movimiento culpable era de
 * practicas y en el arqueo aparecia como real.
 *
 * Y venia acompanado de un segundo fallo, del mismo patron silencioso que la
 * columna: `CashRepository.addMovement` sellaba `modo: data.modo || 'PRODUCCION'`.
 * arRepository no le pasaba el entorno, asi que el movimiento se guardaba como
 * REAL aunque la sesion fuese de practicas. Dos formas distintas de ensuciar el
 * mismo arqueo.
 *
 * LA CORRECCION DE RAIZ
 * ---------------------
 * El entorno de un movimiento ya no es un parametro que alguien pueda olvidar
 * o equivocar: se lee de la sesion a la que apunta. Un movimiento no puede
 * estar en un entorno distinto al de su propia caja, y ahora es estructural.
 *
 * LO QUE CAMBIA DE COMPORTAMIENTO (a proposito)
 * ---------------------------------------------
 * `openSession` comprueba la sesion duplicada dentro del entorno. Antes, tener
 * la caja real abierta impedia abrir una de practicas. Eran dos cajas
 * independientes tratadas como una sola.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { CashRepository } from '../src/repositories/cashRepository';
import { CashService } from '../src/services/cashService';
import { ArRepository } from '../src/repositories/arRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { limpiar as limpiarTodo } from './_limpieza';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const CAJERO = 'bbbbbbbb-0000-0000-0000-000000000001';
const CAJA = 'eeeeeeee-0000-0000-0000-0000000000c1';
const CLIENTE = 'ffffffff-0000-0000-0000-00000000ca01';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};


async function limpiar() {
  // El orden de borrado ya no se escribe a mano: lo deriva _limpieza.ts del
  // esquema. Ver el comentario de cabecera de ese fichero.
  await limpiarTodo(['cash_registers']);
  await db.execute(sql`DELETE FROM customers WHERE id = ${CLIENTE}::uuid`);

  await db.execute(sql`
    INSERT INTO cash_registers (id, company_id, name, code, status)
    VALUES (${CAJA}::uuid, ${A}::uuid, 'Caja 1', 'C1', 'active')`);
  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente de caja')`);
}

const saldo = async (id: string) => {
  const r = (await db.execute(sql`
    SELECT expected_balance FROM cash_sessions WHERE id = ${id}::uuid`
  )) as unknown as { expected_balance: string }[];
  return Number(r[0].expected_balance);
};

async function main() {
  await limpiar();

  console.log('\n1) Las dos cajas son independientes\n');
  const real = await CashService.openSession(CAJERO, A, 'PRODUCCION', CAJA, 1000);
  ok('el cajero abre su caja real', !!real?.id);

  // Antes esto lanzaba "Ya tiene una sesion de caja activa".
  let practicas: { id: string } | null = null;
  try {
    practicas = await CashService.openSession(CAJERO, A, 'PRUEBA', CAJA, 500);
    ok('y puede abrir la de practicas con la real abierta', !!practicas?.id);
  } catch (e: any) {
    ok('y puede abrir la de practicas con la real abierta', false, e.message);
  }

  // Pero dentro de un mismo entorno el bloqueo sigue en pie (aserto de control).
  let bloqueado = false;
  try {
    await CashService.openSession(CAJERO, A, 'PRODUCCION', CAJA, 700);
  } catch {
    bloqueado = true;
  }
  ok('CONTROL: dos sesiones reales a la vez siguen prohibidas', bloqueado);

  ok('getActiveSession en PRUEBA devuelve la de practicas',
    (await CashRepository.getActiveSession(CAJERO, A, 'PRUEBA'))?.id === practicas!.id);
  ok('y en PRODUCCION la real',
    (await CashRepository.getActiveSession(CAJERO, A, 'PRODUCCION'))?.id === real.id);

  console.log('\n2) EL FALLO: un cobro en efectivo de practicas movia la caja real\n');
  const saldoRealAntes = await saldo(real.id);
  ok('la caja real arranca en 1.000', saldoRealAntes === 1000, String(saldoRealAntes));

  // Una factura de PRUEBA con su cuenta por cobrar.
  const fac = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, ncf, ecf_type, total, codigo_factura, status)
    VALUES (${A}::uuid, 'PRUEBA', ${CAJERO}::uuid, ${CLIENTE}::uuid, 'E310000000999', '31', 300, 'FAC-PRUEBA', 'accepted')
    RETURNING id`)) as unknown as { id: string }[];
  const ar = (await db.execute(sql`
    INSERT INTO accounts_receivable (company_id, modo, invoice_id, customer_id, amount, balance, due_date)
    VALUES (${A}::uuid, 'PRUEBA', ${fac[0].id}::uuid, ${CLIENTE}::uuid, 300, 300, CURRENT_DATE)
    RETURNING id`)) as unknown as { id: string }[];

  await ArRepository.registerReceipt({
    companyId: A,
    modo: 'PRUEBA',
    customerId: CLIENTE,
    userId: CAJERO,
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'cash',
    amount: 300,
    invoicesApplied: [{ arId: ar[0].id, amountApplied: 300 }],
  });

  ok('la caja REAL sigue en 1.000, sin tocar', (await saldo(real.id)) === 1000,
    String(await saldo(real.id)));
  ok('la de practicas subio a 800', (await saldo(practicas!.id)) === 800,
    String(await saldo(practicas!.id)));

  const mov = (await db.execute(sql`
    SELECT cash_session_id, modo, amount FROM cash_movements WHERE company_id = ${A}::uuid`
  )) as unknown as { cash_session_id: string; modo: string; amount: string }[];
  ok('se escribio un solo movimiento', mov.length === 1, String(mov.length));
  ok('en la sesion de practicas', mov[0]?.cash_session_id === practicas!.id);
  ok('y sellado como PRUEBA, no como PRODUCCION', mov[0]?.modo === 'PRUEBA', mov[0]?.modo);

  console.log('\n3) El entorno del movimiento lo pone la sesion, no quien llama\n');
  ok('addMovement ya no acepta un parametro modo',
    !/modo\?: 'PRODUCCION' \| 'PRUEBA';/.test(fuente('src/repositories/cashRepository.ts')));
  ok('lo deriva de la sesion',
    /const modo = session\[0\]\.modo as 'PRODUCCION' \| 'PRUEBA';/.test(
      fuente('src/repositories/cashRepository.ts')));
  // OJO: el aserto es sobre la llamada a addMovement, no sobre el fichero
  // entero. En invoiceDbBooker quedan otros `data.modo || 'PRODUCCION'` que NO
  // son residuos: vienen de que `modo` sigue siendo opcional en los tipos de
  // entrada de la facturacion. Eso es un frente aparte, anotado en task.md.
  const booker = fuente('src/services/invoice/invoiceDbBooker.ts');
  const llamada = booker.slice(booker.indexOf('CashRepository.addMovement'));
  ok('la facturacion ya no le pasa el entorno a addMovement',
    !/modo:/.test(llamada.slice(0, llamada.indexOf('});'))));

  console.log('\n4) Un cajero en PRUEBA no alcanza la sesion real ni sabiendo su id\n');
  let rechazado = '';
  try {
    await CashService.addMovement(CAJERO, A, 'PRUEBA', real.id, 'cash_in', 50, 'intento');
  } catch (e: any) {
    rechazado = e.message;
  }
  ok('lo rechaza como no encontrada', /no encontrada/i.test(rechazado), rechazado);
  ok('CONTROL: y en PRODUCCION si la alcanza',
    !!(await CashService.addMovement(CAJERO, A, 'PRODUCCION', real.id, 'cash_in', 50, 'legitimo')));
  ok('la caja real subio a 1.050', (await saldo(real.id)) === 1050, String(await saldo(real.id)));

  console.log('\n5) El arqueo suma solo los movimientos de su entorno\n');
  const cierre = await CashService.closeSession(CAJERO, A, 'PRODUCCION', real.id, 1050);
  ok('cierra sin diferencia', Number(cierre.session.difference) === 0,
    String(cierre.session.difference));
  ok('el resumen cuenta 50 de entradas, no 350',
    Number(cierre.summary.totalCashIn) === 50, String(cierre.summary.totalCashIn));
  ok('y queda marcado como real', cierre.summary.modo === 'PRODUCCION', String(cierre.summary.modo));

  let cierreCruzado = '';
  try {
    await CashService.closeSession(CAJERO, A, 'PRODUCCION', practicas!.id, 800);
  } catch (e: any) { cierreCruzado = e.message; }
  ok('no se puede cerrar la de practicas desde PRODUCCION', /no encontrada/i.test(cierreCruzado),
    cierreCruzado);

  console.log('\n6) Listados\n');
  const hReal = await CashRepository.listSessions(A, 'PRODUCCION');
  const hPrueba = await CashRepository.listSessions(A, 'PRUEBA');
  ok('el historial real tiene una sola sesion', hReal.length === 1, String(hReal.length));
  ok('el de practicas tambien', hPrueba.length === 1, String(hPrueba.length));
  ok('y no son la misma', hReal[0].id !== hPrueba[0].id);

  // getMovements va acotado por la sesion, no por el entorno: quien decide a
  // que sesion se puede mirar es la ruta, que la busca con auth.modo. Lo que se
  // comprueba aqui es esa puerta.
  const rutaMov = fuente('src/app/api/v1/cash/sessions/[id]/movements/route.ts');
  ok('la ruta localiza la sesion con el entorno de la sesion del usuario',
    /eq\(cashSessions\.modo, auth\.modo\)/.test(rutaMov));
  const mReal = await CashRepository.getMovements(real.id, A);
  ok('la caja real tiene su unico movimiento', mReal.length === 1, String(mReal.length));
  const mPrueba = await CashRepository.getMovements(practicas!.id, A);
  ok('y la de practicas el suyo, sin mezclarse', mPrueba.length === 1 &&
    mPrueba[0].modo === 'PRUEBA', `${mPrueba.length}/${mPrueba[0]?.modo}`);

  console.log('\n7) El repositorio se defiende solo\n');
  // CashService ya rechaza antes de llegar aqui, asi que este filtro solo se
  // ejerce llamando al repositorio directamente. Sin este aserto seria una
  // proteccion que nadie comprueba: la mutacion no la detectaba nadie.
  let repoCruzado = '';
  try {
    await CashRepository.closeSession(practicas!.id, A, 'PRODUCCION', {
      actualBalance: 800, expectedBalance: 800, difference: 0,
    });
  } catch (e: any) { repoCruzado = e.message; }
  ok('closeSession no cierra una sesion de otro entorno', /No se encontró/.test(repoCruzado),
    repoCruzado);

  const cierrePrueba = await CashRepository.closeSession(practicas!.id, A, 'PRUEBA', {
    actualBalance: 800, expectedBalance: 800, difference: 0,
  });
  ok('CONTROL: con su entorno correcto si cierra',
    cierrePrueba.session.status === 'closed', String(cierrePrueba.session.status));
  ok('y su resumen queda como PRUEBA', cierrePrueba.summary.modo === 'PRUEBA',
    String(cierrePrueba.summary.modo));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
