/**
 * Lote 235, contra una base -- la portada de la tienda, de punta a punta.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado, y
 * con un almacen de ficheros FALSO levantado en 127.0.0.1 (el del lote 234):
 * se ejecutan las rutas de verdad sin escribir en el almacenamiento de
 * produccion.
 *
 * Lo que solo se puede demostrar ejecutando:
 *  · que lo que se manda es lo que se GUARDA, y lo que se guarda lo que la
 *    tienda LEE -- el "parametro sordo" de los lotes 178 y 200 era justo un
 *    ajuste que la pantalla mandaba y el servidor no escribia --;
 *  · que la portada de una empresa no toca la de otra;
 *  · que la imagen solo puede ser una subida por esa empresa;
 *  · y lo que mas importa: que con la MIGRACION SIN APLICAR la tienda sigue
 *    leyendo (portada de siempre) y guardar lo dice con su nombre.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-235-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-235-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-235';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const exige = (t: string, c: boolean, d = '') => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`); console.log(`  pre   ${t}`); };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];

const objetos = new Set<string>();
const depositos = new Map<string, boolean>();
const almacen = createServer((req, res) => {
  const trozos: Buffer[] = [];
  req.on('data', (c) => trozos.push(c as Buffer));
  req.on('end', () => {
    const url = (req.url || '').split('?')[0];
    const json = (estado: number, cuerpo: unknown) => { res.writeHead(estado, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
    if (req.method === 'GET' && url === '/storage/v1/bucket') return json(200, [...depositos].map(([name, p]) => ({ id: name, name, public: p })));
    if (req.method === 'POST' && url === '/storage/v1/bucket') {
      const b = JSON.parse(Buffer.concat(trozos).toString('utf8')) as { name: string; public?: boolean };
      depositos.set(b.name, !!b.public);
      return json(200, { name: b.name });
    }
    if (req.method === 'POST' && url.startsWith('/storage/v1/object/')) {
      const clave = decodeURIComponent(url.slice('/storage/v1/object/'.length));
      objetos.add(clave);
      return json(200, { Key: clave });
    }
    return json(404, { error: 'no implementado', url });
  });
});

const cabeceras = (empresa = A) => ({
  'x-user-id': USER, 'x-company-id': empresa, 'x-user-role': 'sistemas', 'x-role-id': ROL,
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string; fields?: Record<string, string> } } };

async function main() {
  await new Promise<void>((r) => almacen.listen(0, '127.0.0.1', () => r()));
  const BASE = `http://127.0.0.1:${(almacen.address() as AddressInfo).port}`;
  process.env.SUPABASE_URL = BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-del-almacen-falso';

  console.log('\n0) Precondiciones\n');
  exige('el almacen es el falso, no Supabase', process.env.SUPABASE_URL.startsWith('http://127.0.0.1:'));
  const columnas = await todas(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name LIKE 'tienda\\_%' ORDER BY 1`);
  exige('la migracion 0016 esta aplicada en esta base (cuatro columnas)', columnas.length === 4, columnas.map((c) => c.column_name).join(','));
  exige('las empresas A y B tienen fila de ajustes',
    (await todas(sql`SELECT 1 FROM company_settings WHERE company_id IN (${A}::uuid, ${B}::uuid) AND deleted_at IS NULL`)).length === 2);
  await db.execute(sql`UPDATE company_settings SET tienda_anuncio = NULL, tienda_titulo = NULL, tienda_texto = NULL, tienda_imagen_url = NULL`);

  type Ruta = { GET?: (r: NextRequest) => Promise<Response>; PUT?: (r: NextRequest) => Promise<Response>; POST?: (r: NextRequest) => Promise<Response> };
  let portada: Ruta | null = null;
  let imagen: Ruta | null = null;
  let repo: typeof import('../src/services/storefront/portadaRepositorio') | null = null;
  try {
    portada = await import('../src/app/api/v1/company/settings/portada/route');
    imagen = await import('../src/app/api/v1/company/settings/portada/imagen/route');
    repo = await import('../src/services/storefront/portadaRepositorio');
  } catch { portada = null; }
  const E = ['sin configurar: la portada vacia, con lo que se ensenara por defecto y la direccion de la tienda',
    'lo que se manda se GUARDA, recortado y en su forma', '  y la tienda LEE exactamente eso', '  sin tocar la portada de otra empresa',
    'lo que pasa del tope se rechaza con su campo, y no se guarda nada', 'una imagen ajena se rechaza',
    'la imagen se sube (deposito publico, bajo la empresa) y entonces si se guarda', 'vaciar los campos vuelve a lo de siempre',
    'CON LA MIGRACION SIN APLICAR: la tienda lee sin lanzar (portada de siempre)', '  y guardar lo dice con su nombre, sin un 500'];
  if (!portada?.GET || !portada.PUT || !imagen?.POST || !repo) { for (const t of E) ok(t, false, 'no existen las rutas de la portada'); return fin(); }

  const ver = async (empresa = A): Promise<Respuesta> => {
    const res = await portada!.GET!(new NextRequest('http://localhost/api/v1/company/settings/portada', { headers: cabeceras(empresa) }));
    return { estado: res.status, cuerpo: await res.json() };
  };
  const guardar = async (body: unknown, empresa = A): Promise<Respuesta> => {
    const res = await portada!.PUT!(new NextRequest('http://localhost/api/v1/company/settings/portada', {
      method: 'PUT', headers: { ...cabeceras(empresa), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { estado: res.status, cuerpo: await res.json() };
  };
  const enBase = async (empresa = A) => (await todas(sql`SELECT tienda_anuncio a, tienda_titulo t, tienda_texto x, tienda_imagen_url i FROM company_settings WHERE company_id = ${empresa}::uuid`))[0];

  console.log('\n1) Leer y guardar\n');
  const v0 = await ver();
  const d0 = v0.cuerpo.data as { portada: Record<string, unknown>; porDefecto: { titulo: string; texto: string }; tienda: string };
  ok(E[0], v0.estado === 200 && Object.values(d0.portada).every((x) => x === null) && /^Bienvenido a .+/.test(d0.porDefecto.titulo)
    && d0.porDefecto.texto.length > 20 && /^\/[a-z0-9]+$/.test(d0.tienda), JSON.stringify(d0));

  const g1 = await guardar({ anuncio: '  Abrimos\nlos   sábados ', titulo: ' Puertas a medida ', texto: 'Fabricamos en Santiago.\r\n\r\n\r\nCotiza en línea.', imagenUrl: '' });
  const b1 = await enBase();
  ok(E[1], g1.estado === 200 && b1.a === 'Abrimos los sábados' && b1.t === 'Puertas a medida' && b1.x === 'Fabricamos en Santiago.\n\nCotiza en línea.' && b1.i === null, JSON.stringify(b1));
  const l1 = await repo.PortadaRepositorio.leer(A);
  ok(E[2], l1?.anuncio === 'Abrimos los sábados' && l1?.titulo === 'Puertas a medida' && l1?.texto === 'Fabricamos en Santiago.\n\nCotiza en línea.' && l1?.imagenUrl === null, JSON.stringify(l1));
  const bB = await enBase(B);
  ok(E[3], bB.a === null && bB.t === null && bB.x === null && bB.i === null && Object.values(((await ver(B)).cuerpo.data as { portada: object }).portada).every((x) => x === null));

  console.log('\n2) Lo que no se admite\n');
  const g2 = await guardar({ anuncio: 'a'.repeat(121), titulo: 'Otro título', texto: '', imagenUrl: '' });
  ok(E[4], g2.estado === 400 && !!g2.cuerpo.error?.fields?.anuncio && (await enBase()).t === 'Puertas a medida', `${g2.estado} ${JSON.stringify(g2.cuerpo.error?.fields)}`);
  const g3 = await guardar({ anuncio: '', titulo: '', texto: '', imagenUrl: 'https://otro-sitio.example/rastreo.png' });
  ok(E[5], g3.estado === 400 && !!g3.cuerpo.error?.fields?.imagenUrl && (await enBase()).t === 'Puertas a medida', `${g3.estado}`);

  console.log('\n3) La imagen\n');
  const cuerpo = new FormData();
  cuerpo.append('file', new File([new Uint8Array(PNG)], 'portada.png', { type: 'image/png' }));
  const sub = await imagen.POST(new NextRequest('http://localhost/api/v1/company/settings/portada/imagen', { method: 'POST', headers: cabeceras(), body: cuerpo }));
  const url = ((await sub.json()) as { data?: { imageUrl?: string } }).data?.imageUrl ?? '';
  const g4 = await guardar({ anuncio: 'Abrimos los sábados', titulo: 'Puertas a medida', texto: '', imagenUrl: url });
  ok(E[6], sub.status === 201 && depositos.get('product_images') === true && [...objetos].some((o) => o.startsWith(`product_images/${A}/`))
    && url.startsWith(`${BASE}/storage/v1/object/public/product_images/${A}/`) && g4.estado === 200 && (await enBase()).i === url, `${sub.status} ${g4.estado} ${url}`);

  const g5 = await guardar({ anuncio: ' ', titulo: '', texto: '', imagenUrl: '' });
  const b5 = await enBase();
  ok(E[7], g5.estado === 200 && b5.a === null && b5.t === null && b5.x === null && b5.i === null, JSON.stringify(b5));

  console.log('\n4) Sin la migracion\n');
  //  Como si la 0016 no se hubiera aplicado: se quita una columna y se devuelve.
  await db.execute(sql`ALTER TABLE company_settings RENAME COLUMN tienda_titulo TO tienda_titulo_quitada`);
  try {
    let leido: unknown = 'LANZO';
    try { leido = await repo.PortadaRepositorio.leer(A); } catch { leido = 'LANZO'; }
    ok(E[8], leido === null, String(leido));
    let g6: Respuesta | 'LANZO' = 'LANZO';
    try { g6 = await guardar({ anuncio: 'x', titulo: 'y', texto: '', imagenUrl: '' }); } catch { g6 = 'LANZO'; }
    ok(E[9], g6 !== 'LANZO' && g6.estado === 409 && g6.cuerpo.error?.code === 'MIGRATION_PENDING' && /0016_portada_de_la_tienda/.test(g6.cuerpo.error?.message ?? ''),
      g6 === 'LANZO' ? 'lanzo' : `${g6.estado} ${g6.cuerpo.error?.code}`);
  } finally {
    await db.execute(sql`ALTER TABLE company_settings RENAME COLUMN tienda_titulo_quitada TO tienda_titulo`);
  }
  fin();
}

/**
 * Salir DESPUES de que el almacen falso haya cerrado. `close()` y `process.exit`
 * seguidos disparan en Windows un fallo de libuv (UV_HANDLE_CLOSING) que deja el
 * banco en rojo con todas sus comprobaciones en verde.
 */
function salir(codigo: number) {
  almacen.closeAllConnections();
  //  Y un respiro: tras las consultas que fallan a proposito (seccion 4), salir en
  //  el mismo instante repite el fallo de libuv.
  almacen.close(() => setTimeout(() => process.exit(codigo), 300));
}

function fin() {
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  salir(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); salir(1); });
