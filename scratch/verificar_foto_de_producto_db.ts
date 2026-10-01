/**
 * Lote 234, contra una base -- la foto del producto, de punta a punta.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado. Y
 * el almacen de ficheros es uno FALSO, levantado aqui en 127.0.0.1: se le dice
 * a `StorageService` que ese es Supabase. Asi se EJECUTAN las rutas de verdad
 * (subir la foto, crear y editar el producto) sin escribir un solo byte en el
 * almacenamiento de produccion.
 *
 * Lo que solo se puede demostrar ejecutando:
 *  · que una foto de verdad se sube, a un deposito PUBLICO, bajo la empresa de
 *    la sesion y con el nombre que pone el servidor;
 *  · que un fichero que DICE ser imagen y no lo es se rechaza (sus bytes mandan);
 *  · que un producto solo guarda una foto NUESTRA y de su empresa;
 *  · que quitar la foto al editar la BORRA (con `aTexto`, vacio era "no lo
 *    toques" y la foto se quedaba);
 *  · y que la tienda publica la ensena.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-234-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-234-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-234';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const CAT = 'ffff0000-0000-4000-8000-0000000234c1';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const exige = (t: string, c: boolean, d = '') => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`); console.log(`  pre   ${t}`); };
const uno = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as Record<string, unknown>[])[0];

// ── El almacen falso: lo minimo de la API de Storage que usa el servicio ──────
const depositos = new Map<string, { public: boolean }>();
const objetos = new Map<string, { tipo: string; bytes: number }>();
const almacen = createServer((req, res) => {
  const trozos: Buffer[] = [];
  req.on('data', (c) => trozos.push(c as Buffer));
  req.on('end', () => {
    const url = (req.url || '').split('?')[0];
    const json = (estado: number, cuerpo: unknown) => { res.writeHead(estado, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
    if (req.method === 'GET' && url === '/storage/v1/bucket') return json(200, [...depositos].map(([name, d]) => ({ id: name, name, public: d.public })));
    if (req.method === 'POST' && url === '/storage/v1/bucket') {
      const b = JSON.parse(Buffer.concat(trozos).toString('utf8')) as { name: string; public?: boolean };
      depositos.set(b.name, { public: !!b.public });
      return json(200, { name: b.name });
    }
    if (req.method === 'POST' && url.startsWith('/storage/v1/object/')) {
      const clave = decodeURIComponent(url.slice('/storage/v1/object/'.length));
      if (objetos.has(clave)) return json(409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      objetos.set(clave, { tipo: String(req.headers['content-type'] || ''), bytes: Buffer.concat(trozos).length });
      return json(200, { Key: clave });
    }
    return json(404, { error: 'no implementado', url });
  });
});

const cabeceras = (empresa = A) => ({
  'x-user-id': USER, 'x-company-id': empresa, 'x-user-role': 'sistemas', 'x-role-id': ROL,
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
});

// Un PNG de 1x1 de verdad, y un texto que se hace pasar por PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FALSO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');

async function main() {
  await new Promise<void>((r) => almacen.listen(0, '127.0.0.1', () => r()));
  const BASE = `http://127.0.0.1:${(almacen.address() as AddressInfo).port}`;
  //  ANTES de importar las rutas: `StorageService` lee estas variables al cargarse.
  process.env.SUPABASE_URL = BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-del-almacen-falso';

  type Subida = (req: NextRequest) => Promise<Response>;
  let subirFoto: Subida | null = null;
  try { subirFoto = (await import('../src/app/api/v1/products/image/route')).POST as Subida; } catch { subirFoto = null; }
  const rutaAlta = await import('../src/app/api/v1/products/route');
  const rutaId = await import('../src/app/api/v1/products/[id]/route');

  console.log('\n0) Precondiciones\n');
  exige('el almacen es el falso, no Supabase', process.env.SUPABASE_URL.startsWith('http://127.0.0.1:'));
  exige('las rutas de producto existen', typeof rutaAlta.POST === 'function' && typeof rutaId.PUT === 'function');
  await db.execute(sql`INSERT INTO product_categories (id, company_id, name) VALUES (${CAT}::uuid, ${A}::uuid, 'Fotos 234') ON CONFLICT (id) DO NOTHING`);

  const subir = async (bytes: Buffer, nombre: string, tipo: string, empresa = A) => {
    const cuerpo = new FormData();
    cuerpo.append('file', new File([new Uint8Array(bytes)], nombre, { type: tipo }));
    const res = await subirFoto!(new NextRequest('http://localhost/api/v1/products/image', { method: 'POST', headers: cabeceras(empresa), body: cuerpo }));
    return { estado: res.status, cuerpo: await res.json() as { success?: boolean; data?: { imageUrl: string }; error?: { message: string } } };
  };
  const producto = (extra: Record<string, unknown>) => ({ name: `Puerta con foto ${Date.now()}`, categoryId: CAT, unitOfMeasure: 'unidad', cost: 100, ...extra });
  const alta = async (body: Record<string, unknown>) => {
    const res = await rutaAlta.POST(new NextRequest('http://localhost/api/v1/products', {
      method: 'POST', headers: { ...cabeceras(), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { estado: res.status, cuerpo: await res.json() as { success?: boolean; data?: { id: string }; error?: { message: string; fields?: Record<string, string> } } };
  };
  const editar = async (id: string, body: Record<string, unknown>) => {
    const res = await rutaId.PUT(new NextRequest(`http://localhost/api/v1/products/${id}`, {
      method: 'PUT', headers: { ...cabeceras(), 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    return { estado: res.status, cuerpo: await res.json() as { success?: boolean; error?: { message: string } } };
  };
  const guardada = async (id: string) => (await uno(sql`SELECT image_url, description FROM products WHERE id = ${id}::uuid`)) as { image_url: string | null; description: string | null };

  console.log('\n1) Subir la foto\n');
  const E1 = ['una imagen de verdad se sube y devuelve su direccion', '  a un deposito PUBLICO, bajo la empresa de la sesion, con nombre del servidor',
    '  y con el tipo que dicen sus bytes, no el que declara quien sube', 'lo que dice ser imagen y no lo es se rechaza, y no se guarda nada',
    'sin fichero, tambien se rechaza'];
  let url = '';
  if (!subirFoto) for (const t of E1) ok(t, false, 'no existe la ruta de subida');
  else {
    const s = await subir(PNG, '../../foto de la puerta.PNG', 'image/jpeg');
    url = s.cuerpo.data?.imageUrl ?? '';
    ok(E1[0], s.estado === 201 && s.cuerpo.success === true && url.startsWith(`${BASE}/storage/v1/object/public/product_images/${A}/`), `${s.estado} ${url}`);
    const clave = [...objetos.keys()][0] ?? '';
    ok(E1[1], depositos.get('product_images')?.public === true && objetos.size === 1
      && new RegExp(`^product_images/${A}/[0-9a-f-]{36}\\.png$`).test(clave) && !clave.includes('puerta'), clave);
    ok(E1[2], objetos.get(clave)?.tipo === 'image/png' && objetos.get(clave)?.bytes === PNG.length, objetos.get(clave)?.tipo);
    const f = await subir(FALSO, 'logo.png', 'image/png');
    ok(E1[3], f.estado === 400 && objetos.size === 1 && /JPG, PNG o WebP/.test(f.cuerpo.error?.message ?? ''), `${f.estado} ${f.cuerpo.error?.message}`);
    const res = await subirFoto(new NextRequest('http://localhost/api/v1/products/image', { method: 'POST', headers: cabeceras(), body: new FormData() }));
    ok(E1[4], res.status === 400);
  }

  console.log('\n2) Guardarla en el producto\n');
  const nuestra = url || `${BASE}/storage/v1/object/public/product_images/${A}/00000000-0000-4000-8000-000000000001.png`;
  const p = await alta(producto({ imageUrl: nuestra, description: '  Caoba maciza, 90 x 210 cm.  ' }));
  exige('crear un producto funciona en esta base', p.estado === 201 && !!p.cuerpo.data?.id, `${p.estado} ${p.cuerpo.error?.message ?? ''}`);
  const id = p.cuerpo.data!.id;
  const g1 = await guardada(id);
  //  Cierto ya antes del lote (la API y la base aceptaban la foto): precondicion.
  exige('el producto guarda la foto subida y la descripcion (recortada)', g1.image_url === nuestra && g1.description === 'Caoba maciza, 90 x 210 cm.', JSON.stringify(g1));

  const ajena = await alta(producto({ imageUrl: 'https://otro-sitio.example/rastreo.png' }));
  ok('una direccion ajena NO se guarda, y se dice en el campo', ajena.estado === 400 && !!ajena.cuerpo.error?.fields?.imageUrl, `${ajena.estado} ${JSON.stringify(ajena.cuerpo.error?.fields)}`);
  const deOtra = await alta(producto({ imageUrl: `${BASE}/storage/v1/object/public/product_images/${B}/00000000-0000-4000-8000-000000000001.png` }));
  ok('ni la foto de OTRA empresa', deOtra.estado === 400, String(deOtra.estado));
  const eAjena = await editar(id, { imageUrl: 'https://otro-sitio.example/rastreo.png' });
  ok('al editar, tampoco', eAjena.estado === 400 && (await guardada(id)).image_url === nuestra, String(eAjena.estado));

  console.log('\n3) Editar sin tocarla, y quitarla\n');
  const e1 = await editar(id, { name: 'Puerta con foto, renombrada' });
  ok('editar otro campo NO toca la foto ni la descripcion', e1.estado === 200 && (await guardada(id)).image_url === nuestra && (await guardada(id)).description === 'Caoba maciza, 90 x 210 cm.');
  const e2 = await editar(id, { imageUrl: '', description: '' });
  const g2 = await guardada(id);
  ok('quitar la foto y vaciar la descripcion las BORRA (antes: "no lo toques")', e2.estado === 200 && g2.image_url === null && g2.description === null, JSON.stringify(g2));

  console.log('\n4) La tienda la ensena\n');
  await editar(id, { imageUrl: nuestra, description: 'Caoba maciza.' });
  const { StorefrontProductService } = await import('../src/services/storefront/productService');
  const enTienda = (await StorefrontProductService.getActiveProducts(A)).find((x) => x.id === id);
  //  Tambien cierto antes: la tienda ya leia `image_url`. Lo nuevo es que haya foto.
  exige('el catalogo publico devuelve la foto y la descripcion del producto', enTienda?.imageUrl === nuestra && enTienda?.description === 'Caoba maciza.', JSON.stringify(enTienda?.imageUrl));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  salir(fallos === 0 ? 0 : 1);
}

/**
 * Salir DESPUES de que el almacen falso haya cerrado (lote 235). `close()` y
 * `process.exit` seguidos disparan en Windows un fallo de libuv
 * (UV_HANDLE_CLOSING) que deja el banco en rojo con todo en verde.
 */
function salir(codigo: number) {
  almacen.closeAllConnections();
  almacen.close(() => process.exit(codigo));
}

main().catch((e) => { console.error(e); salir(1); });
