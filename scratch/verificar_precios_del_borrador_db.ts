/**
 * Lote 266, contra una base -- el borrador guarda el nivel de cada linea y lo devuelve al reabrirlo.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado. Ejecuta las rutas de
 * verdad (`POST /api/v1/invoices/draft` y `GET /api/v1/invoices/[id]`) con las cabeceras internas.
 *
 * Primero SIN la columna (se borra, como una base donde no se aplico la 0019): el borrador se guarda
 * y se reabre igual que antes, sin nivel. Despues CON ella: cada linea vuelve con el suyo. En ese
 * orden porque el codigo recuerda la columna una vez vista.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-266-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-266-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-266';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, invoiceLines } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = '26600000-0000-4000-8000-000000000001';
const P2 = '26600000-0000-4000-8000-000000000002';
const W = '26600000-0000-4000-8000-0000000000aa';

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const exige = (t: string, c: boolean) => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}`); console.log(`  pre   ${t}`); };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;

const cabeceras = () => ({
  'x-user-id': USER, 'x-company-id': A, 'x-user-role': 'sistemas', 'x-role-id': ROL,
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
  'content-type': 'application/json',
});

async function main() {
  console.log('\n0) Precondiciones\n');
  //  La semilla no trae almacen para la empresa A: el banco siembra el suyo.
  await db.execute(sql`INSERT INTO warehouses (id, company_id, name, code) VALUES (${W}::uuid, ${A}::uuid, 'Almacen 266', 'ALM-266')
    ON CONFLICT (id) DO NOTHING`);
  const [almacen] = await todas(sql`SELECT id::text AS id FROM warehouses WHERE id = ${W}::uuid`);
  exige('la empresa A tiene un almacen', !!almacen);
  await db.execute(sql`DELETE FROM products WHERE id IN (${P1}::uuid, ${P2}::uuid)`);
  await db.execute(sql`INSERT INTO products (id, company_id, name, sku, cost, price, price_consumidor, price_mayorista, price_proveedor) VALUES
    (${P1}::uuid, ${A}::uuid, 'Puerta 266', 'P-266-1', 100, 133.33, 125, 117.65, 111.11),
    (${P2}::uuid, ${A}::uuid, 'Dintel 266', 'P-266-2', 40, 53.33, 50, 47.06, 44.44)`);
  const borrador = (await import('../src/app/api/v1/invoices/draft/route')) as unknown as Record<string, Handler>;
  const factura = (await import('../src/app/api/v1/invoices/[id]/route')) as unknown as Record<string, Handler>;
  exige('las rutas del borrador responden', typeof borrador.POST === 'function' && typeof factura.GET === 'function');

  const guardar = async () => {
    const res = await borrador.POST(new NextRequest('http://localhost/api/v1/invoices/draft', {
      method: 'POST', headers: cabeceras(), body: JSON.stringify({
        warehouseId: almacen.id, ecfType: '32', paymentType: 'cash', buyerName: 'Cliente 266',
        lines: [
          { productId: P1, productName: 'Puerta 266', quantity: 2, unitPrice: 117.65, discount: 0, taxRate: 0.18, priceTier: 'mayorista' },
          { productId: P2, productName: 'Dintel 266', quantity: 1, unitPrice: 44.44, discount: 0, taxRate: 0.18, priceTier: 'proveedor' },
        ],
      }),
    }));
    const cuerpo = (await res.json()) as { data?: { id?: string }; error?: { message?: string } };
    if (res.status !== 201) console.log(`        (el borrador contesto ${res.status}: ${cuerpo.error?.message ?? ''})`);
    return { estado: res.status, id: cuerpo.data?.id };
  };
  const reabrir = async (id: string) => {
    const res = await factura.GET(new NextRequest(`http://localhost/api/v1/invoices/${id}`, { method: 'GET', headers: cabeceras() }),
      { params: Promise.resolve({ id }) });
    const cuerpo = (await res.json()) as { data?: { lines?: Array<{ productId: string; priceTier: string | null }> } };
    return { estado: res.status, niveles: Object.fromEntries((cuerpo.data?.lines ?? []).map((l) => [l.productId, l.priceTier])) };
  };

  console.log('\n1) SIN la migracion 0019 (la columna no existe)\n');
  await db.execute(sql`ALTER TABLE invoice_lines DROP COLUMN IF EXISTS price_tier`);
  const sin = await guardar();
  const sinLeido = sin.id ? await reabrir(sin.id) : { estado: 0, niveles: {} };
  invariante('el borrador se guarda y se reabre como antes (201 y 200), sin nivel',
    //  `== null`: antes del lote la linea no traia `priceTier` (undefined); ahora, sin la columna, null.
    //  Y las DOS lineas tienen que volver: un mapa vacio tambien da `== null` de balde.
    sin.estado === 201 && sinLeido.estado === 200 && P1 in sinLeido.niveles && P2 in sinLeido.niveles
      && sinLeido.niveles[P1] == null && sinLeido.niveles[P2] == null,
    `${sin.estado} ${sinLeido.estado} ${JSON.stringify(sinLeido.niveles)}`);
  const filaEntera = await db.select().from(invoiceLines).limit(1);
  invariante('  y leer la fila entera de invoice_lines (conduces) sigue funcionando', Array.isArray(filaEntera));

  console.log('\n2) CON la migracion 0019\n');
  await db.execute(sql`ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS price_tier varchar(16)`);
  const con = await guardar();
  const conLeido = con.id ? await reabrir(con.id) : { estado: 0, niveles: {} };
  ok('el borrador guarda el nivel de cada linea y lo devuelve al reabrirlo',
    con.estado === 201 && conLeido.estado === 200 && conLeido.niveles[P1] === 'mayorista' && conLeido.niveles[P2] === 'proveedor',
    `${con.estado} ${conLeido.estado} ${JSON.stringify(conLeido.niveles)}`);
  const enLaBase = con.id ? await todas(sql`SELECT price_tier FROM invoice_lines WHERE invoice_id = ${con.id}::uuid ORDER BY price_tier`) : [];
  ok('  en la columna de la base', JSON.stringify(enLaBase.map((f) => f.price_tier)) === '["mayorista","proveedor"]', JSON.stringify(enLaBase));
  const filaEntera2 = await db.select().from(invoiceLines).limit(1);
  invariante('  y la fila entera de invoice_lines se sigue leyendo con la columna puesta', Array.isArray(filaEntera2));

  await db.execute(sql`DELETE FROM invoice_taxes WHERE invoice_id IN (SELECT id FROM invoices WHERE buyer_name = 'Cliente 266')`);
  await db.execute(sql`DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE buyer_name = 'Cliente 266')`);
  await db.execute(sql`DELETE FROM invoices WHERE buyer_name = 'Cliente 266'`);
  await db.execute(sql`DELETE FROM products WHERE id IN (${P1}::uuid, ${P2}::uuid)`);
  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S), ${rotas} invariante(s) rota(s)`}`);
  setTimeout(() => process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1), 300);
}

main().catch((e) => { console.error(e); process.exit(2); });
