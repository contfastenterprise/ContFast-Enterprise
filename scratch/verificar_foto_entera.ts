/**
 * Lote 237 -- la foto se ve ENTERA en su recuadro, y el catalogo va a cuatro
 * columnas en pantalla grande. Pedido del dueño (2026-10-01): "no importa que
 * sea grande o pequeña, debe verse ajustada al espacio".
 *
 * Antes las seis fotos (tarjeta del catalogo, ficha, portada, cotizacion y las
 * dos vistas previas del panel) llenaban el recuadro recortando lo que sobraba.
 * Ahora comparten UNA regla, `FOTO_ENTERA` (`src/utils/fotoEntera.ts`).
 *
 * Que la foto se ve bien no lo dice un banco: se miro en el navegador (la
 * portada de Latin Doors, una foto alta y una ancha en las tarjetas). Aqui se
 * vigila que las seis sigan usando la misma regla y que la rejilla no vuelva
 * atras.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco se quedo colgado y no llego al final'); process.exit(1); } });

/** Las seis fotos: donde vive cada una. */
const FOTOS: Array<[string, string]> = [
  ['la tarjeta del catalogo', 'src/components/storefront/TarjetaProducto.tsx'],
  ['la ficha del producto', 'src/app/[empresa]/productos/[slug]/page.tsx'],
  ['la portada de la tienda', 'src/components/storefront/PortadaTienda.tsx'],
  ['la cotizacion del visitante', 'src/app/[empresa]/mi-cotizacion/CartPageClient.tsx'],
  ['la vista previa del producto', 'src/app/dashboard/products/components/FotoYDescripcion.tsx'],
  ['la vista previa de la portada', 'src/app/dashboard/settings/components/ImagenDeLaPortada.tsx'],
];

type Fn = (p: unknown) => unknown;

async function main() {
  //  Vale en los dos estados: las seis fotos existen y el catalogo pide la rejilla de 3 junto a los filtros.
  for (const [, f] of FOTOS) if (!/<img\b/.test(leer(f))) throw new Error(`Precondicion: ${f} ya no pinta una foto`);
  if (!/<RejillaDeProductos [^>]*columnas=\{3\}/.test(leer('src/app/[empresa]/productos/page.tsx'))) throw new Error('Precondicion: el catalogo ya no pide la rejilla de 3 junto a los filtros');

  console.log('\n1) Una sola regla para las seis fotos\n');
  let regla = '';
  try { regla = ((await import('../src/utils/fotoEntera')) as { FOTO_ENTERA?: string }).FOTO_ENTERA ?? ''; } catch { regla = ''; }
  const clases = regla.split(/\s+/).filter(Boolean);
  ok('la foto se ve ENTERA: llena el recuadro sin recortar', clases.includes('object-contain') && clases.includes('h-full') && clases.includes('w-full') && !clases.includes('object-cover'), regla || 'no existe utils/fotoEntera.ts');
  ok('  y su fondo blanco se funde con el gris del recuadro', clases.includes('mix-blend-multiply'), regla);
  for (const [nombre, f] of FOTOS) {
    const src = sinComentarios(leer(f));
    //  La etiqueta de la FOTO (la que lleva `src={`), no cualquier <img>: la portada tiene ademas la del logo.
    const etiquetas = [...src.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const conRegla = etiquetas.filter((e) => /className=\{(?:FOTO_ENTERA|`[^`]*\$\{FOTO_ENTERA\}[^`]*`)\}/.test(e));
    const recortadas = etiquetas.filter((e) => /\bobject-cover\b/.test(e));
    ok(`${nombre} usa la regla, y ninguna foto suya se recorta`,
      /import \{ FOTO_ENTERA \} from '@\/utils\/fotoEntera';/.test(src) && conRegla.length === 1 && recortadas.length === 0,
      `${conRegla.length} con la regla, ${recortadas.length} recortadas`);
  }

  console.log('\n2) Dibujadas\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const P = (await import('../src/components/storefront/PortadaTienda')) as unknown as Record<string, Fn>;
  const portada = renderToStaticMarkup(React.createElement(P.PortadaTienda as never, { empresaSlug: 'latin', nombre: 'Latin Doors', logoUrl: 'https://x/logo.png',
    portada: { anuncio: null, titulo: null, texto: null, imagenUrl: 'https://x/portada.webp' } }));
  const img = /<img[^>]*src="https:\/\/x\/portada\.webp"[^>]*>/.exec(portada)?.[0] ?? '';
  ok('la imagen de la portada sale entera en su mitad', /class="h-full w-full object-contain mix-blend-multiply"/.test(img), img);
  //  El marco: la imagen va DENTRO de un espacio con margen a los cuatro lados, y su mitad corta lo que se salga.
  const marco = /<div class="([^"]*)"><div class="([^"]*)"><img[^>]*src="https:\/\/x\/portada\.webp"/.exec(portada);
  const fuera = (marco?.[1] ?? '').split(' ');
  const dentro = (marco?.[2] ?? '').split(' ');
  ok('  dentro de un marco con margen: por grande que sea, no sobrepasa los bordes',
    fuera.includes('relative') && fuera.includes('overflow-hidden') && dentro.includes('absolute')
    && dentro.some((c) => /^inset-[1-9]\d*$/.test(c)) && !dentro.includes('inset-0'), `${marco?.[1] ?? '-'} | ${marco?.[2] ?? '-'}`);

  const T = (await import('../src/components/storefront/TarjetaProducto')) as unknown as Record<string, Fn>;
  const rejilla = (columnas: number) => renderToStaticMarkup(React.createElement(T.RejillaDeProductos as never, { productos: [], empresaSlug: 'latin', columnas }));
  const junto = /class="([^"]*)"/.exec(rejilla(3))?.[1].split(' ') ?? [];
  ok('junto a los filtros, el catalogo va a CUATRO columnas en pantalla grande', junto.includes('xl:grid-cols-4'), junto.join(' '));
  //  Cierto antes y despues: 2 en el movil, 3 en pantalla mediana (con los filtros al lado, cuatro no caben), y la rejilla sin filtros a 4.
  invariante('2 columnas en el movil y 3 en pantalla mediana; sin filtros, 4',
    junto.includes('grid-cols-2') && junto.includes('lg:grid-cols-3') && /\blg:grid-cols-4\b/.test(rejilla(4)));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
