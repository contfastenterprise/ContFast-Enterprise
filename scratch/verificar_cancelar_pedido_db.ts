/**
 * Lote 252, contra una base -- cancelar un pedido a suplidor.
 *
 * El boton "Cancelar pedido" mandaba `DELETE` a `/send`, que solo admite `POST`: 405, y la
 * pantalla decia "Error de red". Cancelar NUNCA funciono, y `SupplierOrderService.cancelOrder`
 * existia sin ruta. El lote anade `POST /api/v1/supplier-orders/[id]/cancel`.
 *
 * Integracion: base DESECHABLE, con candado. Ejecuta la ruta de verdad:
 *  · un borrador queda Cancelado, a la vista (no borrado), con su apunte en el historial;
 *  · uno recibido no se cancela (409) y no cambia;
 *  · uno de otra empresa no se toca (404);
 *  · `/send` sigue sin admitir DELETE (lo que mandaba la pantalla) -- y la pantalla ya no lo manda.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-252-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-252-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-252';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const SUP = '25200000-0000-4000-8000-0000000000a1';
const ALM = '25200000-0000-4000-8000-0000000000a2';
const PED_BORRADOR = '25200000-0000-4000-8000-000000000001';
const PED_RECIBIDO = '25200000-0000-4000-8000-000000000002';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
const fin = () => { console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`); setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300); };
const cabeceras = (empresa = A) => ({
  'x-user-id': USER, 'x-company-id': empresa, 'x-user-role': 'sistemas', 'x-role-id': ROL,
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
});
type Handler = (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;

async function main() {
  const E = [
    'cancelar un borrador lo deja Cancelado, a la vista, con su apunte en el historial',
    'uno recibido no se cancela (409) y no cambia',
    'uno de otra empresa no se toca (404)',
    'la pantalla cancela por la ruta nueva, y no con DELETE a /send',
  ];
  let ruta: Record<string, Handler> | null = null;
  try { ruta = (await import('../src/app/api/v1/supplier-orders/[id]/cancel/route')) as unknown as Record<string, Handler>; } catch { ruta = null; }
  if (!ruta?.POST) { for (const t of E) ok(t, false, 'no existe la ruta de cancelar'); return fin(); }

  await db.execute(sql`DELETE FROM purchase_order_logs WHERE purchase_order_id IN (${PED_BORRADOR}::uuid, ${PED_RECIBIDO}::uuid)`);
  await db.execute(sql`DELETE FROM purchase_orders WHERE id IN (${PED_BORRADOR}::uuid, ${PED_RECIBIDO}::uuid)`);
  await db.execute(sql`INSERT INTO suppliers (id, company_id, name) VALUES (${SUP}::uuid, ${A}::uuid, 'Suplidor 252') ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO warehouses (id, company_id, name, code) VALUES (${ALM}::uuid, ${A}::uuid, 'Almacen 252', 'ALM-252') ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`
    INSERT INTO purchase_orders (id, company_id, modo, order_number, supplier_id, warehouse_id, status, created_by) VALUES
      (${PED_BORRADOR}::uuid, ${A}::uuid, 'PRODUCCION', 'PED-252-1', ${SUP}::uuid, ${ALM}::uuid, 'Draft', ${USER}::uuid),
      (${PED_RECIBIDO}::uuid, ${A}::uuid, 'PRODUCCION', 'PED-252-2', ${SUP}::uuid, ${ALM}::uuid, 'Received', ${USER}::uuid)`);

  const cancelar = async (id: string, empresa = A) => {
    const res = await ruta!.POST(new NextRequest(`http://localhost/api/v1/supplier-orders/${id}/cancel`, { method: 'POST', headers: cabeceras(empresa) }), { params: Promise.resolve({ id }) });
    return { estado: res.status, cuerpo: await res.json() as { error?: { message?: string } } };
  };
  const pedido = async (id: string) => (await todas(sql`SELECT status, deleted_at FROM purchase_orders WHERE id = ${id}::uuid`))[0];

  const r1 = await cancelar(PED_BORRADOR);
  const p1 = await pedido(PED_BORRADOR);
  const log = await todas(sql`SELECT action FROM purchase_order_logs WHERE purchase_order_id = ${PED_BORRADOR}::uuid`);
  ok(E[0], r1.estado === 200 && p1.status === 'Cancelled' && p1.deleted_at === null && log.some((l) => l.action === 'Pedido cancelado'), `${r1.estado} ${JSON.stringify(p1)}`);

  const r2 = await cancelar(PED_RECIBIDO);
  ok(E[1], r2.estado === 409 && (await pedido(PED_RECIBIDO)).status === 'Received', `${r2.estado} ${r2.cuerpo.error?.message}`);

  const r3 = await cancelar(PED_RECIBIDO, B);
  ok(E[2], r3.estado === 404 && (await pedido(PED_RECIBIDO)).status === 'Received', String(r3.estado));

  const pagina = readFileSync(join(__dirname, '../src/app/dashboard/purchases/orders/page.tsx'), 'utf8');
  const cancelarEnPantalla = pagina.slice(pagina.indexOf('const handleCancelOrder'), pagina.indexOf('const openReceiveModal'));
  ok(E[3], /fetch\(`\/api\/v1\/supplier-orders\/\$\{id\}\/cancel`, \{ method: 'POST' \}\)/.test(cancelarEnPantalla) && !/method: 'DELETE'/.test(cancelarEnPantalla));

  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
