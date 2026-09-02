/**
 * Productos que no llevan control de existencia.
 *
 * EL CASO REAL
 * ------------
 * "Servicios Instalacion" acumulaba -116 unidades en el almacen Principal. No
 * es un fallo de conteo: es un servicio, y el sistema le descontaba una unidad
 * por cada instalacion facturada porque no habia forma de decir que un producto
 * no se almacena. Ponerlo a cero no arreglaba nada -- la siguiente factura lo
 * devolvia a negativo.
 *
 * `products.tracks_inventory` (migracion 0033) lo declara. La guarda vive en
 * `inventoryService`, que es el paso obligado de todo el movimiento de
 * inventario, para que una ruta nueva herede el comportamiento sin acordarse.
 *
 * Las rutas que escriben niveles a mano sin pasar por el servicio -- los dos
 * gastos, los ajustes y los minimos por producto -- se comprueban aparte,
 * leyendo su codigo.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { checkStock, addStock, deductStock, transferStock, llevaInventario } from '../src/services/inventoryService';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const ALM = 'cccccccc-0000-0000-0000-000000000001'; // Principal
const ALM2 = 'cccccccc-0000-0000-0000-000000000002'; // Sucursal
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const PUERTA = 'dddddddd-0000-0000-0000-000000000001';   // lleva inventario
const SERVICIO = 'dddddddd-0000-0000-0000-0000000000f1'; // no lleva

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const nivel = async (productId: string) => {
  const r = await db.execute(sql`
    SELECT quantity FROM inventory_levels
    WHERE company_id = ${A}::uuid AND product_id = ${productId}::uuid
      AND warehouse_id = ${ALM}::uuid AND modo = 'PRODUCCION'`);
  const f = (r as unknown as { quantity: string }[])[0];
  return f ? Number(f.quantity) : null;
};

const movimientos = async (productId: string) => {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM inventory_movements
    WHERE company_id = ${A}::uuid AND product_id = ${productId}::uuid`);
  return (r as unknown as { n: number }[])[0].n;
};

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);
  // Las lineas de transferencia apuntan al producto por clave foranea. Si una
  // ejecucion anterior llego a crear alguna -- por ejemplo probando la mutacion
  // que quita la guarda de transferStock -- el DELETE de abajo falla. Se limpian
  // primero para que el banco se pueda repetir siempre.
  await db.execute(sql`DELETE FROM products WHERE id = ${SERVICIO}::uuid`);
  await db.execute(sql`
    INSERT INTO products (id, company_id, sku, name, cost, tracks_inventory)
    VALUES (${SERVICIO}::uuid, ${A}::uuid, 'SRV-01', 'Servicios Instalacion', 0, false)`);
  await db.execute(sql`UPDATE products SET tracks_inventory = true WHERE id = ${PUERTA}::uuid`);
  await db.execute(sql`
    INSERT INTO inventory_levels (company_id, modo, product_id, warehouse_id, quantity)
    VALUES (${A}::uuid, 'PRODUCCION', ${PUERTA}::uuid, ${ALM}::uuid, 3.0000)`);
}

async function main() {
  await sembrar();

  console.log('\n1) El servicio se reconoce como tal\n');
  ok('el servicio NO lleva inventario', (await llevaInventario(A, SERVICIO)) === false);
  ok('la puerta SI lleva inventario', (await llevaInventario(A, PUERTA)) === true);
  // productId llega del cuerpo de la peticion, asi que uno de otra empresa
  // puede llegar aqui. ANTES esto devolvia `false`, igual que un servicio, y
  // esa igualdad era el fallo: `addStock` retornaba en silencio y `checkStock`
  // respondia que si habia existencia. Son dos cosas distintas y ahora se
  // distinguen: no llevar inventario es un caso de negocio; no ser de esta
  // empresa es un error y se lanza.
  let ajeno = '';
  try {
    await llevaInventario('22222222-2222-2222-2222-222222222222', PUERTA);
  } catch (e: any) { ajeno = e.message; }
  ok('un producto de otra empresa lanza, no devuelve false',
    /no encontrado en esta empresa/i.test(ajeno), ajeno || 'no lanzo');

  console.log('\n2) checkStock: el servicio nunca bloquea un despacho\n');
  ok('se pueden despachar 500 instalaciones sin existencia',
    (await checkStock(A, 'PRODUCCION', SERVICIO, ALM, 500)) === true);
  ok('control: la puerta con 3 no deja sacar 500',
    (await checkStock(A, 'PRODUCCION', PUERTA, ALM, 500)) === false);
  ok('control: la puerta con 3 si deja sacar 3',
    (await checkStock(A, 'PRODUCCION', PUERTA, ALM, 3)) === true);

  console.log('\n3) deductStock: facturar el servicio no mueve nada\n');
  // Esto es exactamente lo que produjo el -116.
  for (let i = 0; i < 5; i++) {
    await deductStock(A, 'PRODUCCION', SERVICIO, ALM, 1, USER, 'sale', undefined, `Instalacion ${i}`);
  }
  ok('tras 5 ventas no existe nivel para el servicio', (await nivel(SERVICIO)) === null,
    String(await nivel(SERVICIO)));
  ok('ni un solo movimiento en el kardex', (await movimientos(SERVICIO)) === 0);

  console.log('\n4) Control: la puerta si se descuenta\n');
  await deductStock(A, 'PRODUCCION', PUERTA, ALM, 1, USER, 'sale', undefined, 'Venta');
  ok('la puerta baja de 3 a 2', (await nivel(PUERTA)) === 2, String(await nivel(PUERTA)));
  ok('y deja su movimiento', (await movimientos(PUERTA)) === 1);

  console.log('\n5) addStock: comprar el servicio tampoco crea existencia\n');
  await addStock(A, 'PRODUCCION', SERVICIO, ALM, 10, USER, 'purchase', undefined, 'Compra de mano de obra');
  ok('sigue sin nivel', (await nivel(SERVICIO)) === null);
  ok('sigue sin movimientos', (await movimientos(SERVICIO)) === 0);

  console.log('\n6) transferStock: el servicio no se puede transferir\n');
  let mensaje = '';
  try {
    await transferStock(A, 'PRODUCCION', ALM, ALM2, [{ productId: SERVICIO, quantity: 1 }], USER);
  } catch (e) {
    mensaje = (e as Error).message;
  }
  ok('lo rechaza', mensaje !== '');
  ok('y dice por que, no "Insufficient stock"',
    /no lleva control de existencia/.test(mensaje), mensaje.slice(0, 90));

  console.log('\n7) Las rutas que escriben niveles sin pasar por el servicio\n');

  ok('POST /expenses salta las lineas sin inventario',
    /!sinInventario\.has\(line\.productId\)/.test(fuente('src/app/api/v1/expenses/route.ts')));
  ok('PUT /expenses/[id] tambien',
    /!sinInventario\.has\(line\.productId\)/.test(fuente('src/app/api/v1/expenses/[id]/route.ts')));
  ok('los ajustes de inventario lo rechazan',
    /!producto\.tracksInventory/.test(fuente('src/app/api/v1/inventory/adjustments/route.ts')));
  ok('los minimos por producto tambien',
    /!producto\.tracksInventory/.test(fuente('src/app/api/v1/products/[id]/inventory/route.ts')));

  console.log('\n8) El campo se puede fijar desde la ficha\n');
  ok('la API de alta lo acepta',
    /tracksInventory: z\.boolean\(\)/.test(fuente('src/app/api/v1/products/route.ts')));
  ok('la API de edicion lo acepta',
    /tracksInventory: z\.boolean\(\)/.test(fuente('src/app/api/v1/products/[id]/route.ts')));
  ok('la pantalla tiene la casilla',
    /tracksInventory: e\.target\.checked/.test(fuente('src/app/dashboard/products/page.tsx')));

  console.log('\n9) Lo que ya existia no cambia de comportamiento\n');
  const [fila] = (await db.execute(sql`
    SELECT column_default, is_nullable FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'tracks_inventory'`)) as unknown as
    { column_default: string; is_nullable: string }[];
  ok('la columna es NOT NULL con DEFAULT true',
    fila.column_default === 'true' && fila.is_nullable === 'NO',
    `${fila.column_default} / ${fila.is_nullable}`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
