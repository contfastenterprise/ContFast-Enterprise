/**
 * Lote 261 -- cambiar la tasa del dolar desde Compras y Facturacion, y la linea de compra solo en
 * pesos.
 *
 * Pedido del dueño (2026-10-03): *"cuando se digitan los productos no es necesario que muestre ...
 * la tasa de cambio del dolar, solo debe mostrar en peso dominicano"* y *"debiera darme la opcion de
 * cambiar la tasa desde compra y facturacion para facilitar el cambio de precio"*. Elegido por el:
 * guardar la tasa desde esas pantallas APLICA los precios al momento (en Productos sigue con
 * revision), y la factura cobra el precio del catalogo.
 *
 * QUE SE COMPRUEBA
 *  1. Las reglas puras (`services/precios/cambioDeTasa.ts`), EJECUTADAS: el aviso, las lineas de
 *     compra y de factura que se ponen al dia con la tasa nueva y las que se dejan.
 *  2. El control, DIBUJADO: no sale si la empresa no usa dolares; quien no administra ve la tasa
 *     sin el boton; la fecha cuando la tasa no es de hoy.
 *  3. El cableado: el hook pide guardar Y aplicar; Compras y Facturacion pintan el control y ponen
 *     al dia sus lineas; en Facturacion el control va FUERA del `<form>` de la factura; y el
 *     servidor aplica en una transaccion con el mismo calculo que Productos.
 * Lo que el servidor hace de verdad lo ejecuta `verificar_tasa_desde_compras_db.ts`.
 *
 * Se ejecuta con: npx tsx scratch/verificar_tasa_desde_compras.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => {
  const p = resolve(raiz, r);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};
const sinComentarios = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let rotas = 0;
let comprobadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  comprobadas++;
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
const falta = (ts: string[], motivo: string) => { for (const t of ts) ok(t, false, motivo); };
/** El import del modulo, anclado al especificador con sus comillas (no por mera presencia del nombre). */
const importa = (src: string, nombre: string, desde: string) =>
  new RegExp(`import \\{[^}]*\\b${nombre}\\b[^}]*\\} from '${desde.replace(/[/.]/g, '\\$&')}'`).test(src);

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const compras = sinComentarios(leer('src/app/dashboard/purchases/page.tsx'));
  const facturas = sinComentarios(leer('src/app/dashboard/invoices/page.tsx'));
  //  Valen en los dos estados.
  if (!/const applyProductToLine = /.test(compras)) throw new Error('Precondicion: la pantalla de compras no es la de siempre');
  if (!/<h2[^>]*>Nueva Factura e-CF<\/h2>/.test(facturas)) throw new Error('Precondicion: la factura no tiene su cabecera');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) Las reglas, ejecutadas\n');
  // ───────────────────────────────────────────────────────────────────────────
  const E1 = [
    'el aviso dice la tasa y cuantos precios cambiaron (1, varios, ninguno, sin productos en dolares)',
    'compra: la linea con el costo de la tasa ANTERIOR pasa a la nueva, con su ITBIS y total',
    '  la que se cambio a mano (factura del suplidor) se deja',
    '  sin ITBIS, el ITBIS queda en 0',
    '  la de un producto que no sigue al dolar, o sin tasa anterior, no se toca',
    '  y dice cuantas cambio',
    'factura: el precio de cada nivel, como lo pone la pantalla (con el base si el nivel esta en 0)',
    '  la linea con el precio del catalogo ANTERIOR pasa al nuevo; la cambiada a mano se deja',
  ];
  let R: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/services/precios/cambioDeTasa.ts'))) R = await import('../src/services/precios/cambioDeTasa');
  if (!R) falta(E1, 'no existe services/precios/cambioDeTasa.ts');
  else {
    const r = R;
    intenta(E1[0], () =>
      r.mensajeDelCambio(63.5, { aplicados: 1, atados: 3 }).includes('RD$ 63.50') && r.mensajeDelCambio(63.5, { aplicados: 1, atados: 3 }).includes('1 producto cambió de precio')
      && r.mensajeDelCambio(60, { aplicados: 12, atados: 20 }).includes('12 productos cambiaron de precio')
      && r.mensajeDelCambio(60, { aplicados: 0, atados: 3 }).includes('Ningún precio cambió')
      && r.mensajeDelCambio(60, { aplicados: 0, atados: 0 }).includes('No hay productos en dólares'));

    const usd = new Map([['P1', 45], ['P2', 2]]);
    const linea = (productId: string, quantity: number, unitCost: number) =>
      ({ id: productId, productId, quantity, unitCost, subtotal: quantity * unitCost, itbis: 0, total: 0 });
    //  45 x 60 = 2.700 (puesta por el sistema); 2 x 60 = 120 pero se escribio 118 a mano.
    const lineas = [linea('P1', 2, 2700), linea('P2', 1, 118), linea('PX', 1, 50), linea('', 1, 0)];
    const c = r.lineasDeCompraConTasa(lineas, usd, 60, 63.5, false);
    intenta(E1[1], () => c.lineas[0].unitCost === 2857.5 && c.lineas[0].subtotal === 5715 && c.lineas[0].itbis === 1028.7 && c.lineas[0].total === 6743.7);
    intenta(E1[2], () => c.lineas[1] === lineas[1]);
    intenta(E1[3], () => r.lineasDeCompraConTasa(lineas, usd, 60, 63.5, true).lineas[0].itbis === 0
      && r.lineasDeCompraConTasa(lineas, usd, 60, 63.5, true).lineas[0].total === 5715);
    intenta(E1[4], () => c.lineas[2] === lineas[2] && c.lineas[3] === lineas[3]
      && r.lineasDeCompraConTasa(lineas, usd, null, 63.5, false).cambiadas === 0);
    intenta(E1[5], () => c.cambiadas === 1 && r.lineasDeCompraConTasa(lineas, usd, 63.5, 63.5, false).cambiadas === 0);

    const prod = { price: 100, priceConsumidor: 90, priceProveedor: 0, priceMayorista: '80.50' };
    intenta(E1[6], () => r.precioDeNivel(prod, 'base') === 100 && r.precioDeNivel(prod, 'consumidor') === 90
      && r.precioDeNivel(prod, undefined) === 90 && r.precioDeNivel(prod, 'proveedor') === 100 && r.precioDeNivel(prod, 'mayorista') === 80.5);
    const antes = new Map([['A', { price: 100, priceConsumidor: 90 }], ['B', { price: 50, priceConsumidor: 45 }]]);
    const despues = new Map([['A', { price: 110, priceConsumidor: 99 }], ['B', { price: 55, priceConsumidor: 49.5 }]]);
    const f = r.lineasDeFacturaConPrecios(
      [{ productId: 'A', priceTier: 'consumidor', unitPrice: 90 }, { productId: 'B', priceTier: 'consumidor', unitPrice: 40 }, { productId: '', unitPrice: 0 }],
      antes, despues);
    intenta(E1[7], () => f.lineas[0].unitPrice === 99 && f.lineas[1].unitPrice === 40 && f.lineas[2].unitPrice === 0 && f.cambiadas === 1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El control, dibujado\n');
  // ───────────────────────────────────────────────────────────────────────────
  const E2 = [
    'si la empresa no usa precios en dolares, no sale nada',
    'quien administra ve la tasa en pesos y "Cambiar tasa"',
    'quien no administra ve la tasa, sin el boton',
    'si la tasa no es de hoy, dice de que dia es',
  ];
  let C: AnyRec | null = null;
  if (existsSync(resolve(raiz, 'src/components/precios/TasaDelDolarEnLinea.tsx'))) C = await import('../src/components/precios/TasaDelDolarEnLinea');
  if (!C) falta(E2, 'no existe components/precios/TasaDelDolarEnLinea.tsx');
  else {
    const dibuja = (t: AnyRec) => renderToStaticMarkup(createElement(C!.TasaDelDolarEnLinea, { t: { ocupado: false, cambiar: async () => true, ...t } }));
    const hoy = '2026-10-03';
    intenta(E2[0], () => dibuja({ enUso: false, tasa: null, hoy, puedeCambiar: true }) === '');
    const admin = dibuja({ enUso: true, tasa: { fecha: hoy, tasa: 63.5 }, hoy, puedeCambiar: true });
    intenta(E2[1], () => admin.includes('RD$ 63.50') && admin.includes('>Cambiar tasa</button>') && !admin.includes('(del '));
    const otro = dibuja({ enUso: true, tasa: { fecha: hoy, tasa: 63.5 }, hoy, puedeCambiar: false });
    intenta(E2[2], () => otro.includes('RD$ 63.50') && !otro.includes('Cambiar tasa'));
    intenta(E2[3], () => dibuja({ enUso: true, tasa: { fecha: '2026-10-01', tasa: 62 }, hoy, puedeCambiar: false }).includes('(del 01-10-2026)'));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) El cableado\n');
  // ───────────────────────────────────────────────────────────────────────────
  const hook = sinComentarios(leer('src/hooks/useTasaDelDolar.ts'));
  ok('el hook pide guardar la tasa Y aplicar los precios, en una peticion',
    /fetch\(`\$\{DIRECCION\}\/tasa`, \{\s*method: 'PUT'/.test(hook) && /JSON\.stringify\(\{ tasa: leidaTasa\.valor, aplicar: true \}\)/.test(hook));
  ok('  mira el estado antes del cuerpo, y dos clics no mandan dos peticiones',
    /leerRespuesta<[^>]+>\(await fetch\(`\$\{DIRECCION\}\/tasa`/.test(hook) && /if \(enCurso\.current\) return false;/.test(hook));
  ok('  quien puede cambiarla lo dice el servidor (puedeAplicar), no la pantalla',
    /setPuedeCambiar\(!!d\.puedeAplicar\)/.test(hook));

  ok('Compras: pinta el control junto a sus lineas',
    importa(compras, 'TasaDelDolarEnLinea', '@/components/precios/TasaDelDolarEnLinea') && /<TasaDelDolarEnLinea t=\{tasaDelDolar\} \/>/.test(compras));
  ok('  y con la tasa nueva pone al dia sus lineas (respetando "sin ITBIS")',
    importa(compras, 'lineasDeCompraConTasa', '@/services/precios/cambioDeTasa')
    && /lineasDeCompraConTasa\(lines, c\.costosUsd, c\.anterior, c\.nueva, noItbis\)/.test(compras));

  const iCabecera = facturas.search(/<h2[^>]*>Nueva Factura e-CF<\/h2>/);
  const iControl = facturas.indexOf('<TasaDelDolarEnLinea t={tasaDelDolar} />');
  const iForm = facturas.indexOf('<form onSubmit={(e) => handleSubmitTrigger(e)}');
  ok('Facturacion: pinta el control en la cabecera, FUERA del <form> de la factura',
    importa(facturas, 'TasaDelDolarEnLinea', '@/components/precios/TasaDelDolarEnLinea')
    && iControl > iCabecera && iForm > iControl, `cabecera=${iCabecera} control=${iControl} form=${iForm}`);
  ok('  relee el catalogo y pone al dia sus lineas',
    importa(facturas, 'useTasaDelDolar', '@/hooks/useTasaDelDolar')
    && /const tasaDelDolar = useTasaDelDolar\(async \(\) => \{[\s\S]{0,200}fetch\('\/api\/v1\/products\?per_page=100'\)/.test(facturas)
    && /lineasDeFacturaConPrecios\(\s*lines,/.test(facturas) && /setDbProducts\(nuevos\)/.test(facturas));
  invariante('la factura sigue cobrando el precio del catalogo (no dolares x tasa)',
    /updated\[idx\]\.unitPrice = parseFloat\(product\.priceConsumidor\) \|\| parseFloat\(product\.price\) \|\| 0;/.test(facturas)
    && !/costoParaCompra|costoUsd/.test(facturas));

  const ruta = sinComentarios(leer('src/app/api/v1/products/dolar/tasa/route.ts'));
  ok('la ruta aplica solo con `aplicar: true`, y limpia la cache del catalogo',
    /if \(cuerpo\?\.aplicar === true\) \{[\s\S]{0,300}guardarTasaYAplicar\([\s\S]{0,200}clearCachePattern\(/.test(ruta));
  const repo = sinComentarios(leer('src/services/precios/preciosEnDolaresRepositorio.ts'));
  const guardarYAplicar = repo.slice(Math.max(0, repo.indexOf('guardarTasaYAplicar:')), repo.indexOf('async function aplicarFilas'));
  ok('el servidor guarda y aplica en UNA transaccion, bloqueando los productos',
    /guardarTasaYAplicar: [\s\S]*?db\.transaction\(async \(tx\) => \{[\s\S]*?tx\s*\.insert\(tasasDeCambio\)[\s\S]*?\.for\('update'\)[\s\S]*?aplicarFilas\(tx,/.test(guardarYAplicar));
  ok('  con el MISMO calculo y registro que la confirmacion de Productos (una sola copia)',
    (repo.match(/aplicarFilas\(tx, /g) ?? []).length === 2 && (repo.match(/\.insert\(cambiosDePrecio\)/g) ?? []).length === 1);

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`} (${comprobadas} comprobaciones)\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
