/**
 * Los tres ultimos sitios de la familia "id del request sin validar la empresa".
 *
 *   1. supplierOrderService.receiveItems  — el itemId del cuerpo no se
 *      comprobaba contra el pedido, asi que se podia recibir mercancia sobre la
 *      linea de un pedido AJENO y meterse ese producto en el almacen propio.
 *   2. invoiceSubmissionService           — leia el total y la fecha de una
 *      factura de otra empresa; esos dos datos viajan dentro del e-CF que se
 *      envia a la DGII.
 *   3. products/[id]/inventory            — creaba un nivel con el companyId
 *      propio apuntando a producto y almacen ajenos.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { SupplierOrderService } from '../src/services/supplierOrderService';

const A = '11111111-1111-1111-1111-111111111111'; // atacante
const B = '22222222-2222-2222-2222-222222222222'; // victima
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const ALM_A = 'cccccccc-0000-0000-0000-000000000001';
const ALM_B = 'cccccccc-0000-0000-0000-000000000003';
const PROD_A = 'dddddddd-0000-0000-0000-000000000001';
const PROD_B = 'dddddddd-0000-0000-0000-000000000004';
const SUP_A = 'aaaa3333-0000-0000-0000-00000000000a';
const SUP_B = 'aaaa3333-0000-0000-0000-00000000000b';
const PED_A = 'aaaa4444-0000-0000-0000-00000000000a';
const PED_B = 'aaaa4444-0000-0000-0000-00000000000b';
const IT_A = 'aaaa5555-0000-0000-0000-00000000000a';
const IT_B = 'aaaa5555-0000-0000-0000-00000000000b';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const uno = async (q: any) => ((await db.execute(q)) as any[])[0];
async function lanza(fn: () => Promise<any>): Promise<string | null> {
  try { await fn(); return null; } catch (e: any) { return e.message; }
}

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);
  await db.execute(sql`DELETE FROM suppliers`);

  await db.execute(sql`INSERT INTO suppliers (id,company_id,name) VALUES
    (${SUP_A}::uuid,${A}::uuid,'Suplidor A'), (${SUP_B}::uuid,${B}::uuid,'Suplidor B')`);
  await db.execute(sql`INSERT INTO purchase_orders (id,company_id,modo,order_number,supplier_id,warehouse_id,status,created_by) VALUES
    (${PED_A}::uuid,${A}::uuid,'PRODUCCION','PC-A-1',${SUP_A}::uuid,${ALM_A}::uuid,'Sent',${USER_A}::uuid),
    (${PED_B}::uuid,${B}::uuid,'PRODUCCION','PC-B-1',${SUP_B}::uuid,${ALM_B}::uuid,'Sent','bbbbbbbb-0000-0000-0000-000000000002'::uuid)`);
  await db.execute(sql`INSERT INTO purchase_order_items (id,purchase_order_id,product_id,quantity_requested,quantity_received) VALUES
    (${IT_A}::uuid,${PED_A}::uuid,${PROD_A}::uuid,20,0),
    (${IT_B}::uuid,${PED_B}::uuid,${PROD_B}::uuid,20,0)`);
}

async function main() {
  await sembrar();

  console.log('\n1) Pedidos: A intenta recibir sobre la linea del pedido de B\n');
  const err = await lanza(() =>
    SupplierOrderService.registerReception(PED_A, A, 'PRODUCCION', USER_A, [{ itemId: IT_B, quantityToReceive: 20 }]));
  ok('el intento se rechaza', err !== null, err || 'no lanzo');

  const itB: any = await uno(sql`SELECT quantity_received FROM purchase_order_items WHERE id=${IT_B}::uuid`);
  ok('la linea del pedido de B sigue en 0 recibido', Number(itB.quantity_received) === 0, itB.quantity_received);

  const invadido: any = await uno(sql`SELECT count(*)::int AS n FROM inventory_levels
    WHERE company_id=${A}::uuid AND product_id=${PROD_B}::uuid`);
  ok('el producto de B no entro en el inventario de A', invadido.n === 0, `${invadido.n} niveles`);

  // Control: sobre su propia linea si funciona
  await SupplierOrderService.registerReception(PED_A, A, 'PRODUCCION', USER_A, [{ itemId: IT_A, quantityToReceive: 5 }]);
  const itA: any = await uno(sql`SELECT quantity_received FROM purchase_order_items WHERE id=${IT_A}::uuid`);
  const nivA: any = await uno(sql`SELECT quantity FROM inventory_levels
    WHERE company_id=${A}::uuid AND product_id=${PROD_A}::uuid AND warehouse_id=${ALM_A}::uuid`);
  ok('sobre su propia linea A si recibe', Number(itA.quantity_received) === 5, itA.quantity_received);
  ok('y el stock propio sube a 5', Number(nivA?.quantity) === 5, nivA?.quantity);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
