/**
 * Grupo F -- Banco. El saldo de una cuenta pasa a ser por entorno.
 *
 * EL FALLO, MEDIDO ANTES DE TOCAR NADA
 * ------------------------------------
 * `bank_accounts` es un catalogo -- una fila por cuenta real, sin `modo`, y
 * eso esta bien: la cuenta del Popular es la misma se mire desde donde se
 * mire. Pero llevaba dentro `balance`, que no es un dato de catalogo sino un
 * saldo que se mueve. Las transacciones SI distinguian entorno; el saldo que
 * movian, no, porque solo habia uno.
 *
 * Reproducido contra PostgreSQL antes del arreglo:
 *
 *     saldo real inicial ......................... 100.000
 *     un retiro de 75.000 registrado en PRUEBA
 *     saldo real despues ......................... 25.000   <-- la cifra real
 *
 * Y ese numero se muestra en el panel de banco, en la pantalla de pagos a
 * suplidores, en la herramienta de saldos del asistente y en el informe de
 * conciliacion bancaria, que es el que se cuadra contra el estado de cuenta
 * que manda el banco.
 *
 * LA FORMA DEL ARREGLO
 * --------------------
 * La misma que ya usaba el inventario en este mismo sistema: `products` es
 * catalogo y `inventory_levels` lleva el modo. Aqui el saldo se muda a
 * `bank_account_balances`, una fila por cuenta y entorno (migracion 0036).
 *
 * `bank_accounts.balance` se queda como espejo de PRODUCCION. No es duplicar
 * la verdad por gusto: si en algun sitio quedara una lectura sin migrar,
 * mostrara la cifra real y nunca una de practicas. Falla hacia el lado seguro.
 */
import { db, bankAccounts } from '../src/db';
import { sql, eq } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { BankRepository } from '../src/repositories/bankRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente, crudo } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const CTA = 'ffff0000-0000-0000-0000-0000000000b1';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const saldoCatalogo = async () => {
  const r = (await db.execute(sql`
    SELECT balance FROM bank_accounts WHERE id = ${CTA}::uuid`)) as unknown as { balance: string }[];
  return Number(r[0].balance);
};
const saldoEntorno = async (modo: 'PRODUCCION' | 'PRUEBA') => {
  const r = (await db.execute(sql`
    SELECT balance FROM bank_account_balances
    WHERE bank_account_id = ${CTA}::uuid AND modo = ${modo}`)) as unknown as { balance: string }[];
  return r[0] ? Number(r[0].balance) : null;
};

async function sembrar() {
  await limpiarTodo(['bank_accounts', 'bank_account_balances']);
  await db.execute(sql`
    INSERT INTO bank_accounts (id, company_id, bank_name, account_number, balance)
    VALUES (${CTA}::uuid, ${A}::uuid, 'Popular', '999-BANCO', 100000)`);
  // La migracion 0036 siembra los dos entornos. Aqui se hace igual.
  await db.execute(sql`
    INSERT INTO bank_account_balances (company_id, bank_account_id, modo, balance)
    VALUES (${A}::uuid, ${CTA}::uuid, 'PRODUCCION', 100000),
           (${A}::uuid, ${CTA}::uuid, 'PRUEBA',     100000)`);
}

const mover = (modo: 'PRODUCCION' | 'PRUEBA', tipo: any, monto: number, desc: string) =>
  BankRepository.registerTransaction({
    companyId: A, modo, bankAccountId: CTA, date: '2026-08-28',
    type: tipo, amount: monto, description: desc,
  } as any);

async function main() {
  await sembrar();

  console.log('\n1) EL FALLO: practicar ya no mueve el dinero real\n');
  ok('los dos entornos arrancan en 100.000',
    (await saldoEntorno('PRODUCCION')) === 100000 && (await saldoEntorno('PRUEBA')) === 100000);

  await mover('PRUEBA', 'withdrawal', 75000, 'Retiro de PRACTICAS');

  ok('el saldo REAL sigue intacto en 100.000', (await saldoEntorno('PRODUCCION')) === 100000,
    String(await saldoEntorno('PRODUCCION')));
  ok('el de practicas si baja a 25.000', (await saldoEntorno('PRUEBA')) === 25000,
    String(await saldoEntorno('PRUEBA')));
  ok('y el campo viejo del catalogo tampoco se movio', (await saldoCatalogo()) === 100000,
    String(await saldoCatalogo()));

  console.log('\n2) CONTROL: en PRODUCCION si se mueve, y solo alli\n');
  await mover('PRODUCCION', 'deposit', 5000, 'Deposito real');
  ok('el real sube a 105.000', (await saldoEntorno('PRODUCCION')) === 105000,
    String(await saldoEntorno('PRODUCCION')));
  ok('el de practicas se queda en 25.000', (await saldoEntorno('PRUEBA')) === 25000,
    String(await saldoEntorno('PRUEBA')));
  ok('el espejo del catalogo sigue a PRODUCCION', (await saldoCatalogo()) === 105000,
    String(await saldoCatalogo()));

  console.log('\n3) El libro de banco de cada entorno\n');
  const real = await BankRepository.getBankTransactions(A, CTA, 'PRODUCCION');
  const prueba = await BankRepository.getBankTransactions(A, CTA, 'PRUEBA');
  ok('en PRODUCCION solo el deposito real', real.length === 1 &&
    real[0].description === 'Deposito real', `${real.length}: ${real.map(t => t.description).join(', ')}`);
  ok('en PRUEBA solo el retiro de practicas', prueba.length === 1 &&
    prueba[0].description === 'Retiro de PRACTICAS', `${prueba.length}`);

  const todasReal = await BankRepository.getBankTransactions(A, 'all', 'PRODUCCION');
  ok('la rama "all" tambien filtra', todasReal.length === 1, String(todasReal.length));

  console.log('\n4) El listado de cuentas muestra el saldo de SU entorno\n');
  const ctasReal = await BankRepository.getBankAccounts(A, 'PRODUCCION');
  const ctasPrueba = await BankRepository.getBankAccounts(A, 'PRUEBA');
  ok('en PRODUCCION la cuenta sale con 105.000', Number(ctasReal[0].balance) === 105000,
    String(ctasReal[0].balance));
  ok('en PRUEBA sale con 25.000', Number(ctasPrueba[0].balance) === 25000,
    String(ctasPrueba[0].balance));
  ok('y es la misma cuenta, no dos', ctasReal.length === 1 && ctasPrueba.length === 1 &&
    ctasReal[0].id === ctasPrueba[0].id);

  console.log('\n5) Una cuenta anterior a la migracion no desaparece de la pantalla\n');
  const VIEJA = 'ffff0000-0000-0000-0000-0000000000b2';
  await db.execute(sql`
    INSERT INTO bank_accounts (id, company_id, bank_name, account_number, balance)
    VALUES (${VIEJA}::uuid, ${A}::uuid, 'Reservas', '888-VIEJA', 4200)`);
  const conVieja = await BankRepository.getBankAccounts(A, 'PRUEBA');
  ok('sigue apareciendo en la lista', conVieja.length === 2, String(conVieja.length));
  const vieja = conVieja.find((c: any) => c.id === VIEJA)!;
  ok('con el saldo del catalogo como respaldo', Number(vieja.balance) === 4200,
    String(vieja.balance));
  // Y al moverla, se crea su fila del entorno sin perder el punto de partida.
  await BankRepository.ajustarSaldo(VIEJA, A, 'PRUEBA', -200);
  ok('al tocarla se crea su saldo de PRUEBA partiendo de 4.200',
    (await BankRepository.saldo(VIEJA, A, 'PRUEBA')) === 4000,
    String(await BankRepository.saldo(VIEJA, A, 'PRUEBA')));
  ok('y el real de esa cuenta sigue en 4.200',
    (await BankRepository.saldo(VIEJA, A, 'PRODUCCION')) === 4200,
    String(await BankRepository.saldo(VIEJA, A, 'PRODUCCION')));

  console.log('\n6) Dos movimientos a la vez no se pisan\n');
  // El ajuste se hace en la base (`balance = balance + delta`), no leyendo en
  // TypeScript y escribiendo despues. Diez sumas concurrentes de 100 tienen
  // que dar exactamente 1.000 de mas.
  const antes = await BankRepository.saldo(CTA, A, 'PRODUCCION');
  await Promise.all(
    Array.from({ length: 10 }, () => BankRepository.ajustarSaldo(CTA, A, 'PRODUCCION', 100))
  );
  const despues = await BankRepository.saldo(CTA, A, 'PRODUCCION');
  ok('diez sumas de 100 suman exactamente 1.000', despues - antes === 1000,
    `${antes} -> ${despues}`);

  console.log('\n7) Ya no queda ningun sitio que escriba el saldo a mano\n');
  const escritores: string[] = [];
  for (const f of [
    'src/repositories/bankRepository.ts',
    'src/services/apService.ts',
    'src/app/api/v1/bank/accounts/[id]/transactions/route.ts',
  ]) {
    const s = fuente(f);
    const n = (s.match(/update\(bankAccounts\)/g) || []).length;
    if (n > 0) escritores.push(`${f}:${n}`);
  }
  // Solo puede quedar UNO: el espejo de compatibilidad dentro de ajustarSaldo.
  ok('solo queda el espejo de ajustarSaldo',
    escritores.length === 1 && escritores[0] === 'src/repositories/bankRepository.ts:1',
    escritores.join(', ') || 'ninguno');
  ok('y ese espejo solo se escribe desde PRODUCCION',
    /if \(modo === 'PRODUCCION'\)/.test(fuente('src/repositories/bankRepository.ts')));

  console.log('\n8) Las rutas y la herramienta del asistente\n');
  const rutaTx = fuente('src/app/api/v1/bank/accounts/[id]/transactions/route.ts');
  ok('el libro de banco de la ruta filtra entorno',
    /eq\(bankTransactions\.modo, auth\.modo\)/.test(rutaTx));
  ok('y tambien empresa', /eq\(bankTransactions\.companyId, auth\.companyId\)/.test(rutaTx));
  ok('las conciliaciones filtran entorno',
    /eq\(bankReconciliations\.modo, auth\.modo\)/.test(
      fuente('src/app/api/v1/bank/reconciliations/route.ts')));
  ok('la herramienta de saldos usa el entorno del usuario',
    /getBankAccounts\(context\.tenantId, context\.modo\)/.test(
      fuente('src/ai/tools/GetBankBalancesTool.ts')));
  ok('la ruta de transacciones pasa el entorno',
    /getBankTransactions\(session\.companyId, accountId, session\.modo\)/.test(
      fuente('src/app/api/v1/bank/transactions/route.ts')));
  ok('la de cuentas tambien',
    /getBankAccounts\(session\.companyId, session\.modo\)/.test(
      fuente('src/app/api/v1/bank/accounts/route.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
