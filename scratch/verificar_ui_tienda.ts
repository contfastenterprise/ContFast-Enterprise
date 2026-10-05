/**
 * Lote 282 -- la tienda publica, al sistema de UI SIN perder su estetica.
 *
 * La auditoria de UI (lotes 269-281) dejo fuera la tienda a proposito: tiene la estetica del lote
 * 231 (Spree: redondeados, mayusculas espaciadas, azul #001e40) y la ve el cliente final. Lo que se
 * trae es el SISTEMA:
 *  1. un solo boton de la tienda (`BotonTienda` / `EnlaceTienda`, variantes en
 *     `botonTiendaVariantes.ts`): el primario estaba copiado a mano en ocho sitios, el contorno en
 *     tres y el enlace subrayado en tres;
 *  2. accesibilidad: foco visible en todo lo que se pulsa (antes: ni los filtros, ni el menu, ni el
 *     pie, ni el "Ordenar por"), iconos decorativos callados, `aria-expanded` en lo que se despliega,
 *     y el gris claro (`slate-400`, 2,6:1) fuera del texto;
 *  3. iconos: solo lucide (el "▾" del orden era un caracter);
 *  4. un patron por cosa: la cabecera de pagina/seccion (`TituloDeSeccion`) y el estado vacio
 *     (`EstadoVacio`), que estaban copiados en cuatro pantallas.
 *
 * La huella visible (textos, ejemplos, titulos, avisos y API) se compara con 3166354 (main antes del
 * lote) como INVARIANTE: lo que dice la tienda no cambia.
 *
 * Se ejecuta con: node node_modules/tsx/dist/cli.mjs scratch/verificar_ui_tienda.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { huella, diferencia, enCommit } from './huellaDePantalla';

const raiz = join(__dirname, '..');
const BASE = '3166354';
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const intenta = <T,>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };

const S = 'src/components/storefront/';
const A = 'src/app/[empresa]/';
/** Los ficheros de la tienda que ya existian en la base. */
const DE_LA_BASE = [
  `${A}favoritos/page.tsx`, `${A}layout.tsx`, `${A}loading.tsx`, `${A}mi-cotizacion/CartPageClient.tsx`,
  `${A}mi-cotizacion/page.tsx`, `${A}page.tsx`, `${A}productos/loading.tsx`, `${A}productos/page.tsx`,
  `${A}productos/[slug]/page.tsx`, `${A}promociones/page.tsx`,
  `${S}AddToCartClient.tsx`, `${S}BotonFavorito.tsx`, `${S}CabeceraTienda.tsx`, `${S}CartBadgeClient.tsx`,
  `${S}CatalogAddButton.tsx`, `${S}FiltrosCatalogo.tsx`, `${S}ListaDeFavoritos.tsx`, `${S}PieTienda.tsx`,
  `${S}PortadaTienda.tsx`, `${S}ProductRecommendations.tsx`, `${S}TarjetaProducto.tsx`,
];
/** Los que crea el lote. */
const NUEVOS = [`${S}BotonTienda.tsx`, `${S}botonTiendaVariantes.ts`, `${S}TituloDeSeccion.tsx`, `${S}EstadoVacio.tsx`];

/** La etiqueta de apertura de un elemento JSX, con sus llaves equilibradas. */
function etiquetas(src: string, nombre: string): { attrs: string; cuerpo: string }[] {
  const salida: { attrs: string; cuerpo: string }[] = [];
  const re = new RegExp(`<${nombre}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let k = m.index + nombre.length + 1, prof = 0;
    for (; k < src.length; k++) { const c = src[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const attrs = src.slice(m.index, k);
    const fin = src.indexOf(`</${nombre}>`, k);
    salida.push({ attrs, cuerpo: attrs.endsWith('/') || fin < 0 ? '' : src.slice(k + 1, fin) });
  }
  return salida;
}

/** Lo que el visitante lee. Ademas de `huella`, el texto que ahora viaja en `titulo="…"` o `texto="…"`. */
function lectura(src: string): string[] {
  const visible = (x: string) => x.startsWith('texto:') || x.startsWith('placeholder:') || x.startsWith('title:') || x.startsWith('aviso:') || x.startsWith('api:');
  //  `huella` lee como texto lo que hay entre los `>` y `<` de un tipo generico (`ComponentProps<'button'>
  //  & …`): eso es codigo y empieza por `&` o `)`. El texto de la tienda no.
  const salida = huella(src).filter(visible).filter((x) => !/^texto:[)&]/.test(x));
  //  El mismo criterio que `huella` para un texto: con espacios, o que no sea una sola palabra.
  for (const m of sinComentarios(src).matchAll(/\b(?:titulo|texto|descripcion)="([^"]+)"/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (!/^[\w.]+$/.test(t.replace(/\s/g, '')) || /\s/.test(t)) salida.push(`texto:${t}`);
  }
  return salida.sort();
}

async function main() {
  //  Precondiciones: valen en los dos estados.
  for (const f of DE_LA_BASE) if (!leer(f)) throw new Error(`Precondicion: falta ${f}`);
  if (!/<CabeceraTienda\b/.test(leer(`${A}layout.tsx`))) throw new Error('Precondicion: la tienda ya no usa CabeceraTienda (lote 231)');

  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;

  // ---------------------------------------------------------------------------------------------
  console.log('\n1) El boton de la tienda, dibujado\n');
  type MB = typeof import('../src/components/storefront/BotonTienda');
  type MV = typeof import('../src/components/storefront/botonTiendaVariantes');
  let B: MB | null = null, V: MV | null = null;
  try { B = await import('../src/components/storefront/BotonTienda'); V = await import('../src/components/storefront/botonTiendaVariantes'); } catch { B = null; V = null; }
  const E1 = [
    'primario: el azul de la tienda, redondeado, en mayusculas espaciadas',
    'contorno: borde oscuro que se rellena al pasar',
    'enlace: subrayado, sin relleno ni color propio (hereda el del sitio)',
    'EnlaceTienda es un <a> con las MISMAS clases que el boton',
    'los cuatro tamaños son los de las copias (xs, sm, md py-3, lg h-12)',
    'isLoading: giro, desactivado y aria-busy; sin el, nada de eso',
    'el foco se ve: anillo de 2 px del azul de la tienda, separado',
    'el `type` es obligatorio por tipo',
  ];
  if (!B || !V) falta(E1, 'no existe BotonTienda');
  else {
    const b = B, v = V;
    const boton = (p: object, hijo: string = 'Ver') => intenta(() => renderToStaticMarkup(h(b.BotonTienda as never, { type: 'button', ...p }, hijo)));
    const p = boton({});
    ok(E1[0], typeof p === 'string' && /^<button [^>]*type="button"/.test(p)
      && ['rounded-full', 'bg-[#001e40]', 'hover:bg-[#00142a]', 'text-white', 'uppercase', 'tracking-[0.15em]', 'font-semibold'].every((c) => p.includes(c)), String(p));
    const c = boton({ variante: 'contorno' });
    ok(E1[1], typeof c === 'string' && ['rounded-full', 'border-slate-900', 'text-slate-900', 'hover:bg-slate-900', 'hover:text-white'].every((x) => c.includes(x)) && !c.includes('bg-[#001e40]'), String(c));
    const e = boton({ variante: 'enlace' }), es = boton({ variante: 'enlace', tamano: 'xs' });
    ok(E1[2], typeof e === 'string' && typeof es === 'string' && /\bunderline\b/.test(e) && /underline-offset-8/.test(e) && /underline-offset-4/.test(es)
      && !/\bpx-8\b|\bpy-3\b|text-slate-900|text-white|bg-/.test(e) && /\bp-0\b/.test(e), `${e} | ${es}`);
    const a = intenta(() => renderToStaticMarkup(h(b.EnlaceTienda as never, { href: '/latin/productos' }, 'Ver')));
    const clase = (x: unknown) => (typeof x === 'string' ? /class="([^"]*)"/.exec(x)?.[1] ?? '' : '');
    ok(E1[3], typeof a === 'string' && /^<a [^>]*href="\/latin\/productos"/.test(a) && clase(a) === clase(p) && clase(a) !== '', `${a}`);
    const t = (tamano: string) => clase(boton({ tamano }));
    ok(E1[4], /\bpx-4\b/.test(t('xs')) && /text-\[11px\]/.test(t('xs')) && /\bpx-5\b/.test(t('sm')) && /\btext-xs\b/.test(t('sm'))
      //  `py-3(?![.\d])`: con `\b`, `py-3.5` tambien casaba (un mutante sobrevivio asi).
      && /\bpx-8\b/.test(t('md')) && /\bpy-3(?![.\d])/.test(t('md')) && /\bh-12\b/.test(t('lg')) && t('md') === clase(p), [t('xs'), t('sm'), t('md'), t('lg')].join(' | '));
    const cargando = boton({ isLoading: true });
    ok(E1[5], typeof cargando === 'string' && /disabled=""/.test(cargando) && /aria-busy="true"/.test(cargando) && /animate-spin/.test(cargando)
      && typeof p === 'string' && !/aria-busy|disabled=""|animate-spin/.test(p), String(cargando));
    ok(E1[6], typeof p === 'string' && ['focus-visible:ring-2', 'focus-visible:ring-[#001e40]', 'focus-visible:ring-offset-2', 'focus-visible:outline-none'].every((x) => p.includes(x))
      && v.FOCO_TIENDA.includes('focus-visible:ring-offset-2'));
    ok(E1[7], /type:\s*'button'\s*\|\s*'submit'/.test(leer(`${S}BotonTienda.tsx`)) && !/'use client'/.test(leer(`${S}BotonTienda.tsx`)));
  }

  // ---------------------------------------------------------------------------------------------
  console.log('\n2) Ninguna copia a mano en la tienda\n');
  const actuales = DE_LA_BASE.map((f) => ({ f, s: sinComentarios(leer(f)) }));
  const copias = (re: RegExp) => actuales.filter(({ s }) => re.test(s)).map(({ f }) => f.split('/').pop());
  //  Un boton, no la insignia del carrito (`rounded-full bg-[#001e40] px-1 … text-[10px]`): lleva mayusculas.
  const prim = copias(/bg-\[#001e40\][^"'`]*uppercase|uppercase[^"'`]*bg-\[#001e40\]/);
  ok('el primario no esta escrito a mano en ningun sitio', prim.length === 0, prim.join(', '));
  const cont = copias(/rounded-full border border-slate-900/);
  ok('el contorno tampoco', cont.length === 0, cont.join(', '));
  //  El subrayado fijo (`underline`), no el de pasar el raton (`hover:underline`).
  const enl = copias(/(?:^|["'`\s])underline underline-offset-[48]/);
  ok('ni el enlace subrayado', enl.length === 0, enl.join(', '));
  const usos = actuales.reduce((n, { s }) => n + (s.match(/<(?:BotonTienda|EnlaceTienda)\b/g) ?? []).length, 0);
  //  14 copias pasadas: 8 primarios, 3 contornos, 3 enlaces.
  ok('las 14 copias pasan por BotonTienda/EnlaceTienda', usos >= 14, `${usos} usos`);

  // ---------------------------------------------------------------------------------------------
  console.log('\n3) Lo que se pulsa: type, nombre, foco\n');
  const botones = actuales.flatMap(({ f, s }) => etiquetas(s, 'button').map((e) => ({ f, ...e })));
  invariante('todo <button> de la tienda declara su type (ya era asi)', botones.every((b) => /\btype=/.test(b.attrs)),
    botones.filter((b) => !/\btype=/.test(b.attrs)).map((b) => b.f).join(', '));
  //  Solo icono = sin texto en el cuerpo (los iconos de lucide son <Mayuscula …/>).
  //  Una expresion con JSX dentro ({abierto ? <X/> : <Menu/>}) es icono; una sin JSX ({r.nombre}) es texto.
  const textoDe = (cuerpo: string) => cuerpo.replace(/\{[^{}]*<[^{}]*\}/g, '').replace(/<[^>]+>/g, '').trim();
  const soloIcono = actuales.flatMap(({ f, s }) => ['button', 'Link', 'a', 'BotonTienda', 'EnlaceTienda']
    .flatMap((n) => etiquetas(s, n)).filter((e) => !textoDe(e.cuerpo) && !e.attrs.endsWith('/')).map((e) => ({ f, ...e })));
  invariante('todo boton o enlace de solo icono lleva aria-label (ya era asi)', soloIcono.every((e) => /aria-label=/.test(e.attrs)),
    soloIcono.filter((e) => !/aria-label=/.test(e.attrs)).map((e) => `${e.f}: ${e.attrs.slice(0, 60)}`).join(' | '));
  //  Un icono dentro de algo que se pulsa es decorativo: el nombre lo pone el texto o el aria-label.
  const ICONOS = /<(Heart|Search|Menu|X|ShoppingBag|Plus|Minus|Trash2|Printer|ChevronDown|SlidersHorizontal|LogIn)\b([^>]*)\/>/g;
  const iconosSinCallar = actuales.flatMap(({ f, s }) => ['button', 'Link', 'a', 'summary', 'BotonTienda', 'EnlaceTienda']
    .flatMap((n) => etiquetas(s, n)).flatMap((e) => [...e.cuerpo.matchAll(ICONOS)].filter((m) => !/aria-hidden/.test(m[2])).map((m) => `${f.split('/').pop()}:${m[1]}`)));
  ok('los iconos dentro de botones y enlaces son decorativos (aria-hidden)', iconosSinCallar.length === 0, iconosSinCallar.join(', '));
  const cab = sinComentarios(leer(`${S}CabeceraTienda.tsx`));
  const lupaMovil = etiquetas(cab, 'button').find((e) => /aria-label="Buscar productos"/.test(e.attrs));
  ok('la lupa del movil dice si el buscador esta abierto (aria-expanded) y cual es', !!lupaMovil && /aria-expanded=\{buscando\}/.test(lupaMovil.attrs) && /aria-controls="buscador-tienda"/.test(lupaMovil.attrs));

  //  El foco, en lo DIBUJADO: todo <a>, <button> y <summary> lleva un anillo de foco.
  const sinFoco = (html: string) => [...html.matchAll(/<(a|button|summary)\b[^>]*>/g)].map((m) => m[0])
    .filter((t) => !/focus-visible:(?:before:)?ring-2/.test(t));
  type MT = typeof import('../src/components/storefront/TarjetaProducto');
  type MF = typeof import('../src/components/storefront/FiltrosCatalogo');
  type MP = typeof import('../src/components/storefront/PieTienda');
  type MPo = typeof import('../src/components/storefront/PortadaTienda');
  const T: MT = await import('../src/components/storefront/TarjetaProducto');
  const Fi: MF = await import('../src/components/storefront/FiltrosCatalogo');
  const Pi: MP = await import('../src/components/storefront/PieTienda');
  const Po: MPo = await import('../src/components/storefront/PortadaTienda');
  const producto = { id: 'p1', name: 'Puerta Roble 90x210', slug: 'puerta-roble', price: 8000, promotionalPrice: 6500, isOnSale: true,
    imageUrl: null, categoryName: 'Puertas', categoryId: 'c1', description: null } as never;
  const actual = { categoria: 'c1', q: 'roble', orden: 'relevancia' } as never;
  const dibujos: Record<string, string> = {
    tarjeta: renderToStaticMarkup(h(T.default as never, { producto, empresaSlug: 'latin' })),
    filtros: renderToStaticMarkup(h(Fi.ListaDeFiltros as never, { empresaSlug: 'latin', categorias: [{ id: 'c1', name: 'Puertas', cantidad: 4 }], total: 9, actual })),
    orden: renderToStaticMarkup(h(Fi.MenuDeOrden as never, { empresaSlug: 'latin', actual })),
    pie: renderToStaticMarkup(h(Pi.default as never, { empresaSlug: 'latin', empresa: { name: 'Latin', rnc: '1', phone: '809', email: 'a@b.c', address: 'x' }, enlaces: [{ href: '/latin/productos', etiqueta: 'Todos' }] })),
    portada: renderToStaticMarkup(h(Po.PortadaTienda as never, { empresaSlug: 'latin', nombre: 'Latin', logoUrl: null, portada: null })),
  };
  for (const [n, html] of Object.entries(dibujos)) {
    const malos = sinFoco(html);
    ok(`foco visible en todo lo que se pulsa: ${n}`, malos.length === 0 && /<(a|button|summary)\b/.test(html), malos.map((x) => x.slice(0, 70)).join(' | '));
  }
  const fuentesSinDibujar = [`${S}CabeceraTienda.tsx`, `${S}AddToCartClient.tsx`, `${A}mi-cotizacion/CartPageClient.tsx`, `${A}page.tsx`, `${A}productos/page.tsx`, `${A}productos/[slug]/page.tsx`];
  //  Lo que no se puede dibujar sin Next o sin navegador (la cabecera lee la ruta; la cotizacion,
  //  `localStorage`), en la fuente: cada etiqueta lleva el foco o una clase que lo lleva.
  const CLASES_CON_FOCO = /FOCO_TIENDA|className=\{icono\}|clsx\(icono|claseEnlace\(/;
  const sinFocoEnFuente = fuentesSinDibujar.flatMap((f) => {
    const s = sinComentarios(leer(f));
    return ['button', 'Link', 'a', 'summary'].flatMap((n) => etiquetas(s, n)).filter((e) => !CLASES_CON_FOCO.test(e.attrs)).map((e) => `${f.split('/').pop()}: ${e.attrs.slice(0, 50)}`);
  });
  const constConFoco = /const icono = `[^`]*\$\{FOCO_TIENDA\}/.test(cab) && [...cab.matchAll(/claseEnlace=\{\(a\) => clsx\(([^)]*)\)/g)].every((m) => /FOCO_TIENDA/.test(m[1]))
    && [...cab.matchAll(/claseEnlace=\{/g)].length === 2;
  ok('foco visible en la cabecera, la ficha, la cotizacion y el catalogo (en la fuente)', sinFocoEnFuente.length === 0 && constConFoco, sinFocoEnFuente.join(' | '));

  // ---------------------------------------------------------------------------------------------
  console.log('\n4) Contraste e iconos\n');
  const lum = (hex: string) => {
    const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contraste = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  //  Las cuentas que deciden las clases (y por que): slate-400 no llega en blanco; slate-500 llega
  //  en blanco pero NO en el gris de la tienda; slate-600 llega en los dos.
  const c400 = contraste('94a3b8', 'ffffff'), c500g = contraste('64748b', 'f4f4f3'), c500 = contraste('64748b', 'ffffff'), c600g = contraste('475569', 'f4f4f3');
  invariante('las cuentas: slate-400/blanco < 4,5; slate-500/gris < 4,5 <= slate-500/blanco; slate-600/gris >= 4,5',
    c400 < 4.5 && c500g < 4.5 && c500 >= 4.5 && c600g >= 4.5, `${c400.toFixed(2)} ${c500g.toFixed(2)} ${c500.toFixed(2)} ${c600g.toFixed(2)}`);
  const conSlate400 = copias(/text-slate-400|placeholder:text-slate-400/);
  ok('ningun texto de la tienda en slate-400 (2,6:1)', conSlate400.length === 0, conSlate400.join(', '));
  const tarjeta = dibujos.tarjeta;
  ok('en la tarjeta: precio tachado y "+ ITBIS" en slate-500 sobre blanco', /text-slate-500 line-through/.test(tarjeta) && /text-slate-500">\+ ITBIS/.test(tarjeta), tarjeta.slice(0, 0));
  const portadaFuente = sinComentarios(leer(`${A}page.tsx`));
  ok('sobre el gris (#f4f4f3), el texto secundario va en slate-600: categorias de la portada y el marcador',
    /bg-\[#f4f4f3\][\s\S]{0,400}text-sm text-slate-600/.test(portadaFuente) && /tracking-\[0\.25em\] text-slate-600/.test(sinComentarios(leer(`${S}TarjetaProducto.tsx`))));
  const orden = dibujos.orden;
  ok('iconos: solo lucide (el "▾" del orden pasa a ChevronDown)', !/▾/.test(orden) && /<svg[^>]*lucide-chevron-down/.test(orden), orden.slice(0, 0));

  // ---------------------------------------------------------------------------------------------
  console.log('\n5) Un patron por cosa: cabecera y estado vacio\n');
  type MTs = typeof import('../src/components/storefront/TituloDeSeccion');
  type ME = typeof import('../src/components/storefront/EstadoVacio');
  let Ts: MTs | null = null, Ev: ME | null = null;
  try { Ts = await import('../src/components/storefront/TituloDeSeccion'); Ev = await import('../src/components/storefront/EstadoVacio'); } catch { Ts = null; Ev = null; }
  const E5 = ['TituloDeSeccion: <h1> de pagina con su descripcion; <h2> de seccion con su enlace a la derecha',
    'EstadoVacio: titulo, texto y su accion, con un solo relleno'];
  if (!Ts || !Ev) falta(E5, 'no existen TituloDeSeccion / EstadoVacio');
  else {
    const t1 = renderToStaticMarkup(h(Ts.default as never, { titulo: 'Favoritos', descripcion: 'Se guardan aqui' }));
    const t2 = renderToStaticMarkup(h(Ts.default as never, { nivel: 2, titulo: 'Nuestros productos', accion: h('a', { href: '/x' }, 'Ver todos') }));
    ok(E5[0], /<h1 class="text-3xl font-medium uppercase tracking-\[0\.12em\] text-slate-900">Favoritos<\/h1><p class="mt-2 text-sm text-slate-500">Se guardan aqui<\/p>/.test(t1)
      && /justify-between[^>]*>.*<h2[^>]*uppercase[^>]*>Nuestros productos<\/h2>.*<a href="\/x">Ver todos<\/a>/.test(t2) && !/<h2/.test(t1), `${t1} | ${t2}`);
    const v = renderToStaticMarkup(h(Ev.default as never, { titulo: 'Vacia', texto: 'Nada aqui' }, h('a', { href: '/x' }, 'Ver')));
    ok(E5[1], /^<div class="py-16 text-center"><p class="text-lg text-slate-900">Vacia<\/p><p class="mt-2 text-sm text-slate-500">Nada aqui<\/p><div class="mt-8"><a href="\/x">Ver<\/a>/.test(v), v);
  }
  const paginas = [`${A}productos/page.tsx`, `${A}promociones/page.tsx`, `${A}favoritos/page.tsx`, `${A}mi-cotizacion/page.tsx`];
  const conTitulo = paginas.filter((f) => /<TituloDeSeccion\b/.test(leer(f)) && !/<h1\b/.test(sinComentarios(leer(f))));
  ok('catalogo, promociones, favoritos y cotizacion usan la misma cabecera (y ningun <h1> a mano)', conTitulo.length === 4, `${conTitulo.length}/4`);
  const vacios = [`${A}productos/page.tsx`, `${A}promociones/page.tsx`, `${S}ListaDeFavoritos.tsx`, `${A}mi-cotizacion/CartPageClient.tsx`];
  const conVacio = vacios.filter((f) => /<EstadoVacio\b/.test(leer(f)));
  const vaciosAMano = copias(/py-(?:16|20) text-center/);
  ok('los cuatro estados vacios son EstadoVacio, y ninguno queda a mano', conVacio.length === 4 && vaciosAMano.length === 0, `${conVacio.length}/4; a mano: ${vaciosAMano.join(', ')}`);
  const secciones = [`${A}page.tsx`, `${S}ProductRecommendations.tsx`].filter((f) => /<TituloDeSeccion nivel=\{2\}/.test(leer(f)) && !/<h2\b/.test(sinComentarios(leer(f))));
  ok('las secciones de la portada y las recomendaciones, con la misma cabecera de seccion', secciones.length === 2, `${secciones.length}/2`);

  // ---------------------------------------------------------------------------------------------
  console.log('\n6) Lo que no cambia (invariantes)\n');
  const antes = DE_LA_BASE.flatMap((f) => lectura(enCommit(BASE, f)));
  const ahora = [...DE_LA_BASE, ...NUEVOS].flatMap((f) => lectura(leer(f)));
  //  El unico texto cambiado a proposito (ver las comprobaciones de arriba).
  const A_PROPOSITO: [string, string][] = [['texto:Al enviar tu cotización validamos el inventario y el tiempo de entrega.',
    'texto:Tu cotización se guarda en este navegador para imprimirla o guardarla en PDF. El inventario y el tiempo de entrega se confirman al hacer el pedido.']];
  const d0 = diferencia(antes, ahora);
  const d = { faltan: d0.faltan.filter((x) => !A_PROPOSITO.some(([a]) => a === x)), sobran: d0.sobran.filter((x) => !A_PROPOSITO.some(([, b]) => b === x)) };
  invariante(`lo que la tienda dice es lo mismo que en ${BASE}: textos, ejemplos, titulos, avisos y API (${antes.length})`,
    d.faltan.length === 0 && d.sobran.length === 0, `faltan: ${d.faltan.join(' | ')} -- sobran: ${d.sobran.join(' | ')}`);
  //  Lote 282, pedido del coordinador: la ficha decia "Al enviar tu cotización…" y la cotizacion no
  //  se envia desde el lote 233. Ningun texto de la tienda promete enviarla, ni habla de iniciar
  //  sesion o de crear una cuenta (la tienda no tiene cuentas).
  const PROMESAS_FALSAS = /\benvi(?:ar|a|amos|e|o)\b[^|]*cotizaci|cotizaci[^|]*\benviad|inici(?:ar|a|e)\s+sesi|crea(?:r|)\s+(?:una|tu)\s+cuenta|reg[ií]strate/i;
  const promesas = [...DE_LA_BASE, ...NUEVOS].flatMap((f) => lectura(leer(f)).filter((x) => PROMESAS_FALSAS.test(x)).map((x) => `${f.split('/').pop()}: ${x}`));
  ok('ningun texto de la tienda promete ENVIAR la cotizacion, iniciar sesion ni crear una cuenta', promesas.length === 0, promesas.join(' | '));
  ok('  y la ficha dice lo que pasa: se guarda en el navegador para imprimirla o guardarla en PDF',
    lectura(leer(`${S}AddToCartClient.tsx`)).some((x) => /navegador/.test(x) && /imprim/.test(x) && /PDF/.test(x)));

  const etiq = (src: string) => [...src.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
  const etiqAntes = DE_LA_BASE.flatMap((f) => etiq(enCommit(BASE, f)));
  const etiqAhora = [...DE_LA_BASE, ...NUEVOS].flatMap((f) => etiq(leer(f)));
  const perdidas = diferencia(etiqAntes, etiqAhora).faltan;
  invariante('ningun aria-label se pierde (solo se añaden)', perdidas.length === 0, perdidas.join(' | '));
  //  La directiva va arriba, pero puede llevar un comentario delante: se mira sin comentarios (un
  //  mutante que ponia 'use client' tras el comentario de cabecera sobrevivia).
  const cliente = (src: string) => /^\s*['"]use client['"]/.test(sinComentarios(src));
  const cambiados = DE_LA_BASE.filter((f) => cliente(enCommit(BASE, f)) !== cliente(leer(f)));
  invariante('nada pasa de servidor a cliente ni al reves; los componentes nuevos son de servidor',
    //  Solo los nuevos que existen: en la contraprueba no estan, y un invariante vale en los dos estados.
    cambiados.length === 0 && NUEVOS.filter((f) => leer(f)).every((f) => !cliente(leer(f))), cambiados.join(', '));
  invariante('los enlaces del menu que leen la direccion siguen dentro de <Suspense> (lote 231)',
    /<Suspense fallback=\{<Enlaces[\s\S]*?<EnlacesConActivo/.test(cab) && /useSearchParams\(\)/.test(cab));
  const coti = sinComentarios(leer(`${A}mi-cotizacion/CartPageClient.tsx`));
  invariante('al imprimir la cotizacion no salen cabecera, pie ni botones (print:hidden)',
    /<header className="[^"]*print:hidden/.test(cab) && /<footer className="[^"]*print:hidden/.test(sinComentarios(leer(`${S}PieTienda.tsx`)))
    && /mt-6 space-y-3 print:hidden[\s\S]{0,200}window\.print\(\)/.test(coti) && /hidden print:mb-6 print:block/.test(coti));
  const logica = ['cambiarCantidad', 'armarCotizacion', 'leerCarrito', 'guardar(', 'alternar(', 'enlaceDelCatalogo(', 'ordenarProductos(', 'localStorage.setItem'];
  const cuenta = (src: string, x: string) => src.split(x).length - 1;
  const logicaCambia = logica.filter((x) => DE_LA_BASE.reduce((n, f) => n + cuenta(enCommit(BASE, f), x), 0) !== DE_LA_BASE.reduce((n, f) => n + cuenta(leer(f), x), 0));
  invariante('la logica (cotizacion, favoritos, filtros, orden) se llama igual que antes', logicaCambia.length === 0, logicaCambia.join(', '));
}

//  Un banco que se cuelga sale con 0 (lote 236): si no llega al final, es FALLA.
let llego = false;
process.on('beforeExit', () => { if (!llego) { console.log(' FALLA  el banco no llego al final'); process.exit(1); } });
main().then(() => {
  llego = true;
  console.log(`\n${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}).catch((e) => { llego = true; console.error(e); process.exit(2); });
