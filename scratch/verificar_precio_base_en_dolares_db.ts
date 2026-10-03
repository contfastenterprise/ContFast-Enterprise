/**
 * Lote 258, contra una base -- el precio BASE en dolares.
 *
 * Integracion: base DESECHABLE (scratch/bancos_db), con candado. Ejecuta las rutas de verdad con las
 * cabeceras internas firmadas. Lo que solo se ve ejecutando:
 *  · SIN la migracion 0018 (se quita la columna para simularlo) la lista sigue respondiendo, y fijar
 *    un precio contesta 409 nombrando la 0018 -- desplegar antes de aplicarla no tumba nada;
 *  · CON ella, el precio se guarda (cuatro decimales), vacio lo quita, y otra empresa no lo toca;
 *  · al aplicar la tasa, el precio base sale del precio en dolares x tasa y los otros tres niveles
 *    conservan su margen; un producto sin precio en dolares, como antes.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-258-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-258-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-258';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = '25800000-0000-4000-8000-000000000001';
const P2 = '25800000-0000-4000-8000-000000000002';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
const fin = () => {
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
};

type Handler = (r: NextRequest) => Promise<Response>;
const cabeceras = (empresa = A) => ({
  'x-user-id': USER, 'x-company-id': empresa, 'x-user-role': 'sistemas', 'x-role-id': ROL,
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
  'content-type': 'application/json',
});

async function main() {
  const E = [
    'sin la migracion 0018, la lista de productos en dolares sigue respondiendo',
    '  y fijar un precio contesta 409 nombrando la 0018',
    'con la 0018, el precio base en dolares se guarda con cuatro decimales',
    '  otra empresa no se lo puede fijar (404, y no se toca)',
    '  y la lista lo devuelve con el precio base calculado a la tasa',
    'al aplicar, el precio base = precio en dolares x tasa; los otros niveles conservan su margen',
    '  y un producto sin precio en dolares se aplica como antes (margen)',
    'vacio quita el precio en dolares',
  ];
  let ruta: Record<string, Handler> | null = null;
  let aplicar: Record<string, Handler> | null = null;
  let tasa: Record<string, Handler> | null = null;
  try {
    ruta = (await import('../src/app/api/v1/products/dolar/route')) as unknown as Record<string, Handler>;
    aplicar = (await import('../src/app/api/v1/products/dolar/aplicar/route')) as unknown as Record<string, Handler>;
    tasa = (await import('../src/app/api/v1/products/dolar/tasa/route')) as unknown as Record<string, Handler>;
  } catch { ruta = null; }
  const tablas = await todas(sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'productos_en_dolares'`);
  if (!ruta?.PATCH || !aplicar?.POST || !tasa?.PUT || tablas.length !== 1) { for (const t of E) ok(t, false, 'no existe la ruta PATCH o la tabla'); return fin(); }

  const pedir = async (h: Handler, metodo: string, url: string, cuerpo?: unknown, empresa = A) => {
    const res = await h(new NextRequest(`http://localhost${url}`, { method: metodo, headers: cabeceras(empresa), body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }));
    return { estado: res.status, cuerpo: await res.json() as AnyBody };
  };
  type AnyBody = { error?: { message?: string }; data?: { renglones?: { productId: string; precioUsd: number | null; calculo: { despues: Record<string, number> } | null }[] } };

  await db.execute(sql`DELETE FROM productos_en_dolares`);
  await db.execute(sql`DELETE FROM products WHERE id IN (${P1}::uuid, ${P2}::uuid)`);
  await db.execute(sql`
    INSERT INTO products (id, company_id, name, sku, cost, price, price_consumidor, price_mayorista, price_proveedor) VALUES
      (${P1}::uuid, ${A}::uuid, 'Puerta 258 A', 'P-258-1', 100, 130, 125, 115, 110),
      (${P2}::uuid, ${A}::uuid, 'Puerta 258 B', 'P-258-2', 100, 130, 125, 115, 110)`);
  const atado = await pedir(ruta.PUT, 'PUT', '/api/v1/products/dolar', { productIds: [P1, P2], costoUsd: '2' });
  if (atado.estado !== 200) throw new Error(`Precondicion: no se pudieron atar los productos (${atado.estado})`);

  //  Sin la 0018: se quita la columna. Va PRIMERO, porque el repositorio recuerda haberla visto.
  await db.execute(sql`ALTER TABLE productos_en_dolares DROP COLUMN IF EXISTS precio_usd`);
  const lista0 = await pedir(ruta.GET, 'GET', '/api/v1/products/dolar');
  ok(E[0], lista0.estado === 200 && (lista0.cuerpo.data?.renglones?.length ?? 0) === 2, String(lista0.estado));
  const sin = await pedir(ruta.PATCH, 'PATCH', '/api/v1/products/dolar', { productId: P1, precioUsd: '3' });
  ok(E[1], sin.estado === 409 && /0018_precio_base_en_dolares\.sql/.test(sin.cuerpo.error?.message ?? ''), `${sin.estado} ${sin.cuerpo.error?.message}`);

  await db.execute(sql`ALTER TABLE productos_en_dolares ADD COLUMN precio_usd numeric(15, 4)`);
  const fijado = await pedir(ruta.PATCH, 'PATCH', '/api/v1/products/dolar', { productId: P1, precioUsd: '3.333333' });
  const guardado = await todas(sql`SELECT precio_usd::text v FROM productos_en_dolares WHERE product_id = ${P1}::uuid`);
  ok(E[2], fijado.estado === 200 && guardado[0]?.v === '3.3333', `${fijado.estado} ${JSON.stringify(guardado)}`);

  const ajena = await pedir(ruta.PATCH, 'PATCH', '/api/v1/products/dolar', { productId: P2, precioUsd: '9' }, B);
  const p2 = await todas(sql`SELECT precio_usd v FROM productos_en_dolares WHERE product_id = ${P2}::uuid`);
  ok(E[3], ajena.estado === 404 && p2[0]?.v === null, `${ajena.estado} ${JSON.stringify(p2)}`);

  const t = await pedir(tasa.PUT, 'PUT', '/api/v1/products/dolar/tasa', { tasa: '60' });
  if (t.estado !== 200) throw new Error(`Precondicion: no se pudo escribir la tasa (${t.estado})`);
  const lista = await pedir(ruta.GET, 'GET', '/api/v1/products/dolar');
  const r1 = lista.cuerpo.data?.renglones?.find((x) => x.productId === P1);
  ok(E[4], r1?.precioUsd === 3.3333 && r1?.calculo?.despues.price === 200, JSON.stringify(r1?.calculo?.despues));

  const hecho = await pedir(aplicar.POST, 'POST', '/api/v1/products/dolar/aplicar', { tasa: 60, productos: [P1, P2] });
  const precios = await todas(sql`SELECT id::text id, cost::float8 c, price::float8 p, price_consumidor::float8 pc, price_mayorista::float8 pm, price_proveedor::float8 pp
    FROM products WHERE id IN (${P1}::uuid, ${P2}::uuid)`) as { id: string; c: number; p: number; pc: number; pm: number; pp: number }[];
  const a = precios.find((x) => x.id === P1), b = precios.find((x) => x.id === P2);
  ok(E[5], hecho.estado === 200 && a?.c === 120 && a?.p === 200 && a?.pc === 150 && a?.pm === 138 && a?.pp === 132, `${hecho.estado} ${JSON.stringify(a)}`);
  ok(E[6], b?.c === 120 && b?.p === 156 && b?.pc === 150, JSON.stringify(b));

  const quitado = await pedir(ruta.PATCH, 'PATCH', '/api/v1/products/dolar', { productId: P1, precioUsd: '' });
  const vacio = await todas(sql`SELECT precio_usd v FROM productos_en_dolares WHERE product_id = ${P1}::uuid`);
  ok(E[7], quitado.estado === 200 && vacio[0]?.v === null, `${quitado.estado} ${JSON.stringify(vacio)}`);

  //  La base queda como la deja la 0018.
  await db.execute(sql`ALTER TABLE productos_en_dolares DROP COLUMN IF EXISTS precio_usd`);
  await db.execute(sql`ALTER TABLE productos_en_dolares ADD COLUMN precio_usd numeric(15, 4)`);
  await db.execute(sql`ALTER TABLE productos_en_dolares ADD CONSTRAINT productos_en_dolares_precio_positivo CHECK (precio_usd IS NULL OR precio_usd > 0)`);
  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
