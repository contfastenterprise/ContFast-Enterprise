/**
 * El tablero ejecutivo mezclaba PRODUCCION y PRUEBA.
 *
 * `biRepository` no mencionaba `modo` ni una vez, frente a 66 usos de
 * `companyId`: separaba empresas pero no entornos. Y como la columna tiene
 * DEFAULT 'PRODUCCION', omitirla nunca da error -- la consulta funciona y suma
 * las dos realidades.
 *
 * Lo que alimenta: GET /api/v1/bi/stats, es decir ventas del dia, del mes y del
 * ano, margen, costo de ventas, cartera por cobrar, deuda a proveedores,
 * inventario valorizado y ranking de clientes. Las cifras que se miran para
 * decidir.
 *
 * El escenario es deliberadamente asimetrico: en PRUEBA se siembran importes
 * distintos y reconocibles, de forma que si una consulta los sumara el total no
 * cuadraria con lo esperado. Los redondos (10.000, 500...) hacen visible de un
 * vistazo cual se colo.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { BIRepository } from '../src/repositories/biRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const CLIENTE = 'ffffffff-0000-0000-0000-000000000001';
const SUPLIDOR = 'ffffffff-0000-0000-0000-000000000002';
const ALM = 'cccccccc-0000-0000-0000-000000000001';
const PROD = 'dddddddd-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);

  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente Uno')
    ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`
    INSERT INTO suppliers (id, company_id, name) VALUES (${SUPLIDOR}::uuid, ${A}::uuid, 'Suplidor Uno')
    ON CONFLICT (id) DO NOTHING`);

  const hoy = new Date().toISOString().slice(0, 10);

  // Ventas: 10.000 reales, 500 de practicas.
  await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, warehouse_id, ncf, ecf_type,
                          subtotal, total_taxes, total, codigo_factura, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER_A}::uuid, ${CLIENTE}::uuid, ${ALM}::uuid,
            'E310000000001', '31', 10000, 0, 10000, 'FAC-REAL', 'accepted'),
           (${A}::uuid, 'PRUEBA',     ${USER_A}::uuid, ${CLIENTE}::uuid, ${ALM}::uuid,
            'E310000000999', '31',   500, 0,   500, 'FAC-PRUEBA', 'accepted')`);

  // Compras: 3.000 reales, 200 de practicas.
  await db.execute(sql`
    INSERT INTO expenses (company_id, modo, supplier_id, warehouse_id, expense_type, issue_date,
                          amount, itbis, payment_method, ncf)
    VALUES (${A}::uuid, 'PRODUCCION', ${SUPLIDOR}::uuid, ${ALM}::uuid, '01', ${hoy}, 3000, 0, '01', 'B0100000001'),
           (${A}::uuid, 'PRUEBA',     ${SUPLIDOR}::uuid, ${ALM}::uuid, '01', ${hoy},  200, 0, '01', 'B0100000999')`);

  // Lineas de factura, para que la pestana de productos tenga de que hablar.
  // `invoice_lines` no tiene columna `modo`: hereda el entorno de su factura, y
  // por eso la consulta tiene que filtrarlo en el JOIN con `invoices`.
  const facs = (await db.execute(sql`SELECT id, modo FROM invoices ORDER BY modo`)) as unknown as
    { id: string; modo: string }[];
  for (const f of facs) {
    const cant = f.modo === 'PRODUCCION' ? 4 : 111;
    await db.execute(sql`
      INSERT INTO invoice_lines (invoice_id, product_id, warehouse_id, quantity, unit_price, subtotal, total)
      VALUES (${f.id}::uuid, ${PROD}::uuid, ${ALM}::uuid, ${cant}, 1000, ${cant * 1000}, ${cant * 1000})`);
  }

  // Cartera: 7.000 real, 300 de practicas.
  for (const f of facs) {
    await db.execute(sql`
      INSERT INTO accounts_receivable (company_id, modo, invoice_id, customer_id, amount, balance, due_date)
      VALUES (${A}::uuid, ${f.modo}, ${f.id}::uuid, ${CLIENTE}::uuid,
              ${f.modo === 'PRODUCCION' ? 7000 : 300}, ${f.modo === 'PRODUCCION' ? 7000 : 300}, ${hoy})`);
  }

  // Deuda: 4.000 real, 100 de practicas.
  await db.execute(sql`
    INSERT INTO accounts_payable (company_id, modo, supplier_id, amount, balance, due_date)
    VALUES (${A}::uuid, 'PRODUCCION', ${SUPLIDOR}::uuid, 4000, 4000, ${hoy}),
           (${A}::uuid, 'PRUEBA',     ${SUPLIDOR}::uuid,  100,  100, ${hoy})`);

  // Inventario: 20 unidades reales, 999 de practicas.
  await db.execute(sql`
    INSERT INTO inventory_levels (company_id, modo, product_id, warehouse_id, quantity)
    VALUES (${A}::uuid, 'PRODUCCION', ${PROD}::uuid, ${ALM}::uuid,  20),
           (${A}::uuid, 'PRUEBA',     ${PROD}::uuid, ${ALM}::uuid, 999)`);
}

/**
 * Todos los numeros que hay dentro del resultado, a cualquier profundidad.
 *
 * Buscar subcadenas en el JSON no sirve: "3000" contiene "300", "10000"
 * contiene "100", y los UUID traen digitos arbitrarios. Se comparan valores
 * exactos.
 */
function numeros(o: unknown, acc = new Set<number>()): Set<number> {
  if (typeof o === 'number') acc.add(o);
  else if (typeof o === 'string' && o !== '' && !Number.isNaN(Number(o))) acc.add(Number(o));
  else if (Array.isArray(o)) o.forEach((x) => numeros(x, acc));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => numeros(x, acc));
  return acc;
}

const texto = (o: unknown) => JSON.stringify(o);

async function main() {
  await sembrar();
  const sinFiltros = {};

  console.log('\n1) Tablero general: cada cifra es la real, no la suma de las dos\n');
  const g = await BIRepository.getGeneralStats(A, 'PRODUCCION', sinFiltros) as Record<string, number>;
  // Si se colara PRUEBA, cada uno seria la suma: 10500, 7300, 4100, 3200.
  ok('ventas del dia = 10.000 (no 10.500)', g.salesToday === 10000, String(g.salesToday));
  ok('ventas del mes = 10.000', g.salesMonth === 10000, String(g.salesMonth));
  ok('ventas del ano = 10.000', g.salesYear === 10000, String(g.salesYear));
  ok('cartera por cobrar = 7.000 (no 7.300)', g.receivablesAmount === 7000, String(g.receivablesAmount));
  ok('deuda a proveedores = 4.000 (no 4.100)', g.payablesAmount === 4000, String(g.payablesAmount));
  ok('compras del mes = 3.000 (no 3.200)', g.purchasesMonth === 3000, String(g.purchasesMonth));
  ok('una sola factura contada (no 2)', g.countInvoices === 1, String(g.countInvoices));
  // 20 unidades a 7.500 de costo. Con PRUEBA colada serian 1.019 unidades.
  ok('inventario al costo = 150.000', g.inventoryCost === 150000, String(g.inventoryCost));

  console.log('\n2) Los catalogos NO se filtran por entorno, y esta bien\n');
  const gp = await BIRepository.getGeneralStats(A, 'PRUEBA', sinFiltros) as Record<string, number>;
  ok('clientes: mismo numero en los dos entornos', g.countCustomers === gp.countCustomers,
    `${g.countCustomers} y ${gp.countCustomers}`);
  ok('productos: igual', g.countProducts === gp.countProducts,
    `${g.countProducts} y ${gp.countProducts}`);

  console.log('\n3) El otro lado: en PRUEBA se ven las cifras de practicas\n');
  ok('ventas = 500', gp.salesToday === 500, String(gp.salesToday));
  ok('cartera = 300', gp.receivablesAmount === 300, String(gp.receivablesAmount));
  ok('deuda = 100', gp.payablesAmount === 100, String(gp.payablesAmount));
  ok('compras = 200', gp.purchasesMonth === 200, String(gp.purchasesMonth));

  console.log('\n4) Inventario: 20 unidades reales, no 1.019\n');
  const inv = await BIRepository.getInventoryStats(A, 'PRODUCCION', sinFiltros);
  const nInv = numeros(inv);
  ok('aparece la existencia real (20)', nInv.has(20));
  ok('no aparece la de practicas (999)', !nInv.has(999));
  ok('ni la suma (1019)', !nInv.has(1019));

  console.log('\n5) Las otras cuatro pestanas: responden y no traen nada de PRUEBA\n');
  // Tipo explicito: son cuatro firmas con formas de retorno distintas y, sin
  // esto, TypeScript intenta unificarlas y se queja del `this`. En ejecucion
  // siempre fue correcto.
  type Pestana = [string, (c: string, m: 'PRODUCCION' | 'PRUEBA', f: any) => Promise<unknown>];
  for (const [nombre, fn] of [
    ['productos', BIRepository.getProductStats],
    ['clientes', BIRepository.getCustomerStats],
    ['facturacion', BIRepository.getBillingStats],
    ['compras', BIRepository.getPurchaseStats],
  ] as Pestana[]) {
    const r = await fn.call(BIRepository, A, 'PRODUCCION', sinFiltros);
    ok(`${nombre}: responde`, r !== null && r !== undefined);
    // Los documentos de PRUEBA llevan marca propia en su codigo y su NCF.
    ok(`${nombre}: sin documentos de PRUEBA`,
      !texto(r).includes('FAC-PRUEBA') && !texto(r).includes('B0100000999') &&
      !texto(r).includes('E310000000999'),
      texto(r).slice(0, 110));
    // Y el resultado tiene que CAMBIAR al pedirlo en el otro entorno: si no
    // cambiara, el filtro no estaria haciendo nada.
    const rp = await fn.call(BIRepository, A, 'PRUEBA', sinFiltros);
    ok(`${nombre}: el entorno cambia el resultado`, texto(r) !== texto(rp));
  }

  console.log('\n6) La cache de la ruta separa los entornos\n');
  const ruta = fuente('src/app/api/v1/bi/stats/route.ts');
  ok('la clave incluye el modo', /cache:bi:\$\{auth\.companyId\}:\$\{auth\.modo\}/.test(ruta));
  ok('y las seis llamadas lo pasan',
    (ruta.match(/BIRepository\.\w+\(auth\.companyId, auth\.modo, filters\)/g) || []).length === 6);

  console.log('\n7) Ninguna consulta se quedo sin filtro\n');
  const repo = fuente('src/repositories/biRepository.ts');
  const conEmpresa = (repo.match(/eq\((\w+)\.companyId, companyId\)/g) || []);
  const conModo = (repo.match(/eq\(\w+\.modo, modo\)/g) || []);
  const catalogo = conEmpresa.filter((x) => /customers|products/.test(x)).length;
  ok(`${conModo.length} filtros de entorno para ${conEmpresa.length - catalogo} de tablas transaccionales`,
    conModo.length === conEmpresa.length - catalogo,
    `${conModo.length} vs ${conEmpresa.length - catalogo}`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
