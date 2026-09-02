/**
 * Grupo H -- Conduces.
 *
 * LO MAS SERIO: la ruta del codigo de barras
 * ------------------------------------------
 * `POST /delivery-notes/apply-code` recibe un codigo escaneado, busca a que
 * conduce o factura corresponde, y lo APRUEBA. Aprobar descuenta existencia.
 *
 * Buscaba por numero de conduce y por NCF sin mirar el entorno. Y como cada
 * entorno numera por su cuenta, el mismo `CON-2026-000001` existe en los dos:
 * escanear ese codigo desde el entorno de practicas encontraba el conduce REAL
 * y le descontaba el inventario de verdad.
 *
 * LA NUMERACION
 * -------------
 * El indice unico de la tabla es (company_id, delivery_number, modo). O sea:
 * el esquema daba por hecho que cada entorno numera por su cuenta. El
 * generador no se habia enterado -- leia el ultimo numero de los DOS entornos
 * y sumaba uno --, asi que cada conduce de practicas consumia un numero de la
 * serie real y le dejaba un hueco.
 *
 * LO QUE NO SE TOCA, Y POR QUE
 * ----------------------------
 * Las consultas internas de `approve` y `void` que suman lo ya despachado NO
 * llevan filtro de entorno. Van acotadas por la factura, cuyo id es clave
 * primaria y que ya se resolvio con su entorno. Anadirlo tendria el mismo
 * efecto malo que en el arqueo de caja: un conduce heredado con el sello
 * equivocado desapareceria de la suma y la factura se podria entregar dos
 * veces. Si se acotan por empresa, eso si.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { DeliveryRepository } from '../src/repositories/deliveryRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente, crudo } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const CLIENTE = 'ffffffff-0000-0000-0000-00000000dd01';
const ALM = 'cccccccc-0000-0000-0000-000000000001';
const PROD = 'dddddddd-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function sembrar() {
  await limpiarTodo();
  await db.execute(sql`DELETE FROM customers WHERE id = ${CLIENTE}::uuid`);
  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente H')`);
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
  // invoice_lines es tabla de detalle: no lleva company_id ni modo, los hereda
  // de su factura.
  await db.execute(sql`
    INSERT INTO invoice_lines (invoice_id, product_id, warehouse_id, quantity, unit_price, discount, subtotal, total)
    VALUES (${f.id}::uuid, ${PROD}::uuid, ${ALM}::uuid, 10, 100, 0, 1000, 1000)`);
  return f.id;
}

const existencia = async (modo: 'PRODUCCION' | 'PRUEBA') => {
  const r = (await db.execute(sql`
    SELECT quantity FROM inventory_levels
    WHERE company_id = ${A}::uuid AND product_id = ${PROD}::uuid
      AND warehouse_id = ${ALM}::uuid AND modo = ${modo}`)) as unknown as { quantity: string }[];
  return Number(r[0].quantity);
};

async function main() {
  await sembrar();

  console.log('\n1) Cada entorno numera por su cuenta\n');
  const facReal = await factura('PRODUCCION', 'E310000080001', 'FAC-R1');
  const facPrueba = await factura('PRUEBA', 'E310000080901', 'FAC-P1');

  const n1 = await DeliveryRepository.getNextDeliveryNumber(A, 'PRODUCCION');
  const conduceReal = await DeliveryRepository.create({
    companyId: A, modo: 'PRODUCCION', invoiceId: facReal, userId: USER,
    deliveryDate: new Date('2026-06-15'),
    lines: [{ productId: PROD, quantity: 4 }],
  } as any);
  const n2 = await DeliveryRepository.getNextDeliveryNumber(A, 'PRUEBA');
  const conducePrueba = await DeliveryRepository.create({
    companyId: A, modo: 'PRUEBA', invoiceId: facPrueba, userId: USER,
    deliveryDate: new Date('2026-06-15'),
    lines: [{ productId: PROD, quantity: 4 }],
  } as any);

  ok('el primero de PRODUCCION es el 000001', n1.endsWith('000001'), n1);
  ok('y el primero de PRUEBA tambien', n2.endsWith('000001'), n2);
  ok('los dos conduces existen con el MISMO numero',
    conduceReal.deliveryNumber === conducePrueba.deliveryNumber,
    `${conduceReal.deliveryNumber} / ${conducePrueba.deliveryNumber}`);
  // Antes esto no pasaba: el de practicas salia 000002 y la serie real se
  // quedaba con un hueco.
  const siguienteReal = await DeliveryRepository.getNextDeliveryNumber(A, 'PRODUCCION');
  ok('la serie real sigue en 000002, sin huecos', siguienteReal.endsWith('000002'),
    siguienteReal);

  console.log('\n2) EL FALLO: escanear un codigo desde PRUEBA\n');
  ok('las dos existencias arrancan en 100',
    (await existencia('PRODUCCION')) === 100 && (await existencia('PRUEBA')) === 100);

  // Aprobar el conduce de PRACTICAS. Tiene el mismo numero que el real.
  await DeliveryRepository.approve(conducePrueba.id, USER, A, 'PRUEBA');

  ok('la existencia REAL no se movio', (await existencia('PRODUCCION')) === 100,
    String(await existencia('PRODUCCION')));
  ok('la de practicas bajo a 96', (await existencia('PRUEBA')) === 96,
    String(await existencia('PRUEBA')));

  console.log('\n3) Y no se puede alcanzar el conduce real desde PRUEBA\n');
  let cruzado = '';
  try {
    await DeliveryRepository.approve(conduceReal.id, USER, A, 'PRUEBA');
  } catch (e: any) { cruzado = e.message; }
  ok('aprobar el real desde PRUEBA se rechaza', cruzado !== '', cruzado.slice(0, 70) || 'no lanzo');
  ok('y la existencia real sigue intacta', (await existencia('PRODUCCION')) === 100,
    String(await existencia('PRODUCCION')));

  console.log('\n4) CONTROL: en su propio entorno si funciona\n');
  await DeliveryRepository.approve(conduceReal.id, USER, A, 'PRODUCCION');
  ok('la existencia real baja a 96', (await existencia('PRODUCCION')) === 96,
    String(await existencia('PRODUCCION')));

  console.log('\n5) Listado de conduces\n');
  const lReal = await DeliveryRepository.list(A, 'PRODUCCION');
  const lPrueba = await DeliveryRepository.list(A, 'PRUEBA');
  ok('el listado real trae uno', lReal.data.length === 1 && lReal.meta.total === 1,
    `${lReal.data.length}/${lReal.meta.total}`);
  ok('el de practicas tambien', lPrueba.data.length === 1 && lPrueba.meta.total === 1,
    `${lPrueba.data.length}/${lPrueba.meta.total}`);
  ok('y no son el mismo', lReal.data[0].id !== lPrueba.data[0].id);

  console.log('\n6) La ruta del codigo escaneado\n');
  const r = fuente('src/app/api/v1/delivery-notes/apply-code/route.ts');
  ok('busca el conduce dentro del entorno', /eq\(deliveryNotes\.modo, auth\.modo\)/.test(r));
  ok('la factura tambien', /eq\(invoices\.modo, auth\.modo\)/.test(r));
  ok('y los conduces de esa factura',
    (r.match(/eq\(deliveryNotes\.modo, auth\.modo\)/g) || []).length === 2,
    String((r.match(/eq\(deliveryNotes\.modo, auth\.modo\)/g) || []).length));

  console.log('\n7) El repositorio\n');
  const dr = fuente('src/repositories/deliveryRepository.ts');
  ok('la numeracion filtra el entorno', /eq\(deliveryNotes\.modo, modo\),\n\s*like\(/.test(dr));
  ok('getByInvoiceId lo exige aunque no tenga llamadores',
    /getByInvoiceId\(\s*invoiceId: string,\s*companyId: string,\s*modo: 'PRODUCCION' \| 'PRUEBA'/.test(dr));
  ok('las sumas internas van acotadas por empresa',
    (dr.match(/eq\(deliveryNotes\.companyId, companyId\),\n\s*eq\(deliveryNotes\.status, 'approved'\)/g) || []).length === 2);
  ok('la ruta del listado pasa el entorno',
    /list\(auth\.companyId, auth\.modo, page, perPage\)/.test(
      fuente('src/app/api/v1/delivery-notes/route.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
