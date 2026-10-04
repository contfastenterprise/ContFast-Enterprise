/**
 * Lote 266 -- al reabrir un borrador, el aviso de los precios que cambiaron, y cada linea con SU nivel.
 *
 * Pedido del dueño (2026-10-03): *"si hay una factura en borrador y los precios de los productos se
 * actualizaron, al reabrir el borrador ... debe tener la opcion de actualizar los precios"*. Eligio:
 * aviso con boton, y guardar el nivel de cada linea (antes todas volvian como "consumidor").
 *
 * Codigo: las reglas (`services/invoice/preciosDelBorrador.ts`) EJECUTADAS, el aviso DIBUJADO, y el
 * cableado. Lo que guarda y lee la base lo ejecuta `verificar_precios_del_borrador_db.ts`.
 *
 * Se ejecuta con: npx tsx scratch/verificar_precios_del_borrador.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => { const p = resolve(raiz, r); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => { comprobadas++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const pagina = sinComentarios(leer('src/app/dashboard/invoices/page.tsx'));
  const borrador = sinComentarios(leer('src/app/api/v1/invoices/draft/route.ts'));
  const lectura = sinComentarios(leer('src/app/api/v1/invoices/[id]/route.ts'));
  const esquema = leer('src/db/schema/invoices.ts');
  if (!/const handleLoadDraft = async/.test(pagina) || !borrador || !lectura || !esquema) throw new Error('Precondicion: faltan las piezas del borrador');

  console.log('\n1) Las reglas, ejecutadas\n');
  const E1 = [
    'el nivel de un borrador viejo se deduce del precio que coincide hoy (mayorista)',
    '  y sin coincidencia, consumidor (lo de antes)',
    'una linea cuyo precio de su nivel cambio sale en el aviso, con lo guardado y lo actual',
    '  la que sigue al precio de hoy, o sin producto, no sale',
    'actualizar pone el precio actual solo en las lineas que siguen con el guardado',
    'solo los cuatro niveles son niveles',
  ];
  let R: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/services/invoice/preciosDelBorrador.ts'))) R = await import('../src/services/invoice/preciosDelBorrador');
  if (!R) falta(E1, 'no existe services/invoice/preciosDelBorrador.ts');
  else {
    const r = R;
    const puerta = { price: 133.33, priceConsumidor: 125, priceMayorista: 117.65, priceProveedor: 111.11 };
    intenta(E1[0], () => r.nivelDeducido(117.65, puerta) === 'mayorista' && r.nivelDeducido(133.33, puerta) === 'base');
    intenta(E1[1], () => r.nivelDeducido(99, puerta) === 'consumidor' && r.nivelDeducido(117.65, undefined) === 'consumidor');
    const catalogo = new Map([['P', puerta], ['Q', { price: 50, priceConsumidor: 45 }]]);
    const lineas = [
      { productId: 'P', productName: 'Puerta', priceTier: 'mayorista', unitPrice: 110 },
      { productId: 'Q', productName: 'Dintel', priceTier: 'consumidor', unitPrice: 45 },
      { productId: '', productName: '', priceTier: 'consumidor', unitPrice: 0 },
    ];
    const viejos = r.preciosViejos(lineas, catalogo);
    intenta(E1[2], () => viejos.length === 1 && viejos[0].indice === 0 && viejos[0].nivel === 'mayorista' && viejos[0].guardado === 110 && viejos[0].actual === 117.65);
    intenta(E1[3], () => !viejos.some((v: AnyRec) => v.indice !== 0));
    intenta(E1[4], () => {
      const puestas = r.conPreciosActuales(lineas, viejos);
      const tocada = r.conPreciosActuales([{ ...lineas[0], unitPrice: 112 }, lineas[1]], viejos);
      return puestas[0].unitPrice === 117.65 && puestas[1] === lineas[1] && tocada[0].unitPrice === 112;
    });
    intenta(E1[5], () => ['base', 'consumidor', 'mayorista', 'proveedor'].every((n) => r.esNivelDePrecio(n)) && !r.esNivelDePrecio('otro') && !r.esNivelDePrecio(undefined));
  }

  console.log('\n2) El aviso, dibujado\n');
  const E2 = ['sin precios viejos no sale nada', 'dice cuantos cambiaron, cada uno con su nivel, lo guardado tachado y lo actual', '  con los dos botones'];
  let C: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/app/dashboard/invoices/components/AvisoPreciosDelBorrador.tsx'))) C = await import('../src/app/dashboard/invoices/components/AvisoPreciosDelBorrador');
  if (!C) falta(E2, 'no existe el componente del aviso');
  else {
    const dibuja = (viejos: AnyRec[]) => renderToStaticMarkup(createElement(C!.AvisoPreciosDelBorrador, { viejos, alActualizar: () => undefined, alDejar: () => undefined }));
    intenta(E2[0], () => dibuja([]) === '');
    const html = dibuja([{ indice: 0, nombre: 'Puerta', nivel: 'mayorista', guardado: 110, actual: 117.65 }]);
    intenta(E2[1], () => html.includes('El precio de 1 producto cambió') && html.includes('Puerta (mayorista)') && /line-through[^>]*>RD\$ 110\.00</.test(html) && html.includes('RD$ 117.65'));
    intenta(E2[2], () => />Actualizar precios<\/button>/.test(html) && />Dejar los del borrador<\/button>/.test(html));
  }

  console.log('\n3) El cableado\n');
  ok('el borrador se guarda con el nivel de cada linea',
    /priceTier: esNivelDePrecio\(l\.priceTier\) \? l\.priceTier : undefined/.test(pagina)
    && /priceTier: z\.enum\(\['base', 'consumidor', 'mayorista', 'proveedor'\]\)\.optional\(\)/.test(borrador)
    && /\.returning\(\{ id: invoiceLines\.id \}\)/.test(borrador)
    && /guardarNivelesDeLineas\(tx, insertadas\.map\(\(f, i\) => \(\{ id: f\.id, nivel: data\.lines\[i\]\?\.priceTier \}\)\)\)/.test(borrador));
  ok('  y se lee al reabrirlo (solo en borradores)',
    /invoice\.status === 'draft' \? await nivelesDeLineas\(id\) : new Map\(\)/.test(lectura) && /priceTier: niveles\.get\(l\.id\) \?\? null/.test(lectura));
  ok('al reabrir, cada linea con SU nivel (o deducido), ya no "consumidor" para todas',
    /priceTier: esNivelDePrecio\(l\.priceTier\) \? l\.priceTier : nivelDeducido\(unitPrice, porId\.get\(l\.productId\)\)/.test(pagina)
    && !/priceTier: 'consumidor',\s*warehouseId: l\.warehouseId \|\| draft\.warehouseId/.test(pagina));
  ok('  se calculan los precios viejos contra el catalogo de ahora, y se ensena el aviso',
    /setPreciosDelBorrador\(preciosViejos\(mappedLines, porId\)\)/.test(pagina)
    && /<AvisoPreciosDelBorrador\s+viejos=\{preciosDelBorrador\}/.test(pagina)
    && /setLines\(conPreciosActuales\(lines, preciosDelBorrador\)\)/.test(pagina));
  ok('  y una factura nueva no arrastra el aviso del borrador anterior', /setEditingDraftId\(null\);\s*setPreciosDelBorrador\(\[\]\);/.test(pagina));
  invariante('la columna nueva NO se declara en el esquema de Drizzle (romperia los select de la fila entera)', !/price_tier/.test(esquema));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`} (${comprobadas} comprobaciones)\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
