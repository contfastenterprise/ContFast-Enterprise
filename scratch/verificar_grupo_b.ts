/**
 * Grupo B: escrituras localizadas por un `id` que llega del cuerpo o la URL de
 * la peticion sin que nadie compruebe a que empresa pertenece esa fila.
 *
 * Cada bloque intenta el ataque desde la empresa A contra un dato de la
 * empresa B y comprueba que ya no surte efecto. Para que la prueba valga algo,
 * cada caso comprueba dos cosas: que el dato de B queda intacto Y que la misma
 * operacion sobre un dato propio de A si funciona. Sin lo segundo, romper la
 * funcion entera tambien pasaria la prueba.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { BankRepository } from '../src/repositories/bankRepository';
import { ArRepository } from '../src/repositories/arRepository';
import { CashRepository } from '../src/repositories/cashRepository';
import { QuoteService } from '../src/services/quoteService';
import { addStock } from '../src/services/inventoryService';

const A = '11111111-1111-1111-1111-111111111111'; // atacante
const B = '22222222-2222-2222-2222-222222222222'; // victima
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const CTA_A = 'ffff0000-0000-0000-0000-00000000000a';
const CTA_B = 'ffff0000-0000-0000-0000-00000000000b';
const CAJA_A = 'ffff0000-0000-0000-0000-00000000001a';
const CAJA_B = 'ffff0000-0000-0000-0000-00000000001b';
const SES_A = 'ffff0000-0000-0000-0000-00000000002a';
const SES_B = 'ffff0000-0000-0000-0000-00000000002b';
const CLI_B = 'ffff0000-0000-0000-0000-00000000003b';
const AR_B = 'ffff0000-0000-0000-0000-00000000004b';
const FAC_B = 'ffff0000-0000-0000-0000-00000000006b';
const COT_B = 'ffff0000-0000-0000-0000-00000000005b';
const ALM_B = 'cccccccc-0000-0000-0000-000000000003';
const PROD_B = 'dddddddd-0000-0000-0000-000000000004';
const ALM_A = 'cccccccc-0000-0000-0000-000000000001';
const PROD_A = 'dddddddd-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const uno = async (q: any) => ((await db.execute(q)) as any[])[0];
/** Ejecuta y devuelve el mensaje de error, o null si no lanzo. */
async function lanza(fn: () => Promise<any>): Promise<string | null> {
  try { await fn(); return null; } catch (e: any) { return e.message; }
}

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo(['cash_registers', 'bank_accounts']);
  await db.execute(sql`DELETE FROM customers`);

  await db.execute(sql`INSERT INTO bank_accounts (id,company_id,bank_name,account_number,balance) VALUES
    (${CTA_A}::uuid,${A}::uuid,'Popular','A-1',1000),
    (${CTA_B}::uuid,${B}::uuid,'BHD','B-1',5000)`);
  await db.execute(sql`INSERT INTO cash_registers (id,company_id,name,code) VALUES
    (${CAJA_A}::uuid,${A}::uuid,'Caja A','CA'), (${CAJA_B}::uuid,${B}::uuid,'Caja B','CB')`);
  await db.execute(sql`INSERT INTO cash_sessions (id,company_id,cash_register_id,user_id,initial_balance,expected_balance) VALUES
    (${SES_A}::uuid,${A}::uuid,${CAJA_A}::uuid,${USER_A}::uuid,100,100),
    (${SES_B}::uuid,${B}::uuid,${CAJA_B}::uuid,${USER_B}::uuid,700,700)`);
  await db.execute(sql`INSERT INTO customers (id,company_id,name) VALUES (${CLI_B}::uuid,${B}::uuid,'Cliente de B')`);
  await db.execute(sql`INSERT INTO invoices (id,company_id,user_id,ncf,ecf_type,total)
    VALUES (${FAC_B}::uuid,${B}::uuid,${USER_B}::uuid,'E310000000001','31',8000)`);
  await db.execute(sql`INSERT INTO accounts_receivable (id,company_id,customer_id,invoice_id,amount,balance,due_date)
    VALUES (${AR_B}::uuid,${B}::uuid,${CLI_B}::uuid,${FAC_B}::uuid,8000,8000,'2026-12-31')`);
  await db.execute(sql`INSERT INTO quotes (id,company_id,user_id,sequence_number,status,total)
    VALUES (${COT_B}::uuid,${B}::uuid,${USER_B}::uuid,'COT-B-1','pending',4000)`);
  await db.execute(sql`INSERT INTO inventory_levels (company_id,modo,product_id,warehouse_id,quantity)
    VALUES (${B}::uuid,'PRODUCCION',${PROD_B}::uuid,${ALM_B}::uuid,50)`);
}

async function main() {
  await sembrar();

  console.log('\n1) Saldo bancario: A intenta mover la cuenta de B\n');
  const err1 = await lanza(() => BankRepository.registerTransaction({
    companyId: A, modo: 'PRODUCCION', bankAccountId: CTA_B, date: '2026-06-15',
    type: 'withdrawal', amount: 4000,
  } as any));
  ok('el intento se rechaza', err1 !== null, err1 || 'no lanzo');
  const ctaB: any = await uno(sql`SELECT balance FROM bank_accounts WHERE id=${CTA_B}::uuid`);
  ok('el saldo de B sigue en 5000', Number(ctaB.balance) === 5000, ctaB.balance);
  await BankRepository.registerTransaction({
    companyId: A, modo: 'PRODUCCION', bankAccountId: CTA_A, date: '2026-06-15',
    type: 'deposit', amount: 250,
  } as any);
  const ctaA: any = await uno(sql`SELECT balance FROM bank_accounts WHERE id=${CTA_A}::uuid`);
  ok('sobre su propia cuenta A si funciona', Number(ctaA.balance) === 1250, ctaA.balance);

  console.log('\n2) Cuenta por cobrar: A intenta saldar la CxC de B\n');
  await lanza(() => ArRepository.registerReceipt({
    companyId: A, modo: 'PRODUCCION', customerId: CLI_B, date: '2026-06-15',
    paymentMethod: 'bank', amount: 8000, userId: USER_A,
    invoicesApplied: [{ arId: AR_B, amountApplied: 8000 }],
  } as any));
  const arB: any = await uno(sql`SELECT balance, status FROM accounts_receivable WHERE id=${AR_B}::uuid`);
  ok('la CxC de B sigue en 8000 y pendiente',
    Number(arB.balance) === 8000 && arB.status === 'pending', `${arB.balance} / ${arB.status}`);

  console.log('\n3) Caja: A intenta mover el saldo esperado de la sesion de B\n');
  const err3 = await lanza(() => db.transaction(async (tx) =>
    CashRepository.addMovement(tx, {
      companyId: A, cashSessionId: SES_B, type: 'cash_out', amount: 700,
    } as any)));
  ok('el intento se rechaza', err3 !== null, err3 || 'no lanzo');
  const sesB: any = await uno(sql`SELECT expected_balance FROM cash_sessions WHERE id=${SES_B}::uuid`);
  ok('el saldo esperado de B sigue en 700', Number(sesB.expected_balance) === 700, sesB.expected_balance);
  await db.transaction(async (tx) => CashRepository.addMovement(tx, {
    companyId: A, cashSessionId: SES_A, type: 'cash_in', amount: 50,
  } as any));
  const sesA: any = await uno(sql`SELECT expected_balance FROM cash_sessions WHERE id=${SES_A}::uuid`);
  ok('sobre su propia caja A si funciona', Number(sesA.expected_balance) === 150, sesA.expected_balance);

  console.log('\n4) Cotizacion: A intenta marcar como facturada la de B\n');
  await QuoteService.markAsInvoiced(COT_B, A, 'PRODUCCION');
  const cotB: any = await uno(sql`SELECT status FROM quotes WHERE id=${COT_B}::uuid`);
  ok('la cotizacion de B sigue pendiente', cotB.status === 'pending', cotB.status);
  await QuoteService.markAsInvoiced(COT_B, B, 'PRODUCCION');
  const cotB2: any = await uno(sql`SELECT status FROM quotes WHERE id=${COT_B}::uuid`);
  ok('su propia empresa B si puede marcarla', cotB2.status === 'invoiced', cotB2.status);

  console.log('\n5) Existencias: A intenta mover el inventario de B\n');
  // Antes, la busqueda del nivel sin companyId encontraba el de B y le restaba
  // 30 en silencio. Ahora no lo encuentra e intenta crear el suyo, y ahi choca
  // con el indice unico (product_id, warehouse_id, modo), que NO incluye la
  // empresa. El intento pasa de corromper callando a fallar en voz alta.
  const err5 = await lanza(() =>
    addStock(A, 'PRODUCCION', PROD_B, ALM_B, -30, USER_A, 'adjustment', undefined, 'intento', db));
  ok('el intento no prospera', err5 !== null, (err5 || 'no lanzo').slice(0, 60));
  const nivB: any = await uno(sql`SELECT quantity FROM inventory_levels
    WHERE company_id=${B}::uuid AND product_id=${PROD_B}::uuid AND warehouse_id=${ALM_B}::uuid`);
  ok('el nivel de B sigue en 50', Number(nivB.quantity) === 50, nivB.quantity);

  await addStock(A, 'PRODUCCION', PROD_A, ALM_A, 10, USER_A, 'adjustment', undefined, 'propio', db);
  const nivA: any = await uno(sql`SELECT quantity FROM inventory_levels
    WHERE company_id=${A}::uuid AND product_id=${PROD_A}::uuid AND warehouse_id=${ALM_A}::uuid`);
  ok('sobre su propio inventario A si funciona', Number(nivA.quantity) === 10, nivA.quantity);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
