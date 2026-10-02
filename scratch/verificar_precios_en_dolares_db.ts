/**
 * Lote 247, contra una base -- los precios atados al dolar, de punta a punta.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado.
 * Ejecuta las rutas de verdad con las cabeceras internas firmadas.
 *
 * Lo que solo se puede demostrar ejecutando:
 *  · que escribir la tasa NO cambia ningun precio, y aplicar SI, y solo a los
 *    productos elegidos;
 *  · que los importes que quedan en el catalogo son los de la regla (el costo a
 *    costo en dolares x tasa, cada precio con su margen);
 *  · que cada cambio queda registrado con su antes y su despues;
 *  · que una confirmacion hecha con una tasa que ya no es la vigente se rechaza
 *    sin tocar nada;
 *  · que no se puede atar ni aplicar sobre el producto de otra empresa;
 *  · y que con la MIGRACION SIN APLICAR las rutas lo dicen con su nombre (409),
 *    sin un 500.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-247-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-247-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-247';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = '24700000-0000-4000-8000-000000000001';
const P2 = '24700000-0000-4000-8000-000000000002';
const P3 = '24700000-0000-4000-8000-000000000003';
const PB = '24700000-0000-4000-8000-00000000000b';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const exige = (t: string, c: boolean, d = '') => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`); console.log(`  pre   ${t}`); };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];

const cabeceras = (empresa = A, rol = 'sistemas') => ({
  'x-user-id': USER, 'x-company-id': empresa, 'x-user-role': rol, 'x-role-id': ROL,
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
  'content-type': 'application/json',
});

type Cuerpo = { success?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } };
type Respuesta = { estado: number; cuerpo: Cuerpo };
type Handler = (r: NextRequest) => Promise<Response>;

const fin = () => {
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  //  Un respiro antes de salir: tras consultas que fallan a proposito, salir en
  //  seco revienta en Windows con un fallo de libuv (lote 235).
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
};

async function sembrar() {
  await db.execute(sql`DELETE FROM products WHERE id IN (${P1}::uuid, ${P2}::uuid, ${P3}::uuid, ${PB}::uuid)`);
  await db.execute(sql`
    INSERT INTO products (id, company_id, name, sku, cost, price, price_consumidor, price_mayorista, price_proveedor) VALUES
      (${P1}::uuid, ${A}::uuid, 'Puerta 247 Roble', 'D-247-1', 100.00, 130.00, 120.00,   0.00, 110.00),
      (${P2}::uuid, ${A}::uuid, 'Puerta 247 Caoba', 'D-247-2', 200.00, 300.00, 260.00, 240.00, 220.00),
      (${P3}::uuid, ${A}::uuid, 'Dintel 247',       'D-247-3',   0.00,   0.00,   0.00,   0.00,   0.00),
      (${PB}::uuid, ${B}::uuid, 'Puerta 247 de B',  'D-247-B', 100.00, 130.00, 120.00, 115.00, 110.00)`);
}

const precios = async (id: string) =>
  (await todas(sql`SELECT cost::float8 c, price::float8 p, price_consumidor::float8 pc, price_mayorista::float8 pm, price_proveedor::float8 pp FROM products WHERE id = ${id}::uuid`))[0];
const igual = (f: Record<string, unknown>, c: number, p: number, pc: number, pm: number, pp: number) =>
  f.c === c && f.p === p && f.pc === pc && f.pm === pm && f.pp === pp;

async function main() {
  console.log('\n0) Precondiciones\n');
  const tablas = await todas(sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('tasas_de_cambio','productos_en_dolares','cambios_de_precio')`);
  let rutas: { lista: Record<string, Handler>; tasa: Record<string, Handler>; aplicar: Record<string, Handler> } | null = null;
  try {
    rutas = {
      lista: (await import('../src/app/api/v1/products/dolar/route')) as unknown as Record<string, Handler>,
      tasa: (await import('../src/app/api/v1/products/dolar/tasa/route')) as unknown as Record<string, Handler>,
      aplicar: (await import('../src/app/api/v1/products/dolar/aplicar/route')) as unknown as Record<string, Handler>,
    };
  } catch { rutas = null; }

  const E = [
    'sin tasa escrita: la lista sale, sin calculo, y aplicar se rechaza',
    'atar un producto con su costo en dolares NO le cambia el precio',
    'no se puede atar el producto de otra empresa',
    'un costo en dolares que no es un numero mayor que cero se rechaza',
    'escribir la tasa NO cambia ningun precio, y la lista ensena lo que cambiaria',
    'corregir la tasa el mismo dia la sustituye (una por dia)',
    'aplicar cambia el costo y los precios de los ELEGIDOS, con la regla',
    '  y el que no se eligio se queda como estaba',
    '  y queda registrado el cambio, con su antes y su despues',
    'aplicar otra vez la misma tasa no cambia ni registra nada',
    'una confirmacion con una tasa que ya no es la vigente se rechaza sin tocar nada',
    'aplicar sobre un producto que no esta atado (o es de otra empresa) se rechaza entero',
    'la empresa B no ve los productos ni la tasa de A',
    'soltar un producto deja sus precios como estan, y los demas siguen atados',
    'otra empresa no puede soltar un producto que no es suyo',
    'CON LA MIGRACION SIN APLICAR: las rutas lo dicen con su nombre (409), sin un 500',
  ];
  const completas = !!rutas && [rutas.lista.GET, rutas.lista.PUT, rutas.lista.DELETE, rutas.tasa.PUT, rutas.aplicar.POST].every((h) => typeof h === 'function');
  if (!rutas || !completas || tablas.length !== 3) { for (const t of E) ok(t, false, 'no existen las rutas o las tablas del lote 247'); return fin(); }
  exige('las empresas A y B existen', (await todas(sql`SELECT 1 FROM companies WHERE id IN (${A}::uuid, ${B}::uuid)`)).length === 2);

  await db.execute(sql`DELETE FROM cambios_de_precio`);
  await db.execute(sql`DELETE FROM productos_en_dolares`);
  await db.execute(sql`DELETE FROM tasas_de_cambio`);
  await sembrar();

  const pedir = async (h: Handler, metodo: string, url: string, body?: unknown, empresa = A): Promise<Respuesta> => {
    const res = await h(new NextRequest(`http://localhost${url}`, { method: metodo, headers: cabeceras(empresa), body: body === undefined ? undefined : JSON.stringify(body) }));
    return { estado: res.status, cuerpo: await res.json() };
  };
  const D = '/api/v1/products/dolar';
  const ver = (empresa = A) => pedir(rutas!.lista.GET, 'GET', D, undefined, empresa);
  const atar = (productId: string, costoUsd: unknown, empresa = A) => pedir(rutas!.lista.PUT, 'PUT', D, { productId, costoUsd }, empresa);
  const tasa = (t: unknown, empresa = A) => pedir(rutas!.tasa.PUT, 'PUT', `${D}/tasa`, { tasa: t }, empresa);
  const aplicar = (t: unknown, productos: string[], empresa = A) => pedir(rutas!.aplicar.POST, 'POST', `${D}/aplicar`, { tasa: t, productos }, empresa);
  type Renglon = { productId: string; calculo: null | { cambia: boolean; despues: Record<string, number> } };
  const renglones = (r: Respuesta) => (r.cuerpo.data?.renglones ?? []) as Renglon[];

  console.log('\n1) Atar, y la tasa\n');
  const a1 = await atar(P1, '2');
  const a2 = await atar(P2, 4.5);
  const a3 = await atar(P3, '1,25');
  const v0 = await ver();
  const sinTasa = await aplicar(60, [P1]);
  ok(E[0], v0.estado === 200 && v0.cuerpo.data?.tasa === null && renglones(v0).length === 3 && renglones(v0).every((r) => r.calculo === null) && sinTasa.estado === 409,
    `${v0.estado}, aplicar ${sinTasa.estado}`);
  ok(E[1], [a1, a2, a3].every((r) => r.estado === 200) && igual(await precios(P1), 100, 130, 120, 0, 110), JSON.stringify(await precios(P1)));
  const ajeno = await atar(PB, 2);
  ok(E[2], ajeno.estado === 404 && (await todas(sql`SELECT 1 FROM productos_en_dolares WHERE product_id = ${PB}::uuid`)).length === 0, String(ajeno.estado));
  const malos = await Promise.all([atar(P1, '0'), atar(P1, '-3'), atar(P1, 'dos')]);
  const costoP1 = (await todas(sql`SELECT costo_usd::float8 c FROM productos_en_dolares WHERE product_id = ${P1}::uuid`))[0];
  ok(E[3], malos.every((r) => r.estado === 400) && costoP1.c === 2, malos.map((r) => r.estado).join(','));

  const t1 = await tasa('59');
  const t2 = await tasa('60,00');
  const v1 = await ver();
  const r1 = renglones(v1).find((r) => r.productId === P1);
  ok(E[4], t2.estado === 200 && igual(await precios(P1), 100, 130, 120, 0, 110) && igual(await precios(P2), 200, 300, 260, 240, 220) &&
    r1?.calculo?.cambia === true && r1.calculo.despues.cost === 120 && r1.calculo.despues.price === 156, JSON.stringify(r1?.calculo?.despues));
  const filasTasa = await todas(sql`SELECT tasa::float8 t FROM tasas_de_cambio WHERE company_id = ${A}::uuid`);
  ok(E[5], t1.estado === 200 && filasTasa.length === 1 && filasTasa[0].t === 60, JSON.stringify(filasTasa));

  console.log('\n2) Aplicar, con la confirmacion\n');
  const ap = await aplicar(60, [P1, P3]);
  //  P1: costo 2 x 60 = 120; margenes 1,30 / 1,20 / (0) / 1,10. P3: sin costo, margenes de fabrica sobre 1,25 x 60 = 75.
  ok(E[6], ap.estado === 200 && ap.cuerpo.data?.aplicados === 2 && igual(await precios(P1), 120, 156, 144, 0, 132) && igual(await precios(P3), 75, 93.75, 90, 86.25, 82.5),
    `${ap.estado} ${JSON.stringify(await precios(P1))} ${JSON.stringify(await precios(P3))}`);
  ok(E[7], igual(await precios(P2), 200, 300, 260, 240, 220), JSON.stringify(await precios(P2)));
  const registro = await todas(sql`SELECT product_id, tasa::float8 t, antes, despues, aplicado_por FROM cambios_de_precio WHERE company_id = ${A}::uuid ORDER BY product_id`);
  const regP1 = registro.find((f) => f.product_id === P1) as { t: number; antes: Record<string, number>; despues: Record<string, number>; aplicado_por: string } | undefined;
  ok(E[8], registro.length === 2 && regP1?.t === 60 && regP1.antes.price === 130 && regP1.despues.price === 156 && regP1.antes.cost === 100 && regP1.aplicado_por === USER,
    JSON.stringify(regP1));

  const otra = await aplicar(60, [P1, P3]);
  ok(E[9], otra.estado === 200 && otra.cuerpo.data?.aplicados === 0 && igual(await precios(P1), 120, 156, 144, 0, 132) &&
    (await todas(sql`SELECT 1 FROM cambios_de_precio`)).length === 2, `${otra.estado} aplicados ${otra.cuerpo.data?.aplicados}`);

  const vieja = await aplicar(59, [P2]);
  ok(E[10], vieja.estado === 409 && /tasa cambió/.test(vieja.cuerpo.error?.message ?? '') && igual(await precios(P2), 200, 300, 260, 240, 220),
    `${vieja.estado} ${vieja.cuerpo.error?.message}`);

  const mezclado = await aplicar(60, [P2, PB]);
  ok(E[11], mezclado.estado === 409 && igual(await precios(P2), 200, 300, 260, 240, 220) && igual(await precios(PB), 100, 130, 120, 115, 110),
    `${mezclado.estado} ${JSON.stringify(await precios(P2))}`);

  console.log('\n3) Cada empresa, lo suyo\n');
  const vB = await ver(B);
  ok(E[12], vB.estado === 200 && vB.cuerpo.data?.tasa === null && renglones(vB).length === 0, JSON.stringify(vB.cuerpo.data).slice(0, 120));
  const soltar = await pedir(rutas.lista.DELETE, 'DELETE', `${D}?productId=${P1}`);
  const quedan = renglones(await ver()).map((r) => r.productId).sort();
  ok(E[13], soltar.estado === 200 && igual(await precios(P1), 120, 156, 144, 0, 132) && JSON.stringify(quedan) === JSON.stringify([P2, P3]),
    `${soltar.estado}, quedan ${quedan.length}`);
  const ajena = await pedir(rutas.lista.DELETE, 'DELETE', `${D}?productId=${P2}`, undefined, B);
  ok(E[14], ajena.estado === 404 && renglones(await ver()).some((r) => r.productId === P2), String(ajena.estado));

  console.log('\n4) Sin la migracion\n');
  //  Se simula renombrando dos de las tablas, y se devuelven en un `finally`: la
  //  base queda como estaba aunque una comprobacion lance.
  await db.execute(sql`ALTER TABLE tasas_de_cambio RENAME TO tasas_de_cambio_fuera`);
  await db.execute(sql`ALTER TABLE productos_en_dolares RENAME TO productos_en_dolares_fuera`);
  try {
    const sin = [await ver(), await tasa('61'), await atar(P2, 5), await aplicar(60, [P2])];
    ok(E[15], sin.every((r) => r.estado === 409 && r.cuerpo.error?.code === 'MIGRATION_PENDING' && /0017_precios_en_dolares/.test(r.cuerpo.error?.message ?? '')),
      sin.map((r) => `${r.estado}:${r.cuerpo.error?.code}`).join(' '));
  } finally {
    await db.execute(sql`ALTER TABLE tasas_de_cambio_fuera RENAME TO tasas_de_cambio`);
    await db.execute(sql`ALTER TABLE productos_en_dolares_fuera RENAME TO productos_en_dolares`);
  }

  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
