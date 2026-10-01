/**
 * Lote 234 -- la foto y la descripcion del producto, para la tienda.
 *
 * Reportado por el dueno (2026-10-01): "la pagina de productos no hay opcion
 * para agregar imagen, para que se pueda ver en el catalogo de productos".
 * Medido en el lote 231: 0 de 87 productos con foto. La base y la API ya
 * aceptaban `imageUrl` y `description`; faltaban subir la imagen y los campos
 * en el formulario.
 *
 * Aqui se EJECUTAN las reglas (que es una foto, que direccion se admite, que
 * hace el esquema con un campo vacio) y se DIBUJA el campo. Las rutas, contra
 * una base y un almacen falso, en `verificar_foto_de_producto_db.ts`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
const intenta = <T,>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };

const relleno = (cabeza: number[], n = 32) => new Uint8Array([...cabeza, ...new Array(Math.max(0, n - cabeza.length)).fill(0)]);
const JPG = relleno([0xff, 0xd8, 0xff, 0xe0]);
const PNG = relleno([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = relleno([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const WAV = relleno([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]);
const GIF = relleno([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const EMP = '11111111-1111-4111-8111-111111111111';
const OTRA = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const SUPA = 'https://abc.supabase.co';

async function main() {
  //  Vale en los dos estados: la base y el repositorio ya guardaban la foto.
  if (!/imageUrl: data\.imageUrl/.test(leer('src/repositories/productRepository.ts'))) throw new Error('Precondicion: el repositorio ya no guarda imageUrl');

  console.log('\n1) Que es una foto, ejecutado\n');
  type F = typeof import('../src/services/productos/fotoDeProducto');
  let M: F | null = null;
  try { M = await import('../src/services/productos/fotoDeProducto'); } catch { M = null; }
  const E1 = ['JPG, PNG y WebP se reconocen por sus bytes', 'SVG, GIF, un RIFF que no es WebP y un fichero corto NO son fotos',
    'vacio y mas de 1 MB se rechazan con su motivo', 'el nombre lo pone el servidor, bajo la empresa; un identificador raro lanza',
    'solo se admite una foto NUESTRA y de ESTA empresa (o ninguna)'];
  if (!M) falta(E1, 'no existe services/productos/fotoDeProducto.ts');
  else {
    const m = M;
    ok(E1[0], m.tipoDeFoto(JPG)?.ext === 'jpg' && m.tipoDeFoto(PNG)?.mime === 'image/png' && m.tipoDeFoto(WEBP)?.ext === 'webp');
    ok(E1[1], m.tipoDeFoto(SVG) === null && m.tipoDeFoto(GIF) === null && m.tipoDeFoto(WAV) === null && m.tipoDeFoto(new Uint8Array([0xff, 0xd8, 0xff])) === null);
    const grande = new Uint8Array(m.PESO_MAXIMO_DE_FOTO + 1); grande.set([0xff, 0xd8, 0xff]);
    const justa = new Uint8Array(m.PESO_MAXIMO_DE_FOTO); justa.set([0xff, 0xd8, 0xff]);
    ok(E1[2], /vacío/.test(m.motivoParaNoAceptarFoto(new Uint8Array(0)) ?? '') && /1 MB/.test(m.motivoParaNoAceptarFoto(grande) ?? '')
      && m.motivoParaNoAceptarFoto(justa) === null && /JPG, PNG o WebP/.test(m.motivoParaNoAceptarFoto(SVG) ?? '') && m.motivoParaNoAceptarFoto(PNG) === null);
    ok(E1[3], m.rutaDeFoto(EMP, ID, 'png') === `${EMP}/${ID}.png` && intenta(() => m.rutaDeFoto('../otra', ID, 'png')) === 'LANZO'
      && intenta(() => m.rutaDeFoto(EMP, 'foto de la puerta', 'png')) === 'LANZO');
    const buena = m.direccionDeFoto(`${SUPA}/`, m.rutaDeFoto(EMP, ID, 'webp'));
    ok(E1[4], buena === `${SUPA}/storage/v1/object/public/product_images/${EMP}/${ID}.webp`
      && m.esFotoAdmisible(buena, SUPA, EMP) && m.esFotoAdmisible(null, SUPA, EMP) && m.esFotoAdmisible('', SUPA, EMP) && m.esFotoAdmisible(undefined, SUPA, EMP)
      && !m.esFotoAdmisible(buena, SUPA, OTRA) && !m.esFotoAdmisible('https://otro.example/x.png', SUPA, EMP)
      && !m.esFotoAdmisible(`${SUPA}/storage/v1/object/public/company_logos/${EMP}/${ID}.png`, SUPA, EMP)
      && !m.esFotoAdmisible(`${SUPA}/storage/v1/object/public/product_images/${EMP}/../${OTRA}/${ID}.png`, SUPA, EMP)
      && !m.esFotoAdmisible(`${buena}?x=<script>`, SUPA, EMP) && !m.esFotoAdmisible(buena.replace('.webp', '.svg'), SUPA, EMP), buena);
  }

  console.log('\n2) El esquema: vacio BORRA, ausente no toca\n');
  const { esquemaProductoParcial } = await import('../src/schemas/producto');
  const parcial = (b: object) => { const r = esquemaProductoParcial.safeParse(b); return r.success ? (r.data as Record<string, unknown>) : 'INVALIDO'; };
  const vacio = parcial({ imageUrl: '', description: '   ' });
  ok('foto y descripcion vacias llegan como null (borrar), no como "no lo toques"',
    vacio !== 'INVALIDO' && vacio.imageUrl === null && vacio.description === null, JSON.stringify(vacio));
  const ausente = parcial({ name: 'Puerta' });
  invariante('si no vienen, no se tocan', ausente !== 'INVALIDO' && ausente.imageUrl === undefined && ausente.description === undefined);
  ok('la descripcion tiene tope (2.000)', parcial({ description: 'x'.repeat(2001) }) === 'INVALIDO' && parcial({ description: 'x'.repeat(2000) }) !== 'INVALIDO');
  const sku = parcial({ sku: '' });
  invariante('los demas textos siguen como estaban: un SKU vacio es "no vino"', sku !== 'INVALIDO' && sku.sku === undefined);

  console.log('\n3) El campo, dibujado\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let C: ((p: unknown) => unknown) | null = null;
  try { C = ((await import('../src/app/dashboard/products/components/FotoYDescripcion')) as unknown as { FotoYDescripcion: typeof C }).FotoYDescripcion; } catch { C = null; }
  const E3 = ['sin foto: "Subir imagen", y solo acepta JPG, PNG y WebP', 'con foto: se ve, y se puede cambiar o quitar',
    'la descripcion lleva su etiqueta y su tope; un error se pinta'];
  if (!C) falta(E3, 'no existe FotoYDescripcion');
  else {
    const nada = () => {};
    const pinta = (p: object) => renderToStaticMarkup(React.createElement(C as never, { description: '', imageUrl: '', alCambiarFoto: nada, alCambiarDescripcion: nada, ...p }));
    const sin = pinta({});
    ok(E3[0], />Subir imagen</.test(sin) && !/>Quitar</.test(sin) && !/<img/.test(sin) && /type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/.test(sin));
    const con = pinta({ imageUrl: 'https://abc.supabase.co/f.png' });
    ok(E3[1], /<img[^>]*src="https:\/\/abc\.supabase\.co\/f\.png"/.test(con) && />Cambiar</.test(con) && /Quitar/.test(con) && !/>Subir imagen</.test(con));
    const err = pinta({ description: 'Caoba', error: 'La imagen no es válida.' });
    ok(E3[2], /<label for="descripcion-producto"/.test(err) && /<textarea id="descripcion-producto"[^>]*maxLength="2000"[^>]*>Caoba<\/textarea>/.test(err)
      && /La imagen no es válida\./.test(err));
  }

  //  Lo que el dibujo no ve: que hacen los botones. Acotado al componente.
  const campo = sinComentarios(leer('src/app/dashboard/products/components/FotoYDescripcion.tsx'));
  ok('"Quitar" deja la foto VACIA (que es lo que el servidor entiende como borrarla)', /onClick=\{\(\) => alCambiarFoto\(''\)\}/.test(campo));
  ok('lo que se sube es la foto REDUCIDA, no el original',
    /reducida = await reducirImagen\(file\);/.test(campo) && /cuerpo\.append\('file', reducida\);/.test(campo) && !/cuerpo\.append\('file', file\)/.test(campo));

  console.log('\n4) Conectado al formulario y a las rutas\n');
  const pagina = sinComentarios(leer('src/app/dashboard/products/page.tsx'));
  ok('el formulario lleva foto y descripcion: en el estado, al limpiar y al abrir para editar',
    (pagina.match(/description: '', imageUrl: ''|description: '',\s*imageUrl: ''/g) ?? []).length === 2
    && /description: product\.description \|\| '',\s*imageUrl: product\.imageUrl \|\| ''/.test(pagina));
  ok('  y el campo esta en el paso 1, escribiendo en el formulario',
    /<FotoYDescripcion\s+imageUrl=\{formData\.imageUrl\}\s+description=\{formData\.description\}/.test(pagina)
    && /alCambiarFoto=\{\(url\) => \{ setFormData\(\(prev\) => \(\{ \.\.\.prev, imageUrl: url \}\)\)/.test(pagina));
  //  LOTE 235: las reglas de la subida salieron de la ruta a `subirFotoDeLaEmpresa`
  //  (las comparte la imagen de la portada). La ruta pone el permiso y delega;
  //  el peso y el nombre se miran donde viven. En el estado de antes, todo estaba
  //  en la ruta: por eso se leen los dos ficheros juntos.
  const ruta = sinComentarios(leer('src/app/api/v1/products/image/route.ts'));
  const subida = `${ruta}\n${sinComentarios(leer('src/services/productos/subirFoto.ts'))}`;
  ok('subir pide el mismo permiso que guardar un producto, y mira el peso ANTES de leer el fichero',
    /enforcePermission\([^)]*'catalogo', 'write'\)/.test(ruta)
    && subida.indexOf('file.size > PESO_MAXIMO_DE_FOTO') > 0 && subida.indexOf('file.size > PESO_MAXIMO_DE_FOTO') < subida.indexOf('file.arrayBuffer()'));
  ok('  el nombre no sale del fichero subido', /rutaDeFoto\((?:auth\.)?companyId, randomUUID\(\), tipo\.ext\)/.test(subida) && !/file\.name/.test(subida));
  const guardas = ['src/app/api/v1/products/route.ts', 'src/app/api/v1/products/[id]/route.ts'].map((f) => sinComentarios(leer(f)));
  ok('crear y editar rechazan una foto que no sea nuestra',
    guardas.every((g) => /if \(!esFotoAdmisible\(result\.data\.imageUrl, process\.env\.SUPABASE_URL \|\| '', auth\.companyId\)\)/.test(g)));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
