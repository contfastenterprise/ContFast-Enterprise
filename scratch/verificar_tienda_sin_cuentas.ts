/**
 * Lote 233 -- la tienda sin cuentas: el carrito es la cotizacion del visitante.
 *
 * Decision del dueno (2026-09-30): "No quiero inicio de sesion, solo quiero
 * que el usuario pueda ver los productos y precios disponibles. Puede anadir
 * al carrito, pero ese carrito solo funcionaria como cotizacion para el
 * usuario". Medido antes (PRODUCCION, solo lectura): 0 usuarios `cliente` y 0
 * cotizaciones llegadas de la tienda -- lo que se retira nunca se uso.
 *
 * Se retiran: iniciar sesion, registro, mi cuenta, la ruta publica que creaba
 * usuarios, la que guardaba la cotizacion en el sistema (y su servicio) y el
 * icono de cuenta. El cerrojo ISO-02 del middleware SE QUEDA.
 *
 * Y lo que la cotizacion hace distinto: el precio sale del CATALOGO en cada
 * visita, no del navegador (antes ensenaba el del momento de anadir, y se
 * podia editar a mano). Se imprime con los datos de la empresa.
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
const intenta = <T,>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };

const APP = 'src/app/[empresa]';
const SF = 'src/components/storefront';

async function main() {
  //  Valen en los dos estados.
  if (!/const STOREFRONT_ROLE = 'cliente';/.test(leer('src/middleware/auth.ts'))) throw new Error('Precondicion: el cerrojo ISO-02 ya no esta en el middleware');
  if (!existsSync(join(raiz, `${APP}/mi-cotizacion/CartPageClient.tsx`))) throw new Error('Precondicion: no esta la pagina de la cotizacion');

  console.log('\n1) La cotizacion, ejecutada\n');
  type Cot = typeof import('../src/services/storefront/cotizacion');
  let C: Cot | null = null;
  try { C = await import('../src/services/storefront/cotizacion'); } catch { C = null; }
  const E1 = ['lo guardado se valida: basura, no-lista, sin producto o sin cantidad no pasan', '  y un producto repetido suma sus cantidades',
    'el precio sale del CATALOGO, no del navegador', 'lo que ya no se vende no suma, y se avisa con su nombre guardado',
    'subtotal + ITBIS = total al centavo, ITBIS al 18 %', 'cambiar la cantidad da una lista nueva, y 0 quita'];
  if (!C) falta(E1, 'no existe services/storefront/cotizacion.ts');
  else {
    const c = C;
    const v = intenta(() => c.leerCarrito(JSON.stringify([{ productId: 'a', quantity: 2 }, { productId: '', quantity: 1 }, { quantity: 3 },
      { productId: 'b', quantity: 0 }, { productId: 'c', quantity: 'x' }, { productId: 'd', quantity: 1.9 }, null, 5])));
    ok(E1[0], JSON.stringify(v) === JSON.stringify([{ productId: 'a', quantity: 2 }, { productId: 'd', quantity: 1 }])
      && JSON.stringify(intenta(() => c.leerCarrito('{roto'))) === '[]' && JSON.stringify(intenta(() => c.leerCarrito('{"a":1}'))) === '[]'
      && JSON.stringify(intenta(() => c.leerCarrito(null))) === '[]', JSON.stringify(v));
    const r = intenta(() => c.leerCarrito(JSON.stringify([{ productId: 'a', quantity: 2, name: 'Puerta' }, { productId: 'a', quantity: 3 }])));
    ok(E1[1], JSON.stringify(r) === JSON.stringify([{ productId: 'a', quantity: 5, name: 'Puerta' }]), JSON.stringify(r));
    const catalogo = [{ id: 'a', name: 'Puerta Roble', precio: 3188.42, imageUrl: null, slug: 'puerta--a' },
      { id: 'b', name: 'Ventana', precio: 99.99, imageUrl: null, slug: 'ventana--b' }];
    //  El carrito guardado trae un precio viejo (o tocado): no se usa.
    const guardado = c.leerCarrito(JSON.stringify([{ productId: 'a', quantity: 2, price: 1 }, { productId: 'b', quantity: 3, price: 0.01 },
      { productId: 'zzz', quantity: 1, name: 'Closet retirado' }]));
    const cot = c.armarCotizacion(guardado, catalogo);
    //  Y aunque alguien le pase el renglon CRUDO (sin pasar por leerCarrito), el
    //  precio que traiga no cuenta: la segunda barrera, probada aparte.
    const crudo = c.armarCotizacion([{ productId: 'a', quantity: 1, price: 1 } as unknown as import('../src/services/storefront/cotizacion').RenglonGuardado], catalogo);
    ok(E1[2], cot.renglones.map((x) => `${x.nombre}:${x.precio}x${x.cantidad}=${x.importe}`).join('|') === 'Puerta Roble:3188.42x2=6376.84|Ventana:99.99x3=299.97'
      && crudo.renglones[0]?.precio === 3188.42 && crudo.total === 3762.34,
      cot.renglones.map((x) => `${x.nombre}:${x.precio}x${x.cantidad}=${x.importe}`).join('|') + ` | crudo ${crudo.total}`);
    ok(E1[3], JSON.stringify(cot.noDisponibles) === JSON.stringify([{ productId: 'zzz', nombre: 'Closet retirado' }]) && cot.unidades === 5);
    ok(E1[4], cot.subtotal === 6676.81 && cot.itbis === 1201.83 && cot.total === 7878.64
      && Math.round((cot.subtotal + cot.itbis) * 100) === Math.round(cot.total * 100), `${cot.subtotal} + ${cot.itbis} = ${cot.total}`);
    const l0 = [{ productId: 'a', quantity: 2 }, { productId: 'b', quantity: 1 }];
    const l1 = c.cambiarCantidad(l0, 'a', 7);
    const l2 = c.cambiarCantidad(l1, 'b', 0);
    ok(E1[5], l1 !== l0 && l0[0].quantity === 2 && l1[0].quantity === 7 && JSON.stringify(l2) === JSON.stringify([{ productId: 'a', quantity: 7 }]));
  }

  console.log('\n2) La pagina de la cotizacion\n');
  const cliente = sinComentarios(leer(`${APP}/mi-cotizacion/CartPageClient.tsx`));
  const pagina = sinComentarios(leer(`${APP}/mi-cotizacion/page.tsx`));
  ok('no se envia a ningun sitio: ni una llamada a la red',
    !/fetch\(/.test(cliente) && /armarCotizacion\(carrito, catalogo\)/.test(cliente));
  ok('  los precios los pone el servidor, con el precio vigente',
    /precio: precioVigente\(p\)/.test(pagina) && /catalogo=\{catalogo\}/.test(pagina));
  ok('  el carrito se lee en un efecto, no al pintar (lote 195)',
    /useEffect\(\(\) => \{\s*cargar\(\);\s*setListo\(true\);/.test(cliente) && /if \(!listo\) return/.test(cliente));
  ok('se imprime, con la empresa, la fecha y la advertencia de que no es factura',
    /onClick=\{\(\) => window\.print\(\)\}/.test(cliente) && /hidden print:mb-6 print:block/.test(cliente)
    && /\{empresa\.name\}/.test(cliente) && /RNC \{empresa\.rnc\}/.test(cliente) && /no es una factura ni un comprobante fiscal/.test(cliente));
  ok('  y al imprimir no salen la cabecera ni el pie de la tienda',
    /<header className="[^"]*print:hidden/.test(leer(`${SF}/CabeceraTienda.tsx`)) && /<footer className="[^"]*print:hidden/.test(leer(`${SF}/PieTienda.tsx`)));

  console.log('\n3) Las cuentas, retiradas\n');
  const fuera = [`${APP}/login`, `${APP}/registro`, `${APP}/mi-cuenta`, 'src/app/api/storefront/auth/register/route.ts',
    'src/app/api/storefront/quotes/route.ts', 'src/services/storefront/quoteService.ts', `${SF}/HeaderAuthClient.tsx`];
  const siguen = fuera.filter((f) => existsSync(join(raiz, f)));
  ok('no quedan iniciar sesion, registro, mi cuenta ni sus rutas', siguen.length === 0, siguen.join(', '));
  const cab = sinComentarios(leer(`${SF}/CabeceraTienda.tsx`));
  const pie = sinComentarios(leer(`${SF}/PieTienda.tsx`));
  ok('  la cabecera conserva favoritos y cotizacion, sin icono de cuenta',
    /\/mi-cotizacion`/.test(cab) && /<Favoritos /.test(cab) && !/HeaderAuthClient|\/login|\/mi-cuenta/.test(cab));
  ok('  el pie no enlaza a cuentas', /\/mi-cotizacion`/.test(pie) && !/\/mi-cuenta|\/registro|\/login/.test(pie));
  //  Nada de la tienda apunta a donde ya no hay nada.
  const tienda = ['page.tsx', 'layout.tsx', 'productos/page.tsx', 'productos/[slug]/page.tsx', 'favoritos/page.tsx', 'promociones/page.tsx',
    'mi-cotizacion/page.tsx', 'mi-cotizacion/CartPageClient.tsx'].map((f) => sinComentarios(leer(`${APP}/${f}`))).join('\n')
    + ['AddToCartClient.tsx', 'CatalogAddButton.tsx', 'TarjetaProducto.tsx', 'ListaDeFavoritos.tsx'].map((f) => sinComentarios(leer(`${SF}/${f}`))).join('\n');
  ok('  y ninguna pantalla de la tienda enlaza a lo retirado', tienda.length > 1000 && !/\/(login|registro|mi-cuenta)`|api\/storefront\//.test(tienda));
  const pend = leer('src/tests/permisosRutas.vitest.ts');
  ok('la lista de rutas pendientes de permisos encoge (storefront/quotes ya no existe)', !/^\s*'storefront\/quotes\/route\.ts',/m.test(pend) && /lote 233/.test(pend));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
