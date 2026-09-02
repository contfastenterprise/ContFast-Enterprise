/**
 * Clientes y suplidores: catalogo, pero con dos consultas que cruzan.
 *
 * `customers` y `suppliers` NO tienen columna `modo`, y esta bien: un cliente
 * es el mismo en los dos entornos. Por eso el arreglo no toca sus altas, bajas
 * ni busquedas.
 *
 * Lo que si depende del entorno son las consultas que cruzan a tablas
 * transaccionales, y eran las que no filtraban:
 *
 *   findAll(hasDebt = true)   marca como moroso a quien deba algo. Sin el
 *                             filtro, una factura de PRACTICAS convertia en
 *                             moroso a un cliente que no debe nada.
 *   getCustomerHistory        totales facturado / cobrado / pendiente, las
 *                             ultimas facturas y los ultimos cobros.
 *
 * Y la cache de GET /api/v1/customers no llevaba el entorno en la clave, con
 * 3600 segundos de vida: una hora sirviendo la lista del entorno equivocado.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { CustomerRepository } from '../src/repositories/customerRepository';
import { SupplierRepository } from '../src/repositories/supplierRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const SOLO_REAL = 'ffffffff-0000-0000-0000-00000000aa01';   // debe en PRODUCCION
const SOLO_PRUEBA = 'ffffffff-0000-0000-0000-00000000aa02'; // "debe" solo en PRUEBA
const SUP_REAL = 'ffffffff-0000-0000-0000-00000000bb01';
const SUP_PRUEBA = 'ffffffff-0000-0000-0000-00000000bb02';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);
  await db.execute(sql`DELETE FROM customers WHERE id IN (${SOLO_REAL}::uuid, ${SOLO_PRUEBA}::uuid)`);
  await db.execute(sql`DELETE FROM suppliers WHERE id IN (${SUP_REAL}::uuid, ${SUP_PRUEBA}::uuid)`);

  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES
      (${SOLO_REAL}::uuid,   ${A}::uuid, 'Moroso de verdad'),
      (${SOLO_PRUEBA}::uuid, ${A}::uuid, 'Moroso solo en practicas')`);
  await db.execute(sql`
    INSERT INTO suppliers (id, company_id, name) VALUES
      (${SUP_REAL}::uuid,   ${A}::uuid, 'Acreedor de verdad'),
      (${SUP_PRUEBA}::uuid, ${A}::uuid, 'Acreedor solo en practicas')`);

  const hoy = new Date().toISOString().slice(0, 10);

  // Una factura por entorno, cada una de su cliente.
  const fac = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, ncf, ecf_type, total, codigo_factura, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER_A}::uuid, ${SOLO_REAL}::uuid,   'E310000000001', '31', 9000, 'FAC-REAL',   'accepted'),
           (${A}::uuid, 'PRUEBA',     ${USER_A}::uuid, ${SOLO_PRUEBA}::uuid, 'E310000000999', '31',  50, 'FAC-PRUEBA', 'accepted')
    RETURNING id, modo, customer_id`)) as unknown as
    { id: string; modo: string; customer_id: string }[];

  for (const f of fac) {
    await db.execute(sql`
      INSERT INTO accounts_receivable (company_id, modo, invoice_id, customer_id, amount, balance, due_date)
      VALUES (${A}::uuid, ${f.modo}, ${f.id}::uuid, ${f.customer_id}::uuid,
              ${f.modo === 'PRODUCCION' ? 9000 : 50}, ${f.modo === 'PRODUCCION' ? 9000 : 50}, ${hoy})`);
  }

  await db.execute(sql`
    INSERT INTO accounts_payable (company_id, modo, supplier_id, amount, balance, due_date)
    VALUES (${A}::uuid, 'PRODUCCION', ${SUP_REAL}::uuid,   6000, 6000, ${hoy}),
           (${A}::uuid, 'PRUEBA',     ${SUP_PRUEBA}::uuid,   40,   40, ${hoy})`);
}

const nombres = (r: { data: { id: string; name: string }[] }) => r.data.map((c) => c.name).sort();

async function main() {
  await sembrar();

  console.log('\n1) Clientes con deuda: quien sale en cada entorno\n');
  const morososReal = await CustomerRepository.findAll(A, 'PRODUCCION', undefined, 50, 0, true);
  const nReal = nombres(morososReal);
  ok('sale el moroso de verdad', nReal.includes('Moroso de verdad'), nReal.join(', '));
  ok('NO sale el que solo debe en practicas', !nReal.includes('Moroso solo en practicas'), nReal.join(', '));

  const morososPrueba = await CustomerRepository.findAll(A, 'PRUEBA', undefined, 50, 0, true);
  const nPrueba = nombres(morososPrueba);
  ok('en PRUEBA sale el de practicas', nPrueba.includes('Moroso solo en practicas'), nPrueba.join(', '));
  ok('y NO el de verdad', !nPrueba.includes('Moroso de verdad'), nPrueba.join(', '));

  console.log('\n2) El catalogo completo NO se filtra por entorno\n');
  const todosReal = await CustomerRepository.findAll(A, 'PRODUCCION', undefined, 50, 0, false);
  const todosPrueba = await CustomerRepository.findAll(A, 'PRUEBA', undefined, 50, 0, false);
  ok('sin hasDebt, la lista es la misma en los dos', todosReal.total === todosPrueba.total,
    `${todosReal.total} y ${todosPrueba.total}`);
  ok('y contiene a los dos clientes', nombres(todosReal).includes('Moroso de verdad') &&
    nombres(todosReal).includes('Moroso solo en practicas'));

  console.log('\n3) Historial del cliente\n');
  const hReal = await CustomerRepository.getCustomerHistory(SOLO_REAL, A, 'PRODUCCION');
  ok('facturado = 9.000', Number(hReal.metrics.totalInvoiced) === 9000, String(hReal.metrics.totalInvoiced));
  ok('pendiente = 9.000', Number(hReal.metrics.currentBalance) === 9000, String(hReal.metrics.currentBalance));
  ok('una sola factura reciente', hReal.recentInvoices.length === 1, String(hReal.recentInvoices.length));

  // El mismo cliente, mirado desde PRUEBA: no tiene nada alli.
  const hPrueba = await CustomerRepository.getCustomerHistory(SOLO_REAL, A, 'PRUEBA');
  ok('en PRUEBA ese cliente no tiene facturado', Number(hPrueba.metrics.totalInvoiced) === 0,
    String(hPrueba.metrics.totalInvoiced));
  ok('ni facturas', hPrueba.recentInvoices.length === 0, String(hPrueba.recentInvoices.length));

  console.log('\n4) Suplidores con deuda\n');
  const acReal = await SupplierRepository.findAll(A, 'PRODUCCION', undefined, 50, 0, true);
  const aReal = acReal.data.map((s: { name: string }) => s.name);
  ok('sale el acreedor de verdad', aReal.includes('Acreedor de verdad'), aReal.join(', '));
  ok('NO el de practicas', !aReal.includes('Acreedor solo en practicas'), aReal.join(', '));

  const acPrueba = await SupplierRepository.findAll(A, 'PRUEBA', undefined, 50, 0, true);
  const aPrueba = acPrueba.data.map((s: { name: string }) => s.name);
  ok('en PRUEBA sale el de practicas', aPrueba.includes('Acreedor solo en practicas'), aPrueba.join(', '));

  console.log('\n5) La cache de la ruta separa los entornos\n');

  const ruta = fuente('src/app/api/v1/customers/route.ts');
  ok('la clave incluye el modo',
    /cache:customers:\$\{session\.companyId\}:\$\{session\.modo\}/.test(ruta));
  ok('el comodin de limpieza sigue cubriendo los dos entornos',
    /clearCachePattern\(`cache:customers:\$\{session\.companyId\}:\*`\)/.test(ruta));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
