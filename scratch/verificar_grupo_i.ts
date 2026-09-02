/**
 * Grupo I -- El cierre del barrido de entorno.
 *
 * EL PEOR, Y ERA MIO
 * ------------------
 * `DeliveryRepository.void` llamaba a `deductStock` SIN pasarle el entorno,
 * mientras que `approve` si lo pasaba. Como `modo` tenia valor por defecto
 * 'PRODUCCION', anular un conduce de PRUEBA devolvia las unidades al almacen
 * REAL: creaba existencia de la nada en produccion. Se me escapo al cerrar el
 * grupo H, y lo encontro un barrido posterior.
 *
 * LA RAIZ, NO EL SINTOMA
 * ----------------------
 * Cinco funciones de `inventoryService` tenian `modo` como ultimo parametro
 * CON valor por defecto. Ese es el mismo mecanismo silencioso de la columna:
 * quien lo omite no recibe aviso y escribe en produccion. Ahora `modo` va
 * SEGUNDO y es obligatorio, asi que el compilador encontro las trece llamadas
 * -- incluida la de `void` -- y ninguna nueva puede olvidarlo.
 *
 * COTIZACIONES
 * ------------
 * `QuoteService` no acotaba el entorno en ninguna de sus lecturas ni en sus
 * actualizaciones. Cada ruta comprobaba `quote.companyId !== auth.companyId` a
 * mano y ninguna el entorno: desde una sesion de PRUEBA se podia leer,
 * imprimir, editar y CONVERTIR EN FACTURA una cotizacion real.
 *
 * PERIODOS CONTABLES
 * ------------------
 * `PUT /accounting/periods/[id]` abre y cierra periodos resolviendolos por id
 * y empresa, sin entorno: desde PRODUCCION se podia cerrar el periodo de
 * PRUEBA y al reves. Y el listado que da esos ids tampoco filtraba.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { DeliveryRepository } from '../src/repositories/deliveryRepository';
import { QuoteService } from '../src/services/quoteService';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente, crudo } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const CLIENTE = 'ffffffff-0000-0000-0000-00000000ee01';
const ALM = 'cccccccc-0000-0000-0000-000000000001';
const PROD = 'dddddddd-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const existencia = async (modo: 'PRODUCCION' | 'PRUEBA') => {
  const r = (await db.execute(sql`
    SELECT quantity FROM inventory_levels
    WHERE company_id = ${A}::uuid AND product_id = ${PROD}::uuid
      AND warehouse_id = ${ALM}::uuid AND modo = ${modo}`)) as unknown as { quantity: string }[];
  return r[0] ? Number(r[0].quantity) : null;
};

async function sembrar() {
  await limpiarTodo();
  await db.execute(sql`DELETE FROM customers WHERE id = ${CLIENTE}::uuid`);
  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente I')`);
  await db.execute(sql`UPDATE products SET tracks_inventory = true WHERE id = ${PROD}::uuid`);
  await db.execute(sql`
    INSERT INTO inventory_levels (company_id, modo, product_id, warehouse_id, quantity)
    VALUES (${A}::uuid, 'PRODUCCION', ${PROD}::uuid, ${ALM}::uuid, 100),
           (${A}::uuid, 'PRUEBA',     ${PROD}::uuid, ${ALM}::uuid, 100)`);
}

async function factura(modo: 'PRODUCCION' | 'PRUEBA', ncf: string, cod: string) {
  const [f] = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, warehouse_id, ncf, ecf_type,
                          total, codigo_factura, status)
    VALUES (${A}::uuid, ${modo}, ${USER}::uuid, ${CLIENTE}::uuid, ${ALM}::uuid, ${ncf}, '31',
            1000, ${cod}, 'accepted')
    RETURNING id`)) as unknown as { id: string }[];
  await db.execute(sql`
    INSERT INTO invoice_lines (invoice_id, product_id, warehouse_id, quantity, unit_price, discount, subtotal, total)
    VALUES (${f.id}::uuid, ${PROD}::uuid, ${ALM}::uuid, 10, 100, 0, 1000, 1000)`);
  return f.id;
}

async function main() {
  await sembrar();

  // `crudo` a proposito: lo que se comprueba aqui ES el comentario que
  // explica por que una consulta NO lleva cierto filtro.
  console.log('\n1) EL FALLO: anular un conduce de PRUEBA creaba existencia real\n');
  const fac = await factura('PRUEBA', 'E310000070901', 'FAC-I-P');
  const conduce = await DeliveryRepository.create({
    companyId: A, modo: 'PRUEBA', invoiceId: fac, userId: USER,
    deliveryDate: new Date('2026-06-15'),
    lines: [{ productId: PROD, quantity: 6 }],
  } as any);

  await DeliveryRepository.approve(conduce.id, USER, A, 'PRUEBA');
  ok('tras aprobar, practicas baja a 94', (await existencia('PRUEBA')) === 94,
    String(await existencia('PRUEBA')));
  ok('y la real sigue en 100', (await existencia('PRODUCCION')) === 100,
    String(await existencia('PRODUCCION')));

  await DeliveryRepository.void(conduce.id, USER, A, 'PRUEBA');
  ok('al anular, practicas vuelve a 100', (await existencia('PRUEBA')) === 100,
    String(await existencia('PRUEBA')));
  // Antes esto daba 106: las 6 unidades devueltas caian en el almacen REAL.
  ok('y la real SIGUE en 100, no en 106', (await existencia('PRODUCCION')) === 100,
    String(await existencia('PRODUCCION')));

  console.log('\n2) La raiz: el compilador ya no deja omitir el entorno\n');
  const inv = fuente('src/services/inventoryService.ts');
  ok('ninguna funcion de inventario tiene el entorno por defecto',
    !/modo: 'PRODUCCION' \| 'PRUEBA' = 'PRODUCCION'/.test(inv));
  ok('y va en segundo lugar, donde no puede ser opcional',
    (inv.match(/companyId: string,\n\s*modo: 'PRODUCCION' \| 'PRUEBA',/g) || []).length >= 3,
    String((inv.match(/companyId: string,\n\s*modo: 'PRODUCCION' \| 'PRUEBA',/g) || []).length));
  const dr = fuente('src/repositories/deliveryRepository.ts');
  const llamadas = dr.match(/deductStock\(\s*companyId,\s*modo,/g) || [];
  ok('las DOS llamadas de conduces pasan el entorno', llamadas.length === 2,
    String(llamadas.length));

  console.log('\n3) Cotizaciones: no se alcanzan desde el otro entorno\n');
  const cotReal = await QuoteService.createQuote({
    companyId: A, modo: 'PRODUCCION', customerId: CLIENTE, userId: USER, warehouseId: ALM,
    lines: [{ productId: PROD, quantity: 2, unitPrice: 9000, discount: 0, taxRate: 0.18 }],
  } as any);

  ok('en su entorno se encuentra',
    (await QuoteService.getQuote(cotReal.quoteId, A, 'PRODUCCION')) !== null);
  ok('desde PRUEBA no existe',
    (await QuoteService.getQuote(cotReal.quoteId, A, 'PRUEBA')) === null);

  let convertida = '';
  try {
    await QuoteService.prepareInvoicePayload(cotReal.quoteId, A, 'PRUEBA');
  } catch (e: any) { convertida = e.message; }
  ok('y no se puede convertir en factura desde PRUEBA', /no encontrada/i.test(convertida),
    convertida || 'no lanzo');

  let editada = '';
  try {
    await QuoteService.updateQuote(cotReal.quoteId, A, 'PRUEBA', { notes: 'tocada' } as any);
  } catch (e: any) { editada = e.message; }
  ok('ni editar', /no encontrada/i.test(editada), editada || 'no lanzo');

  const listaReal = await QuoteService.getQuotes(A, 'PRODUCCION');
  const listaPrueba = await QuoteService.getQuotes(A, 'PRUEBA');
  ok('el listado real la trae', listaReal.items.length === 1, String(listaReal.items.length));
  ok('el de practicas no', listaPrueba.items.length === 0, String(listaPrueba.items.length));
  // Las estadisticas construyen su propia condicion, aparte del whereClause:
  // se quedaron fuera del primer arreglo y hubo que acotarlas tambien.
  ok('y el importe total de practicas es cero, no el real',
    listaPrueba.stats.totalAmount === 0, String(listaPrueba.stats.totalAmount));
  ok('CONTROL: el real si tiene importe', listaReal.stats.totalAmount > 0,
    String(listaReal.stats.totalAmount));

  console.log('\n4) Lo que se lee en el codigo\n');
  const comprobaciones: [string, string, RegExp][] = [
    ['secuencia e-CF del PDF', 'src/app/api/v1/invoices/[id]/pdf/route.ts', /eq\(ecfSequences\.modo, modo\)/],
    ['secuencia e-CF de la impresion', 'src/app/api/v1/invoices/[id]/print/route.ts', /eq\(ecfSequences\.modo, modo\)/],
    ['secuencia e-CF del correo', 'src/app/api/v1/invoices/[id]/email/route.ts', /eq\(ecfSequences\.modo, auth\.modo\)/],
    ['listado de secuencias', 'src/app/api/v1/ecf/sequences/route.ts', /eq\(ecfSequences\.modo, auth\.modo\)/],
    ['consumo del rango autorizado', 'src/app/api/v1/ecf/sequences/route.ts', /eq\(invoices\.modo, auth\.modo\)/],
    ['sincronizacion en lote con la DGII', 'src/app/api/v1/ecf/dgii-status/batch/route.ts', /eq\(invoices\.modo, auth\.modo\)/],
    ['periodos: listado', 'src/app/api/v1/accounting/periods/route.ts', /eq\(accountingPeriods\.modo, session\.modo\)/],
    ['periodos: abrir y cerrar', 'src/app/api/v1/accounting/periods/[id]/route.ts', /eq\(accountingPeriods\.modo, session\.modo\)/],
    ['libro de asientos', 'src/app/api/v1/accounting/entries/route.ts', /eq\(journalEntries\.modo, auth\.modo\)/],
    ['impresion de una compra', 'src/app/api/v1/expenses/[id]/print/route.ts', /eq\(expenses\.modo, session\.modo\)/],
    ['existencias en la ficha de producto', 'src/app/api/v1/products/[id]/inventory/route.ts', /eq\(inventoryLevels\.modo, auth\.modo\)/],
    ['cuentas por pagar', 'src/repositories/apRepository.ts', /eq\(accountsPayable\.modo, modo\)/],
    ['cuentas por cobrar pendientes', 'src/repositories/arRepository.ts', /eq\(accountsReceivable\.modo, modo\)/],
    ['herramienta de existencias del asistente', 'src/ai/tools/CheckStockTool.ts', /context\.modo/],
    ['transferencias entre almacenes', 'src/app/api/v1/inventory/transfer/route.ts', /auth\.modo/],
  ];
  for (const [nombre, r, re] of comprobaciones) ok(nombre, re.test(fuente(r)));

  console.log('\n5) Y las omisiones deliberadas siguen documentadas\n');
  ok('el arqueo de caja explica por que no filtra',
    /desapareceria del arqueo/.test(crudo('src/repositories/cashRepository.ts')));
  ok('las guardas de edicion de compra tambien',
    /comprobaciones de SEGURIDAD/.test(crudo('src/app/api/v1/expenses/[id]/route.ts')));
  ok('y la suma de lo ya despachado',
    /se podria entregar dos veces/.test(crudo('src/repositories/deliveryRepository.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
