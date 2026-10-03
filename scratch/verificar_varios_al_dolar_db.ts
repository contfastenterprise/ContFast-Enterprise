/**
 * Lote 251, contra una base -- atar VARIOS productos al dolar de una vez.
 *
 * Integracion: base DESECHABLE (scratch/bancos_db), con candado. Ejecuta la ruta
 * de verdad con las cabeceras internas firmadas. Lo que solo se ve ejecutando:
 *  · varios productos quedan atados con el MISMO costo, en una peticion;
 *  · TODO O NADA: si uno es de otra empresa, no se ata ninguno;
 *  · un producto repetido en la lista no rompe nada;
 *  · `productId` suelto (la forma del lote 247) sigue valiendo;
 *  · la lista tiene tope.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-251-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-251-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-251';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = '25100000-0000-4000-8000-000000000001';
const P2 = '25100000-0000-4000-8000-000000000002';
const P3 = '25100000-0000-4000-8000-000000000003';
const P4 = '25100000-0000-4000-8000-000000000004';
const PB = '25100000-0000-4000-8000-00000000000b';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
//  Cierto antes y despues del lote (la forma del 247): como ok() regalaria un OK en la contraprueba.
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); setTimeout(() => process.exit(3), 300); return; }
  console.log(`  inv   ${t}`);
};
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
    'varios productos quedan atados con el MISMO costo, en una peticion',
    'TODO O NADA: si uno es de otra empresa, no se ata ninguno',
    'un producto repetido en la lista no rompe nada',
    'volver a atarlos les cambia el costo a todos',
    'la lista tiene tope, y una lista vacia o con algo que no es un id se rechaza',
  ];
  let ruta: Record<string, Handler> | null = null;
  try { ruta = (await import('../src/app/api/v1/products/dolar/route')) as unknown as Record<string, Handler>; } catch { ruta = null; }
  const tablas = await todas(sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'productos_en_dolares'`);
  if (!ruta?.PUT || tablas.length !== 1) { for (const t of E) ok(t, false, 'no existe la ruta o la tabla'); return fin(); }

  await db.execute(sql`DELETE FROM productos_en_dolares`);
  await db.execute(sql`DELETE FROM products WHERE id IN (${P1}::uuid, ${P2}::uuid, ${P3}::uuid, ${P4}::uuid, ${PB}::uuid)`);
  await db.execute(sql`
    INSERT INTO products (id, company_id, name, sku, cost, price) VALUES
      (${P1}::uuid, ${A}::uuid, 'Bisagra 251 A', 'B-251-1', 100, 130),
      (${P2}::uuid, ${A}::uuid, 'Bisagra 251 B', 'B-251-2', 100, 130),
      (${P3}::uuid, ${A}::uuid, 'Bisagra 251 C', 'B-251-3', 100, 130),
      (${P4}::uuid, ${A}::uuid, 'Bisagra 251 D', 'B-251-4', 100, 130),
      (${PB}::uuid, ${B}::uuid, 'Bisagra 251 de B', 'B-251-B', 100, 130)`);

  const atar = async (cuerpo: unknown) => {
    const res = await ruta!.PUT(new NextRequest('http://localhost/api/v1/products/dolar', { method: 'PUT', headers: cabeceras(), body: JSON.stringify(cuerpo) }));
    return { estado: res.status, cuerpo: await res.json() as { error?: { message?: string } } };
  };
  const atados = async () => (await todas(sql`SELECT product_id::text p, costo_usd::float8 c FROM productos_en_dolares ORDER BY 1`)) as { p: string; c: number }[];

  const r1 = await atar({ productIds: [P1, P2, P3], costoUsd: '12,50' });
  const a1 = await atados();
  ok(E[0], r1.estado === 200 && a1.length === 3 && a1.every((x) => x.c === 12.5), `${r1.estado} ${JSON.stringify(a1)}`);

  const r2 = await atar({ productIds: [P4, PB], costoUsd: '9' });
  const a2 = await atados();
  ok(E[1], r2.estado === 404 && /No se añadió ninguno/.test(r2.cuerpo.error?.message ?? '') && !a2.some((x) => x.p === P4 || x.p === PB),
    `${r2.estado} ${r2.cuerpo.error?.message}`);

  const r3 = await atar({ productIds: [P4, P4], costoUsd: '9' });
  ok(E[2], r3.estado === 200 && (await atados()).filter((x) => x.p === P4).length === 1, String(r3.estado));

  const r4 = await atar({ productIds: [P1, P2, P3], costoUsd: '15' });
  ok(E[3], r4.estado === 200 && (await atados()).filter((x) => [P1, P2, P3].includes(x.p)).every((x) => x.c === 15));

  const r5 = await atar({ productId: P1, costoUsd: '20' });
  invariante('`productId` suelto (la forma del lote 247) sigue valiendo', r5.estado === 200 && (await atados()).find((x) => x.p === P1)?.c === 20, String(r5.estado));

  const muchos = Array.from({ length: 201 }, (_, i) => `25100000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`);
  const malos = await Promise.all([atar({ productIds: muchos, costoUsd: '1' }), atar({ productIds: [], costoUsd: '1' }), atar({ productIds: [P1, 'x'], costoUsd: '1' })]);
  ok(E[4], malos.every((m) => m.estado === 400) && /hasta 200/.test(malos[0].cuerpo.error?.message ?? ''), malos.map((m) => m.estado).join(','));

  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
