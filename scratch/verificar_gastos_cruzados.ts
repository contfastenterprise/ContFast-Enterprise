/**
 * Tres sitios donde un id del CUERPO de la peticion alcanzaba a otra empresa.
 *
 *   POST /api/v1/expenses            lee el nivel de inventario ajeno
 *   PUT  /api/v1/expenses/[id]       lo lee Y LO REESCRIBE
 *   invoiceFileGenerator             lee el producto ajeno y lo imprime en el PDF
 *
 * Los tres compartian la misma raiz: `productId` y `warehouseId` llegan del
 * body, el esquema solo comprueba que sean UUID, y la consulta no filtraba por
 * empresa. El caso del PUT es el peor porque el UPDATE se anclaba en el `id`
 * devuelto por esa lectura, asi que escribia sobre la existencia de la victima.
 *
 * Este banco reproduce las consultas tal y como quedan ahora y comprueba las dos
 * mitades: que el ataque no pasa, y que la operacion legitima sigue pasando.
 */
import { db } from '../src/db';
import { sql, and, eq, inArray } from 'drizzle-orm';
import { inventoryLevels, products, warehouses } from '../src/db/schema';
import { readFileSync } from 'fs';
import { join } from 'path';

const A = '11111111-1111-1111-1111-111111111111'; // atacante
const B = '22222222-2222-2222-2222-222222222222'; // victima
const ALM_A = 'cccccccc-0000-0000-0000-000000000001'; // Principal, de A
const ALM_B = 'cccccccc-0000-0000-0000-000000000003'; // Central, de B
const PROD_A = 'dddddddd-0000-0000-0000-000000000001';
const PROD_B = 'dddddddd-0000-0000-0000-000000000004';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const nivel = async (p: string, w: string) => {
  const r = await db.execute(sql`
    SELECT quantity FROM inventory_levels
    WHERE product_id = ${p}::uuid AND warehouse_id = ${w}::uuid AND modo = 'PRODUCCION'`);
  const f = (r as unknown as { quantity: string }[])[0];
  return f ? Number(f.quantity) : null;
};

/** La guarda que ahora corre antes de la transaccion en las dos rutas de gasto. */
async function guarda(companyId: string, warehouseId: string, idsProducto: string[]) {
  const [almacen] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.companyId, companyId)))
    .limit(1);
  if (!almacen) return 'ALMACEN_AJENO';

  if (idsProducto.length > 0) {
    const propios = await db
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.id, idsProducto), eq(products.companyId, companyId)));
    if (propios.length !== idsProducto.length) return 'PRODUCTO_AJENO';
  }
  return 'OK';
}

/** La lectura del nivel, ya con el filtro de empresa. */
const leerNivel = (companyId: string, productId: string, warehouseId: string) =>
  db
    .select({ id: inventoryLevels.id, balance: inventoryLevels.quantity })
    .from(inventoryLevels)
    .where(and(
      eq(inventoryLevels.companyId, companyId),
      eq(inventoryLevels.productId, productId),
      eq(inventoryLevels.warehouseId, warehouseId),
      eq(inventoryLevels.modo, 'PRODUCCION')
    ));

async function main() {
  await db.execute(sql`DELETE FROM inventory_movements`);
  await db.execute(sql`DELETE FROM inventory_levels`);
  await db.execute(sql`
    INSERT INTO inventory_levels (company_id, modo, product_id, warehouse_id, quantity) VALUES
      (${A}::uuid, 'PRODUCCION', ${PROD_A}::uuid, ${ALM_A}::uuid,  20.0000),
      (${B}::uuid, 'PRODUCCION', ${PROD_B}::uuid, ${ALM_B}::uuid, 500.0000)
  `);

  console.log('\n1) La empresa A manda en el body el almacen y el producto de B\n');
  ok('la guarda rechaza el almacen ajeno',
    (await guarda(A, ALM_B, [PROD_B])) === 'ALMACEN_AJENO');
  ok('y tambien el producto ajeno en su propio almacen',
    (await guarda(A, ALM_A, [PROD_B])) === 'PRODUCTO_AJENO');
  ok('control: con lo suyo, pasa',
    (await guarda(A, ALM_A, [PROD_A])) === 'OK');

  console.log('\n2) Aunque la guarda no estuviera, la lectura ya no alcanza\n');
  const ajeno = await leerNivel(A, PROD_B, ALM_B);
  ok('A no lee la existencia de B', ajeno.length === 0, JSON.stringify(ajeno));
  const propio = await leerNivel(A, PROD_A, ALM_A);
  ok('control: A si lee la suya', propio.length === 1 && Number(propio[0].balance) === 20,
    JSON.stringify(propio.map((x) => x.balance)));

  console.log('\n3) El UPDATE del PUT se anclaba en el id de esa lectura\n');
  // Antes: levelResult[0] traia la fila de B y el update la reescribia.
  // Ahora la lectura no devuelve nada, asi que la rama de update no se ejecuta
  // y el codigo cae al insert, que graba con el companyId propio.
  if (ajeno.length > 0) {
    await db.execute(sql`UPDATE inventory_levels SET quantity = 0 WHERE id = ${ajeno[0].id}::uuid`);
  }
  ok('la existencia de B sigue en 500', (await nivel(PROD_B, ALM_B)) === 500,
    String(await nivel(PROD_B, ALM_B)));

  console.log('\n4) El PDF fiscal no puede llevar el producto de otra empresa\n');
  const idsDelBody = [PROD_B];
  const paraElPdf = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(and(inArray(products.id, idsDelBody), eq(products.companyId, A)));
  ok('A no resuelve el producto de B', paraElPdf.length === 0,
    JSON.stringify(paraElPdf.map((p) => p.sku)));

  const suyo = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(and(inArray(products.id, [PROD_A]), eq(products.companyId, A)));
  ok('control: si resuelve el suyo', suyo.length === 1 && suyo[0].sku === 'PC-01',
    JSON.stringify(suyo.map((p) => p.sku)));

  console.log('\n5) Y la empresa duena sigue viendo lo suyo\n');
  const desdeB = await leerNivel(B, PROD_B, ALM_B);
  ok('B lee su propia existencia', desdeB.length === 1 && Number(desdeB[0].balance) === 500);

  // ---------------------------------------------------------------------
  // Las comprobaciones de arriba replican las consultas; no ejecutan las rutas,
  // que necesitarian un NextRequest completo. Asi que ademas se mira el codigo
  // de verdad: si alguien quita el filtro, esto falla.
  console.log('\n6) El filtro sigue en el codigo, no solo en esta prueba\n');

  const fuente = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf8');

  const post = fuente('src/app/api/v1/expenses/route.ts');
  ok('POST /expenses filtra la empresa al leer el nivel',
    /levelResult = await tx\.select[^;]*inventoryLevels\.companyId/s.test(post));
  ok('POST /expenses valida el almacen antes de la transaccion',
    /warehouses\.companyId, session\.companyId/.test(post));
  ok('POST /expenses valida los productos del body',
    /inArray\(products\.id, idsProducto\)[^;]*products\.companyId/s.test(post));

  const put = fuente('src/app/api/v1/expenses/[id]/route.ts');
  ok('PUT /expenses/[id] filtra la empresa al leer el nivel',
    /levelResult = await tx[^;]*inventoryLevels\.companyId/s.test(put));
  ok('PUT /expenses/[id] valida el almacen antes de la transaccion',
    /warehouses\.companyId, session\.companyId/.test(put));

  const pdf = fuente('src/services/invoice/invoiceFileGenerator.ts');
  ok('el generador del PDF filtra los productos por empresa',
    /inArray\(products\.id, productIds as string\[\]\),\s*eq\(products\.companyId, data\.companyId\)/s.test(pdf));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
