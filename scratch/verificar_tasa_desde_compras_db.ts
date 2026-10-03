/**
 * Lote 261, contra una base -- cambiar la tasa desde Compras y Facturacion: se guarda Y se aplica.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado. Ejecuta la ruta de
 * verdad (`PUT /api/v1/products/dolar/tasa` con `aplicar: true`) con las cabeceras internas firmadas.
 *
 * Lo que solo se puede demostrar ejecutando:
 *  · que guardar con `aplicar: true` deja la tasa nueva como vigente Y el catalogo de TODOS los
 *    productos atados con los importes de esa tasa, en una sola peticion;
 *  · que la respuesta dice cuantos cambiaron y cuantos hay atados;
 *  · que cada cambio queda registrado en `cambios_de_precio`, y que todos los atados quedan
 *    marcados con la tasa aplicada (cambien o no);
 *  · que un producto sin atar y el producto de otra empresa no se tocan;
 *  · que repetir la misma tasa no cambia ni registra nada.
 *
 * Y, como INVARIANTES (ciertas antes y despues del lote; si fallan el banco sale con 3, no regala
 * un OK en la contraprueba): sin `aplicar` -- la pantalla de Productos -- guardar la tasa no cambia
 * ningun precio; quien no administra no puede; una tasa mala se rechaza sin tocar nada; y solo
 * `true` aplica (un `"true"` escrito como texto no).
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-261-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-261-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-261';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = '26100000-0000-4000-8000-000000000001';
const P2 = '26100000-0000-4000-8000-000000000002';
const P3 = '26100000-0000-4000-8000-000000000003';
const PN = '26100000-0000-4000-8000-00000000000e'; // de A, sin atar
const PB = '26100000-0000-4000-8000-00000000000b'; // de B, atado

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
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
  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S), ${rotas} invariante(s) rota(s)`}`);
  //  Un respiro antes de salir: salir en seco tras consultas revienta en Windows (lote 235).
  setTimeout(() => process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1), 300);
};

async function sembrar() {
  await db.execute(sql`DELETE FROM cambios_de_precio`);
  await db.execute(sql`DELETE FROM productos_en_dolares`);
  await db.execute(sql`DELETE FROM tasas_de_cambio`);
  await db.execute(sql`DELETE FROM products WHERE id IN (${P1}::uuid, ${P2}::uuid, ${P3}::uuid, ${PN}::uuid, ${PB}::uuid)`);
  await db.execute(sql`
    INSERT INTO products (id, company_id, name, sku, cost, price, price_consumidor, price_mayorista, price_proveedor) VALUES
      (${P1}::uuid, ${A}::uuid, 'Puerta 261 Roble', 'D-261-1', 100.00, 130.00, 120.00, 115.00, 110.00),
      (${P2}::uuid, ${A}::uuid, 'Puerta 261 Caoba', 'D-261-2', 200.00, 300.00, 260.00, 240.00, 220.00),
      (${P3}::uuid, ${A}::uuid, 'Dintel 261',       'D-261-3',  60.00,  90.00,  80.00,  75.00,  70.00),
      (${PN}::uuid, ${A}::uuid, 'Bisagra 261',      'D-261-N',  10.00,  15.00,  14.00,  13.00,  12.00),
      (${PB}::uuid, ${B}::uuid, 'Puerta 261 de B',  'D-261-B', 100.00, 130.00, 120.00, 115.00, 110.00)`);
  //  P3 ya esta a 60 x 1 = 60: con la tasa 60 no cambia (sirve para "atados" frente a "aplicados").
  await db.execute(sql`
    INSERT INTO productos_en_dolares (company_id, product_id, costo_usd) VALUES
      (${A}::uuid, ${P1}::uuid, 2), (${A}::uuid, ${P2}::uuid, 4.5), (${A}::uuid, ${P3}::uuid, 1),
      (${B}::uuid, ${PB}::uuid, 2)`);
}

const catalogo = async (id: string) =>
  (await todas(sql`SELECT cost::float8 c, price::float8 p, price_consumidor::float8 pc, price_mayorista::float8 pm, price_proveedor::float8 pp FROM products WHERE id = ${id}::uuid`))[0];
const vigente = async (empresa = A) =>
  (await todas(sql`SELECT tasa::float8 t FROM tasas_de_cambio WHERE company_id = ${empresa}::uuid ORDER BY fecha DESC LIMIT 1`))[0]?.t ?? null;
const registros = async () => Number((await todas(sql`SELECT count(*)::int n FROM cambios_de_precio`))[0].n);
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  console.log('\n0) Precondiciones\n');
  const tablas = await todas(sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('tasas_de_cambio','productos_en_dolares','cambios_de_precio')`);
  exige('las tablas de la migracion 0017 existen', tablas.length === 3);
  exige('las empresas A y B existen', (await todas(sql`SELECT 1 FROM companies WHERE id IN (${A}::uuid, ${B}::uuid)`)).length === 2);
  //  La ruta existe en los dos estados (es del lote 247): import directo.
  const ruta = (await import('../src/app/api/v1/products/dolar/tasa/route')) as unknown as Record<string, Handler>;
  const lista = (await import('../src/app/api/v1/products/dolar/route')) as unknown as Record<string, Handler>;
  exige('la ruta de la tasa y la de la lista responden', typeof ruta.PUT === 'function' && typeof lista.GET === 'function');

  const pedir = async (cuerpo: unknown, empresa = A, rol = 'sistemas'): Promise<Respuesta> => {
    const res = await ruta.PUT(new NextRequest('http://localhost/api/v1/products/dolar/tasa', {
      method: 'PUT', headers: cabeceras(empresa, rol), body: JSON.stringify(cuerpo),
    }));
    return { estado: res.status, cuerpo: await res.json() };
  };
  const ver = async () => {
    const res = await lista.GET(new NextRequest('http://localhost/api/v1/products/dolar', { method: 'GET', headers: cabeceras() }));
    return (await res.json()) as { data: { renglones: { productId: string; calculo: { cambia: boolean } | null }[] } };
  };

  await sembrar();
  const antes = { p1: await catalogo(P1), p2: await catalogo(P2), pn: await catalogo(PN), pb: await catalogo(PB) };

  console.log('\n1) Lo que no cambia (invariantes)\n');
  const soloGuardar = await pedir({ tasa: 55 });
  invariante('sin `aplicar` (Productos) guardar la tasa no cambia ningun precio',
    soloGuardar.estado === 200 && (await vigente()) === 55 && igual(await catalogo(P1), antes.p1) && (await registros()) === 0,
    String(soloGuardar.estado));
  const texto = await pedir({ tasa: 56, aplicar: 'true' });
  invariante('solo `true` aplica: un "true" escrito como texto solo guarda',
    texto.estado === 200 && igual(await catalogo(P1), antes.p1) && (await registros()) === 0, String(texto.estado));
  const ventas = await pedir({ tasa: 70, aplicar: true }, A, 'ventas');
  invariante('quien no administra no puede (403), y no se guarda nada',
    ventas.estado === 403 && (await vigente()) === 56 && igual(await catalogo(P1), antes.p1), String(ventas.estado));
  const mala = await pedir({ tasa: 'sesenta', aplicar: true });
  invariante('una tasa que no es un numero se rechaza (400) sin tocar nada',
    mala.estado === 400 && (await vigente()) === 56 && igual(await catalogo(P1), antes.p1), String(mala.estado));

  console.log('\n2) Guardar Y aplicar, en una peticion\n');
  const r = await pedir({ tasa: '60,00', aplicar: true });
  const d = r.cuerpo.data as { tasa?: { tasa: number }; aplicados?: number; atados?: number } | undefined;
  //  Guardar la tasa ya funcionaba antes del lote: invariante, no OK.
  invariante('responde con la tasa guardada, y queda como vigente',
    r.estado === 200 && d?.tasa?.tasa === 60 && (await vigente()) === 60, `${r.estado} ${JSON.stringify(d)}`);
  const [p1, p2] = await Promise.all([catalogo(P1), catalogo(P2)]);
  ok('el costo de los atados pasa a dolares x tasa (2 x 60 = 120; 4,5 x 60 = 270)',
    p1.c === 120 && p2.c === 270, `${p1.c}, ${p2.c}`);
  ok('  y sus precios cambian con el calculo de Productos: la lista ya no tiene nada por aplicar',
    !igual(p1, antes.p1) && (await ver()).data.renglones.every((x) => x.calculo && !x.calculo.cambia));
  ok('dice cuantos cambiaron (2) y cuantos hay atados (3: el dintel ya estaba a esa tasa)',
    d?.aplicados === 2 && d?.atados === 3, `${d?.aplicados} de ${d?.atados}`);
  const reg = await todas(sql`SELECT product_id::text id, tasa::float8 t FROM cambios_de_precio ORDER BY product_id`);
  ok('cada cambio queda registrado, con la tasa', reg.length === 2 && reg.every((x) => x.t === 60)
    && igual(reg.map((x) => x.id).sort(), [P1, P2].sort()), JSON.stringify(reg));
  const marcados = await todas(sql`SELECT count(*)::int n FROM productos_en_dolares WHERE company_id = ${A}::uuid AND tasa_aplicada = 60`);
  ok('todos los atados quedan marcados con la tasa aplicada, cambien o no', Number(marcados[0].n) === 3, String(marcados[0].n));
  //  Negacion ATADA a una marca positiva (P1 si cambio): sola, antes del lote era cierta de balde.
  ok('un producto sin atar y el de otra empresa no se tocan (y el atado si)',
    p1.c === 120 && igual(await catalogo(PN), antes.pn) && igual(await catalogo(PB), antes.pb)
    && (await todas(sql`SELECT 1 FROM tasas_de_cambio WHERE company_id = ${B}::uuid`)).length === 0);

  console.log('\n3) Repetir la misma tasa\n');
  const otra = await pedir({ tasa: 60, aplicar: true });
  const d2 = otra.cuerpo.data as { aplicados?: number; atados?: number } | undefined;
  ok('no cambia ni registra nada', otra.estado === 200 && d2?.aplicados === 0 && d2?.atados === 3 && (await registros()) === 2,
    `${otra.estado} ${JSON.stringify(d2)}`);

  return fin();
}

main().catch((e) => { console.error(e); process.exit(2); });
