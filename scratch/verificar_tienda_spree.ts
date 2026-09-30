/**
 * Lote 231 -- la tienda publica, al estilo de Spree. Pedido del dueno
 * (2026-09-30), con sus decisiones: fotos con marcador hasta que se puedan
 * subir (lote siguiente), portada automatica hasta que sea configurable,
 * filtro por categoria, ordenar por precio o nombre, favoritos en el navegador,
 * colores de Spree con el azul marino, y "el sidebar solo para los filtros".
 *
 * Lo que este banco EJECUTA: las reglas del catalogo y de los favoritos, y el
 * HTML de la tarjeta y de los filtros. Lo que no se puede ejecutar sin Next
 * (la cabecera usa la ruta y la direccion) se mira en el codigo, acotado.
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

const E = '[empresa]';
const APP = `src/app/${E}`;
const SF = 'src/components/storefront';

const U1 = '6a474e4e-2cdb-4f6d-b6e8-bdda9b56ac49';
const U2 = 'dac79919-b789-4bd7-9993-f14eff2ab0ea';
const prod = (name: string, price: number, extra: Record<string, unknown> = {}) => ({
  id: `${name}-id`, name, description: null, slug: `${name}--x`, price, isOnSale: false, promotionalPrice: 0,
  imageUrl: null, categoryId: null, categoryName: null, ...extra,
});

async function main() {
  //  Vale en los dos estados: la tienda existe y resuelve la empresa por su nombre.
  if (!/resolveCompanyBySlug/.test(leer(`${APP}/layout.tsx`))) throw new Error('Precondicion: el layout de la tienda ya no resuelve la empresa');

  console.log('\n1) Las reglas del catalogo, ejecutadas\n');
  type Cat = typeof import('../src/services/storefront/catalogo');
  let C: Cat | null = null;
  try { C = await import('../src/services/storefront/catalogo'); } catch { C = null; }
  const E1 = ['lo que llega en ?orden= y no se conoce es relevancia', 'el precio que manda es el vigente (el de oferta si la hay)',
    '  y una oferta marcada sin precio, o que no rebaja, no es oferta', 'ordenar por precio usa el vigente, y a igualdad, por nombre',
    '  de mayor a menor, igual', '  por nombre, sin mayusculas ni tildes y con numeros en su orden', 'relevancia: ofertas primero, luego por nombre',
    '  y ordenar no toca la lista de entrada', 'solo se ofrecen categorias con productos, de mas a menos',
    'el marcador sin foto lleva las iniciales', 'los enlaces conservan la busqueda y la categoria, y relevancia no ensucia la direccion'];
  if (!C) falta(E1, 'no existe services/storefront/catalogo.ts');
  else {
    const c = C;
    ok(E1[0], c.leerOrden('xxx') === 'relevancia' && c.leerOrden(undefined) === 'relevancia' && c.leerOrden(['precio-desc', 'x']) === 'precio-desc' && c.leerOrden('nombre') === 'nombre');
    const oferta = prod('B', 800, { isOnSale: true, promotionalPrice: 500 });
    ok(E1[1], c.precioVigente(oferta) === 500 && c.precioVigente(prod('A', 700)) === 700);
    ok(E1[2], !c.tieneOferta(prod('C', 800, { isOnSale: true, promotionalPrice: 0 })) && !c.tieneOferta(prod('D', 800, { isOnSale: true, promotionalPrice: 900 }))
      && c.precioVigente(prod('C', 800, { isOnSale: true, promotionalPrice: 0 })) === 800 && c.tieneOferta(oferta));
    const lista = [prod('Zeta', 600), oferta, prod('alfa', 600), prod('Puerta 10', 100), prod('Puerta 9', 100)];
    const nombres = (xs: { name: string }[]) => xs.map((x) => x.name).join(',');
    ok(E1[3], nombres(c.ordenarProductos(lista, 'precio-asc')) === 'Puerta 9,Puerta 10,B,alfa,Zeta', nombres(c.ordenarProductos(lista, 'precio-asc')));
    ok(E1[4], nombres(c.ordenarProductos(lista, 'precio-desc')) === 'alfa,Zeta,B,Puerta 9,Puerta 10', nombres(c.ordenarProductos(lista, 'precio-desc')));
    ok(E1[5], nombres(c.ordenarProductos([prod('Ñame', 1), prod('árbol', 1), prod('Zeta', 1), prod('Puerta 10', 1), prod('Puerta 9', 1)], 'nombre')) === 'árbol,Ñame,Puerta 9,Puerta 10,Zeta');
    ok(E1[6], nombres(c.ordenarProductos(lista, 'relevancia')) === 'B,alfa,Puerta 9,Puerta 10,Zeta', nombres(c.ordenarProductos(lista, 'relevancia')));
    const antes = nombres(lista);
    c.ordenarProductos(lista, 'precio-desc');
    ok(E1[7], nombres(lista) === antes);
    const cats = [{ id: 'a', name: 'Ventanas', slug: 'v' }, { id: 'b', name: 'Puertas', slug: 'p' }, { id: 'c', name: 'Vacia', slug: 'x' }];
    const cuenta = c.contarPorCategoria([{ categoryId: 'a' }, { categoryId: 'b' }, { categoryId: 'b' }, { categoryId: null }]);
    const conP = c.categoriasConProductos(cats, cuenta);
    ok(E1[8], conP.map((x) => `${x.name}:${x.cantidad}`).join(',') === 'Puertas:2,Ventanas:1', conP.map((x) => `${x.name}:${x.cantidad}`).join(','));
    ok(E1[9], c.inicialesDe('Puerta Roble 90*210') === 'PR' && c.inicialesDe('closet') === 'C' && c.inicialesDe('  ') === '·' && c.inicialesDe('Ñame blanco') === 'ÑB');
    const e1 = c.enlaceDelCatalogo('latin', { categoria: 'a', q: 'roble', orden: 'nombre' }, { orden: 'precio-asc' });
    const e2 = c.enlaceDelCatalogo('latin', { categoria: 'a', q: 'roble', orden: 'nombre' }, { categoria: null, orden: 'relevancia' });
    ok(E1[10], e1 === '/latin/productos?categoria=a&q=roble&orden=precio-asc' && e2 === '/latin/productos?q=roble', `${e1} | ${e2}`);
    invariante('el precio se escribe como lo escribia la tienda',
      [0, 420, 1234.5, 3188.42].every((n) => c.precioDeTienda(n) === `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`));
  }

  console.log('\n2) Los favoritos, ejecutados\n');
  type Fav = typeof import('../src/services/storefront/favoritos');
  let F: Fav | null = null;
  try { F = await import('../src/services/storefront/favoritos'); } catch { F = null; }
  const E2 = ['la clave lleva la empresa (seis tiendas en el mismo navegador)', 'lo guardado se valida: basura, no-lista y no-UUID no pasan, sin repetir',
    'alternar pone y quita, en una lista NUEVA'];
  if (!F) falta(E2, 'no existe services/storefront/favoritos.ts');
  else {
    const f = F;
    ok(E2[0], f.claveDeFavoritos('latin') !== f.claveDeFavoritos('artalum') && f.claveDeFavoritos('latin').includes('latin'));
    const leido = intenta(() => f.leerFavoritos(JSON.stringify([U1, U1.toUpperCase(), 'x', 5, null, U2])));
    ok(E2[1], JSON.stringify(leido) === JSON.stringify([U1, U2]) && JSON.stringify(intenta(() => f.leerFavoritos('{roto'))) === '[]'
      && JSON.stringify(intenta(() => f.leerFavoritos('{"a":1}'))) === '[]' && JSON.stringify(intenta(() => f.leerFavoritos(null))) === '[]', JSON.stringify(leido));
    const l0: string[] = [U1];
    const l1 = f.alternarFavorito(l0, U2);
    const l2 = f.alternarFavorito(l1, U1.toUpperCase());
    ok(E2[2], l1 !== l0 && l0.length === 1 && JSON.stringify(l1) === JSON.stringify([U1, U2]) && JSON.stringify(l2) === JSON.stringify([U2])
      && f.esFavorito(l1, U2.toUpperCase()));
  }

  console.log('\n3) La tarjeta y los filtros, dibujados\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let T: Record<string, (p: unknown) => unknown> | null = null;
  try { T = (await import('../src/components/storefront/TarjetaProducto')) as unknown as Record<string, (p: unknown) => unknown>; } catch { T = null; }
  const E3 = ['sin foto, el marcador con las iniciales; con foto, la foto', 'OFERTA y el precio tachado solo si hay oferta de verdad',
    'la tarjeta enlaza a la ficha, y el corazon y Cotizar dicen de que producto son'];
  if (!T?.default) falta(E3, 'no existe TarjetaProducto');
  else {
    const pintar = (p: object) => intenta(() => renderToStaticMarkup(React.createElement(T!.default as never, { producto: p, empresaSlug: 'latin' }))) as string;
    const sinFoto = pintar(prod('Puerta Roble', 500, { categoryName: 'Puertas' }));
    const conFoto = pintar(prod('Puerta Roble', 500, { imageUrl: 'https://x/y.png' }));
    ok(E3[0], sinFoto !== 'LANZO' && />PR</.test(sinFoto) && !/<img/.test(sinFoto) && />Puertas</.test(sinFoto)
      && /<img[^>]*src="https:\/\/x\/y.png"/.test(conFoto) && !/>PR</.test(conFoto));
    const conOferta = pintar(prod('B', 800, { isOnSale: true, promotionalPrice: 500 }));
    const falsa = pintar(prod('B', 800, { isOnSale: true, promotionalPrice: 0 }));
    ok(E3[1], />Oferta</.test(conOferta) && /line-through[^>]*>.*RD\$ 800\.00/.test(conOferta) && /RD\$ 500\.00/.test(conOferta)
      && !/>Oferta</.test(falsa) && !/line-through/.test(falsa) && /RD\$ 800\.00/.test(falsa));
    ok(E3[2], /href="\/latin\/productos\/Puerta Roble--x"/.test(sinFoto) && /aria-label="Guardar Puerta Roble en favoritos"/.test(sinFoto)
      && /aria-label="Añadir Puerta Roble a mi cotización"/.test(sinFoto) && /aria-pressed="false"/.test(sinFoto));
  }
  let FC: Record<string, (p: unknown) => unknown> | null = null;
  try { FC = (await import('../src/components/storefront/FiltrosCatalogo')) as unknown as Record<string, (p: unknown) => unknown>; } catch { FC = null; }
  const E4 = ['la barra de filtros ofrece las categorias con su cantidad, conservando busqueda y orden', '  marca la elegida y deja quitar la busqueda',
    'el menu de orden ofrece los cuatro y conserva la categoria'];
  if (!FC?.ListaDeFiltros || !FC?.MenuDeOrden) falta(E4, 'no existe FiltrosCatalogo');
  else {
    const actual = { categoria: 'b', q: 'roble', orden: 'precio-desc' };
    const html = intenta(() => renderToStaticMarkup(React.createElement(FC!.ListaDeFiltros as never, {
      empresaSlug: 'latin', total: 87, actual,
      categorias: [{ id: 'b', name: 'Puertas', slug: 'p', cantidad: 68 }, { id: 'a', name: 'Ventanas', slug: 'v', cantidad: 7 }],
    }))) as string;
    ok(E4[0], html !== 'LANZO' && /href="\/latin\/productos\?categoria=a&amp;q=roble&amp;orden=precio-desc"/.test(html)
      && /href="\/latin\/productos\?q=roble&amp;orden=precio-desc"/.test(html) && />68</.test(html) && />87</.test(html));
    ok(E4[1], /aria-current="page"[^>]*><span>Puertas/.test(html) && /aria-label="Quitar la búsqueda &quot;roble&quot;"/.test(html)
      && /href="\/latin\/productos\?categoria=b&amp;orden=precio-desc"/.test(html));
    const menu = intenta(() => renderToStaticMarkup(React.createElement(FC!.MenuDeOrden as never, { empresaSlug: 'latin', actual }))) as string;
    const enlaces = menu === 'LANZO' ? [] : [...menu.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    ok(E4[2], enlaces.length === 4 && enlaces.every((h) => h.includes('categoria=b') && h.includes('q=roble')) && /Precio: mayor a menor/.test(menu),
      enlaces.join(' | '));
  }

  console.log('\n4) Las paginas usan las reglas\n');
  const layout = sinComentarios(leer(`${APP}/layout.tsx`));
  ok('el menu se deriva: categorias con productos y Promociones solo si hay ofertas',
    /categoriasConProductos\(categories, resumen\.porCategoria\)/.test(layout) && /resumen\.ofertas > 0 \?/.test(layout)
    && /<CabeceraTienda\b/.test(layout) && /<PieTienda\b/.test(layout));
  const portada = sinComentarios(leer(`${APP}/page.tsx`));
  ok('la portada ya no escribe categorias a mano: las saca de las de la empresa',
    /categoriasConProductos\(categorias, contarPorCategoria\(productos\)\)/.test(portada)
    && !/Closets|Gabinetes|Fabricamos soluciones/.test(portada));
  const catalogo = sinComentarios(leer(`${APP}/productos/page.tsx`));
  ok('el catalogo ordena con la regla y lee el orden de la direccion',
    /leerOrden\(sp\.orden\)/.test(catalogo) && /ordenarProductos\(products, actual\.orden\)/.test(catalogo));
  ok('  y la barra lateral lleva SOLO los filtros; el orden va arriba',
    /<aside aria-label="Filtros"[^>]*>\s*<div[^>]*>\{filtros\}<\/div>\s*<\/aside>/.test(catalogo) && /<MenuDeOrden\b/.test(catalogo)
    && !/<aside[\s\S]*?MenuDeOrden[\s\S]*?<\/aside>/.test(catalogo));
  ok('  y "Filtrar" y "Ordenar" se cierran al elegir (se montan de nuevo con la direccion)',
    /<details key=\{`filtrar-\$\{clave\}`\}/.test(catalogo) && /<MenuDeOrden key=\{`orden-\$\{clave\}`\}/.test(catalogo));
  const servicio = sinComentarios(leer('src/services/storefront/productService.ts'));
  ok('la busqueda escapa % y _ (se buscan tal cual)', /search\.replace\(\/\[\\\\%_\]\/g, \(c\) => `\\\\\$\{c\}`\)/.test(servicio));
  const resumen = (() => { const i = servicio.indexOf('async getResumenDelCatalogo'); return i < 0 ? '' : servicio.slice(i, servicio.indexOf('\n  },', i)); })();
  ok('  y el resumen cuenta como oferta lo mismo que `tieneOferta`',
    /\$\{products\.isOnSale\} and \$\{products\.promotionalPrice\} > 0 and \$\{products\.promotionalPrice\} < \$\{products\.priceConsumidor\}/.test(resumen));
  const promo = sinComentarios(leer(`${APP}/promociones/page.tsx`));
  ok('promociones ensena solo ofertas de verdad', /\.filter\(tieneOferta\)/.test(promo));

  console.log('\n5) El navegador se lee despues de montar\n');
  const uso = sinComentarios(leer(`${SF}/useFavoritos.ts`));
  ok('los favoritos se leen en un efecto, no mientras se pinta (lote 195)',
    /useEffect\(\(\) => \{[\s\S]*?recargar\(\);\s*setListo\(true\);/.test(uso) && !/useState[^;]*localStorage/.test(uso) && /localStorage\.getItem/.test(uso));
  const listaFav = sinComentarios(leer(`${SF}/ListaDeFavoritos.tsx`));
  ok('  y "no tienes favoritos" espera a haber leido', /if \(!listo\) return/.test(listaFav) && /Aún no tienes favoritos/.test(listaFav));
  ok('  y la pagina de favoritos no se indexa', /robots: \{ index: false \}/.test(sinComentarios(leer(`${APP}/favoritos/page.tsx`))));
  const insignia = sinComentarios(leer(`${SF}/CartBadgeClient.tsx`));
  ok('el oyente de `storage` de la cotizacion se quita al desmontar (antes quedaba uno por montaje)',
    /addEventListener\('storage', deOtraPestana\)/.test(insignia) && /removeEventListener\('storage', deOtraPestana\)/.test(insignia));
  const cab = sinComentarios(leer(`${SF}/CabeceraTienda.tsx`));
  ok('la cabecera subraya por ruta Y categoria', /searchParams\.get\('categoria'\)/.test(cab) && /aria-current=\{activo\(e\.href\) \? 'page' : undefined\}/.test(cab));
  //  Sin <Suspense>, `useSearchParams` hace que Next pinte TODA la tienda en el
  //  navegador (React Doctor, lote 231). Se lee la direccion en un solo sitio, y
  //  ese sitio va envuelto.
  const lecturas = cab.match(/useSearchParams\(\)/g) ?? [];
  const envoltura = (() => { const i = cab.indexOf('function MenuDeEnlaces'); return i < 0 ? '' : cab.slice(i, cab.indexOf('\n}', i)); })();
  ok('  y lee la direccion en UN sitio, envuelto en <Suspense> (si no, toda la tienda se pinta en el navegador)',
    lecturas.length === 1 && /<Suspense fallback=\{<Enlaces \{\.\.\.props\} activo=\{\(\) => false\} \/>\}>\s*<EnlacesConActivo \{\.\.\.props\} \/>\s*<\/Suspense>/.test(envoltura)
    && (cab.match(/<MenuDeEnlaces\b/g) ?? []).length === 2 && !/function CabeceraTienda[\s\S]*useSearchParams\(\)/.test(cab), `${lecturas.length} lecturas`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
