/**
 * Lote 224 (INTEGRACION, base desechable) -- despachar lo disponible de un
 * conduce y dejar el resto en un borrador nuevo.
 *
 * Pedido del dueño: con mercancia que falta, despachar lo que hay. La
 * aprobacion era todo o nada y un borrador no se edita. Aqui se EJECUTA
 * `DeliveryRepository.despacharLoDisponible` contra una base de verdad, porque
 * lo que importa no se ve leyendo: que la existencia baje lo justo, que el
 * costo de venta se asiente, que la factura quede en entrega parcial, que un
 * fallo de la aprobacion de dentro deshaga TAMBIEN el reparto, y que dos
 * pulsaciones a la vez no partan el conduce dos veces.
 *
 *   powershell -ExecutionPolicy Bypass -File scratch\bancos_db\base_desechable.ps1 -Accion correr -Bancos verificar_despachar_disponible_db.ts
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { DeliveryRepository } from '../src/repositories/deliveryRepository';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const CLIENTE = 'ffffffff-0000-0000-0000-00000000dd24';
const ALM = 'cccccccc-0000-0000-0000-000000000001';
const PUERTA = 'dddddddd-0000-0000-0000-000000000001';
const BISAGRA = 'dddddddd-0000-0000-0000-000000000002';
const SELLADOR = 'dddddddd-0000-0000-0000-000000000003';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
type Fila = Record<string, unknown>;
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Fila[];

async function nivel(prod: string, cantidad: number, costo = 100) {
  await db.execute(sql`
    INSERT INTO inventory_levels (company_id, modo, product_id, warehouse_id, quantity, average_cost)
    VALUES (${A}::uuid, 'PRODUCCION', ${prod}::uuid, ${ALM}::uuid, ${cantidad}, ${costo})
    ON CONFLICT (product_id, warehouse_id, modo)
    DO UPDATE SET quantity = excluded.quantity, average_cost = excluded.average_cost`);
}

async function sembrar() {
  await limpiarTodo();
  await db.execute(sql`DELETE FROM customers WHERE id = ${CLIENTE}::uuid`);
  await db.execute(sql`INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente 224')`);
  await db.execute(sql`UPDATE products SET tracks_inventory = true WHERE id IN (${PUERTA}::uuid, ${BISAGRA}::uuid)`);
  // El sellador es un servicio: no lleva inventario, nunca falta.
  await db.execute(sql`UPDATE products SET tracks_inventory = false WHERE id = ${SELLADOR}::uuid`);
}

let secuencia = 0;
async function factura(lineas: Array<[string, number]>) {
  secuencia++;
  const [f] = await q(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, warehouse_id, ncf, ecf_type, total, codigo_factura, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER}::uuid, ${CLIENTE}::uuid, ${ALM}::uuid,
            ${'E3100002240' + String(secuencia).padStart(2, '0')}, '31', 1000, ${'FAC-224-' + secuencia}, 'accepted')
    RETURNING id`);
  for (const [prod, cant] of lineas) {
    await db.execute(sql`
      INSERT INTO invoice_lines (invoice_id, product_id, warehouse_id, quantity, unit_price, discount, subtotal, total)
      VALUES (${f.id as string}::uuid, ${prod}::uuid, ${ALM}::uuid, ${cant}, 100, 0, ${cant * 100}, ${cant * 100})`);
  }
  return f.id as string;
}

async function borrador(invoiceId: string, lineas: Array<[string, number]>) {
  const n = await DeliveryRepository.create({
    companyId: A, modo: 'PRODUCCION', invoiceId, userId: USER, deliveryDate: new Date(),
    driverName: 'Chofer 224', lines: lineas.map(([productId, quantity]) => ({ productId, quantity })),
  });
  return { id: n.id, numero: n.deliveryNumber };
}

const existencia = async (prod: string) =>
  Number((await q(sql`SELECT quantity FROM inventory_levels WHERE company_id = ${A}::uuid AND product_id = ${prod}::uuid
    AND warehouse_id = ${ALM}::uuid AND modo = 'PRODUCCION'`))[0]?.quantity ?? 0);
const lineas = async (noteId: string) =>
  Object.fromEntries((await q(sql`SELECT product_id, sum(quantity)::numeric AS q FROM delivery_note_lines
    WHERE delivery_note_id = ${noteId}::uuid GROUP BY product_id`)).map((r) => [r.product_id as string, Number(r.q)]));
const conduces = async (invoiceId: string) =>
  q(sql`SELECT id, delivery_number, status, notes, driver_name FROM delivery_notes
    WHERE invoice_id = ${invoiceId}::uuid AND deleted_at IS NULL ORDER BY delivery_number`);
const lanza = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

/** Todas las comprobaciones, para dar FALLA una a una si el mecanismo no existe. */
const ETIQUETAS = [
  'devuelve el conduce despachado y el nuevo pendiente', 'el conduce original queda APROBADO',
  '  con lo que habia: 1 puerta, 10 bisagras, 3 selladores', 'el nuevo es BORRADOR y solo lleva lo que falta: 4 puertas',
  '  dice de donde viene y hereda el transporte', 'la existencia baja lo justo: puerta 0, bisagra 10',
  'la factura queda en entrega PARCIAL', 'se asienta el costo de venta de lo despachado (11 unidades x 100)',
  'mientras no haya, aprobar el pendiente se niega', 'con la mercancia, se aprueba y la factura queda ENTREGADA',
  'un conduce ya despachado no se parte', 'sin nada disponible se niega, y no toca nada',
  'se aprueba entero y no crea borrador nuevo', 'la aprobacion de dentro lo rechaza',
  '  y NO queda nada a medias: renglones intactos, sin borrador nuevo, existencia igual',
  'solo una gana: un despachado y UN pendiente', '  y la existencia baja una sola vez',
];

/**
 * Una seccion que lanza cuenta como FALLA y el banco SIGUE. Sin esto, un mutante
 * que hace lanzar a la aprobacion reventaba el banco, y "revento" no se
 * distingue de "el banco esta roto" (seccion 3 del metodo).
 */
async function seccion(titulo: string, cuerpo: () => Promise<void>) {
  console.log(`\n${titulo}\n`);
  try { await cuerpo(); } catch (e) { ok(`la seccion no lanza (${titulo.slice(0, 2)})`, false, (e as Error).message); }
}

async function main() {
  //  Sin el mecanismo (la contraprueba), FALLA por comprobacion en vez de
  //  reventar con un TypeError.
  if (typeof (DeliveryRepository as unknown as { despacharLoDisponible?: unknown }).despacharLoDisponible !== 'function') {
    for (const t of ETIQUETAS) ok(t, false, 'no existe DeliveryRepository.despacharLoDisponible');
    console.log(`\n${fallos} FALLIDAS\n`);
    process.exit(1);
  }
  await sembrar();

  let f1 = '';
  let c1 = { id: '', numero: '' };
  let nuevo: Fila | undefined;

  await seccion('1) Lo normal: sale lo que hay, lo demas queda en un borrador nuevo', async () => {
    await nivel(PUERTA, 1);
    await nivel(BISAGRA, 20);
    f1 = await factura([[PUERTA, 5], [BISAGRA, 10], [SELLADOR, 3]]);
    c1 = await borrador(f1, [[PUERTA, 5], [BISAGRA, 10], [SELLADOR, 3]]);
    const r1 = await DeliveryRepository.despacharLoDisponible(c1.id, USER, A, 'PRODUCCION');
    const tras1 = await conduces(f1);
    nuevo = tras1.find((c) => c.id !== c1.id);
    ok(ETIQUETAS[0], r1.despachado === c1.numero && !!r1.pendiente && r1.pendiente === nuevo?.delivery_number, JSON.stringify(r1));
    ok(ETIQUETAS[1], tras1.find((c) => c.id === c1.id)?.status === 'approved');
    const l1 = await lineas(c1.id);
    ok(ETIQUETAS[2], l1[PUERTA] === 1 && l1[BISAGRA] === 10 && l1[SELLADOR] === 3 && Object.keys(l1).length === 3, JSON.stringify(l1));
    const lNuevo = nuevo ? await lineas(nuevo.id as string) : {};
    ok(ETIQUETAS[3], nuevo?.status === 'draft' && lNuevo[PUERTA] === 4 && Object.keys(lNuevo).length === 1, JSON.stringify(lNuevo));
    ok(ETIQUETAS[4], /Pendiente del conduce/.test(String(nuevo?.notes)) && String(nuevo?.notes).includes(c1.numero)
      && nuevo?.driver_name === 'Chofer 224');
    ok(ETIQUETAS[5], (await existencia(PUERTA)) === 0 && (await existencia(BISAGRA)) === 10);
    const [fa] = await q(sql`SELECT delivery_status FROM invoices WHERE id = ${f1}::uuid`);
    ok(ETIQUETAS[6], fa.delivery_status === 'partial', String(fa.delivery_status));
    const asiento = await q(sql`SELECT count(*)::int AS n, coalesce(sum(l.debit), 0)::numeric AS debe FROM journal_entries e
      JOIN journal_entry_lines l ON l.journal_entry_id = e.id WHERE e.reference = ${c1.id} AND e.deleted_at IS NULL`);
    ok(ETIQUETAS[7], Number(asiento[0].debe) === 1100, JSON.stringify(asiento[0]));
  });

  await seccion('2) Lo pendiente se despacha cuando llega la mercancia', async () => {
    if (!nuevo) throw new Error('no hubo borrador pendiente en la seccion 1');
    const pendienteId = nuevo.id as string;
    const sinExistencia = await lanza(() => DeliveryRepository.approve(pendienteId, USER, A, 'PRODUCCION'));
    ok(ETIQUETAS[8], /Inventario insuficiente/.test(sinExistencia ?? ''), sinExistencia ?? 'no lanzo');
    await nivel(PUERTA, 4);
    await DeliveryRepository.approve(pendienteId, USER, A, 'PRODUCCION');
    const [fb] = await q(sql`SELECT delivery_status FROM invoices WHERE id = ${f1}::uuid`);
    ok(ETIQUETAS[9], fb.delivery_status === 'delivered', String(fb.delivery_status));
  });

  await seccion('3) Lo que se niega', async () => {
    const antes = (await conduces(f1)).length;
    const otraVez = await lanza(() => DeliveryRepository.despacharLoDisponible(c1.id, USER, A, 'PRODUCCION'));
    //  El mensaje EXACTO del reparto: la guarda de la aprobacion de dentro tambien
    //  dice "borrador", y sin la del reparto se llegaba a partir (y deshacer).
    ok(ETIQUETAS[10], otraVez === 'Solo se puede despachar en parte un conduce en borrador.'
      && (await conduces(f1)).length === antes, otraVez ?? 'no lanzo');
    await nivel(PUERTA, 0);
    const f2 = await factura([[PUERTA, 2]]);
    const c2 = await borrador(f2, [[PUERTA, 2]]);
    const nada = await lanza(() => DeliveryRepository.despacharLoDisponible(c2.id, USER, A, 'PRODUCCION'));
    ok(ETIQUETAS[11], /No hay existencia/.test(nada ?? '') && (await conduces(f2)).length === 1
      && (await lineas(c2.id))[PUERTA] === 2, nada ?? 'no lanzo');
  });

  await seccion('4) Si todo alcanza, es la aprobacion de siempre', async () => {
    await nivel(BISAGRA, 50);
    const f3 = await factura([[BISAGRA, 5]]);
    const c3 = await borrador(f3, [[BISAGRA, 5]]);
    const r3 = await DeliveryRepository.despacharLoDisponible(c3.id, USER, A, 'PRODUCCION');
    const cs = await conduces(f3);
    ok(ETIQUETAS[12], r3.pendiente === null && cs.length === 1 && cs[0].status === 'approved');
  });

  await seccion('5) Todo o nada: si la aprobacion de dentro falla, el reparto se deshace', async () => {
    // La bisagra ya se entrego entera por otro conduce: pedirla otra vez es un
    // EXCESO DE ENTREGA, que la aprobacion rechaza DESPUES de haber partido.
    await nivel(PUERTA, 1);
    await nivel(BISAGRA, 50);
    const f4 = await factura([[PUERTA, 5], [BISAGRA, 10]]);
    const previo = await borrador(f4, [[BISAGRA, 10]]);
    await DeliveryRepository.approve(previo.id, USER, A, 'PRODUCCION');
    const c4 = await borrador(f4, [[PUERTA, 5], [BISAGRA, 10]]);
    const antes = { puerta: await existencia(PUERTA), bisagra: await existencia(BISAGRA), conduces: (await conduces(f4)).length };
    const exceso = await lanza(() => DeliveryRepository.despacharLoDisponible(c4.id, USER, A, 'PRODUCCION'));
    const l4 = await lineas(c4.id);
    ok(ETIQUETAS[13], /Exceso de entrega/.test(exceso ?? ''), exceso ?? 'no lanzo');
    ok(ETIQUETAS[14], l4[PUERTA] === 5 && l4[BISAGRA] === 10 && (await conduces(f4)).length === antes.conduces
      && (await existencia(PUERTA)) === antes.puerta && (await existencia(BISAGRA)) === antes.bisagra,
      JSON.stringify({ l4, conduces: (await conduces(f4)).length }));
  });

  await seccion('6) Dos pulsaciones a la vez', async () => {
    await nivel(PUERTA, 1);
    const f5 = await factura([[PUERTA, 3]]);
    const c5 = await borrador(f5, [[PUERTA, 3]]);
    const dos = await Promise.allSettled([
      DeliveryRepository.despacharLoDisponible(c5.id, USER, A, 'PRODUCCION'),
      DeliveryRepository.despacharLoDisponible(c5.id, USER, A, 'PRODUCCION'),
    ]);
    const cs5 = await conduces(f5);
    ok(ETIQUETAS[15], dos.filter((d) => d.status === 'fulfilled').length === 1
      && cs5.length === 2 && cs5.filter((c) => c.status === 'draft').length === 1, JSON.stringify(cs5.map((c) => c.status)));
    ok(ETIQUETAS[16], (await existencia(PUERTA)) === 0);
  });

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
