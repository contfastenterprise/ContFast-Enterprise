/**
 * El conduce de entrega descontaba inventario de PRODUCCION aunque se aprobara
 * en PRUEBA.
 *
 * `approve` llamaba a checkStock y deductStock sin pasarles `modo`, y el valor
 * por defecto de ese parametro es 'PRODUCCION'. Como facturar no descuenta
 * stock (la deduccion esta diferida al conduce), el despacho es el UNICO punto
 * donde el inventario baja: un despacho de prueba se comia existencias reales.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { DeliveryRepository } from '../src/repositories/deliveryRepository';

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const ALM = 'cccccccc-0000-0000-0000-000000000001';
const PROD = 'dddddddd-0000-0000-0000-000000000001';
const FAC = 'aaaa1111-0000-0000-0000-000000000001';
const CON = 'aaaa2222-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const uno = async (q: any) => ((await db.execute(q)) as any[])[0];
const nivel = async (modo: string) => Number((await uno(sql`
  SELECT quantity FROM inventory_levels
  WHERE company_id=${A}::uuid AND product_id=${PROD}::uuid
    AND warehouse_id=${ALM}::uuid AND modo=${modo}::environment_mode`))?.quantity ?? -1);

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);

  // Mismo producto y almacen en los dos entornos, con existencias distintas
  // para poder ver cual de las dos se toca.
  await db.execute(sql`INSERT INTO inventory_levels (company_id,modo,product_id,warehouse_id,quantity) VALUES
    (${A}::uuid,'PRODUCCION',${PROD}::uuid,${ALM}::uuid,100),
    (${A}::uuid,'PRUEBA',    ${PROD}::uuid,${ALM}::uuid,40)`);

  // Factura y conduce, los dos en PRUEBA.
  await db.execute(sql`INSERT INTO invoices (id,company_id,modo,user_id,warehouse_id,ncf,ecf_type,status,total)
    VALUES (${FAC}::uuid,${A}::uuid,'PRUEBA',${USER_A}::uuid,${ALM}::uuid,'E310000000009','31','accepted',1000)`);
  await db.execute(sql`INSERT INTO invoice_lines (invoice_id,product_id,quantity,unit_price,subtotal,total)
    VALUES (${FAC}::uuid,${PROD}::uuid,10,100,1000,1000)`);
  await db.execute(sql`INSERT INTO delivery_notes (id,company_id,modo,invoice_id,user_id,status,delivery_date,delivery_number)
    VALUES (${CON}::uuid,${A}::uuid,'PRUEBA',${FAC}::uuid,${USER_A}::uuid,'draft','2026-06-15','CD-PRUEBA-1')`);
  await db.execute(sql`INSERT INTO delivery_note_lines (delivery_note_id,product_id,quantity)
    VALUES (${CON}::uuid,${PROD}::uuid,10)`);
}

async function main() {
  await sembrar();
  ok('punto de partida: 100 en PRODUCCION y 40 en PRUEBA',
    (await nivel('PRODUCCION')) === 100 && (await nivel('PRUEBA')) === 40);

  console.log('\nSe aprueba en PRUEBA un conduce de 10 unidades\n');
  await DeliveryRepository.approve(CON, USER_A, A, 'PRUEBA');

  const prod = await nivel('PRODUCCION');
  const prueba = await nivel('PRUEBA');
  ok('descuenta del inventario de PRUEBA (40 -> 30)', prueba === 30, String(prueba));
  ok('NO toca el inventario de PRODUCCION (sigue en 100)', prod === 100, String(prod));

  const mov: any = await uno(sql`SELECT modo::text AS modo, quantity FROM inventory_movements`);
  ok('el movimiento de kardex queda en PRUEBA', mov?.modo === 'PRUEBA', JSON.stringify(mov));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
