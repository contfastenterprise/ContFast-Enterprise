/**
 * Lote 285 -- cuatro pantallas que decian algo distinto de lo que hacen. Los encontro el agente del
 * manual de usuario (lote 283) al describirlas.
 *
 *   1. Clientes, "Tipo de Precio": "Precio 1 (Base +25%)" -- el RECARGO de antes del lote 265. Ahora
 *      el rotulo sale de `MARGENES_SOBRE_VENTA` (`rotuloDelNivel`).
 *   2. Productos, tarjeta "Stock Bajo": un `0` escrito a mano. Ahora cuenta, con la regla de reorden
 *      (`estaBajoElMinimo`, `contarProductosConStockBajo`) y una ruta acotada por empresa y modo.
 *   3. Caja, historico: "EXPORTAR XLS" bajaba un .csv (lote 281). Dice "EXPORTAR CSV".
 *   4. Central e-CF: el 46 y el 47 cruzados en dos desplegables escritos a mano. Ahora salen del
 *      catalogo (`ecf/opcionesDeTipo.ts`).
 *
 * Las reglas se EJECUTAN; el historico se DIBUJA. Lo que ya era cierto antes del lote (el catalogo
 * del 46/47, la regla de reorden, que el historico baja un CSV) va como INVARIANTE (codigo 3).
 *
 * Contraprueba contra 696854e: 100 % FALLA.
 *
 * Se ejecuta con: npx tsx scratch/verificar_desfases_del_manual.ts
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => (existsSync(resolve(raiz, r)) ? readFileSync(resolve(raiz, r), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');
const BASE = '696854e';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const intenta = (t: string, f: () => boolean | [boolean, string]) => {
  try { const r = f(); if (Array.isArray(r)) ok(t, r[0], r[1]); else ok(t, r); }
  catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
};
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;
const cargar = async (ruta: string): Promise<AnyRec | null> => {
  if (!existsSync(resolve(raiz, ruta))) return null;
  try {
    const m = (await import(pathToFileURL(resolve(raiz, ruta)).href)) as AnyRec;
    return m.default && typeof m.default === 'object' && Object.keys(m).length <= 2 ? { ...m.default, ...m } : m;
  } catch (e) { console.log(`        (no carga ${ruta}: ${(e as Error).message.split('\n')[0]})`); return null; }
};
/** El identificador entero, no un prefijo (`documentServiceX` contiene `documentService`). */
const nombra = (src: string, id: string) => new RegExp(`\\b${id}\\b`).test(src);

function ficheros(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) ficheros(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

async function main() {
  // Precondiciones: valen en los dos estados.
  let base = '';
  try { base = execSync(`git show ${BASE}:src/app/dashboard/customers/page.tsx`, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 24 }); } catch { base = ''; }
  if (!base.includes('Tipo de Precio')) throw new Error(`Precondicion: no se pudo leer la pantalla de clientes de ${BASE}`);
  if (!leer('src/app/dashboard/products/page.tsx').includes('Stock Bajo')) throw new Error('Precondicion: no esta la tarjeta Stock Bajo');

  const [React, { renderToStaticMarkup }] = await Promise.all([import('react'), import('react-dom/server')]);

  // ─── 1. Clientes ───────────────────────────────────────────────────────────
  console.log('\n1) Clientes: el tipo de precio dice el margen sobre la venta\n');
  const M = await cargar('src/services/precios/margen.ts');
  const MARGENES = M?.MARGENES_SOBRE_VENTA as Record<string, number> | undefined;
  invariante('los margenes de fabrica son 25/20/15/10 sobre la venta (lote 265)',
    !!MARGENES && MARGENES.price === 0.25 && MARGENES.priceConsumidor === 0.2 && MARGENES.priceMayorista === 0.15 && MARGENES.priceProveedor === 0.1);
  const niveles = (M?.NIVELES_DE_PRECIO ?? null) as AnyRec[] | null;
  intenta('los cuatro niveles, con el valor que guarda el cliente y su columna de precio', () => !!niveles
    && JSON.stringify(niveles.map((n) => [n.numero, n.valor, n.clave])) === JSON.stringify([
      [1, 'base', 'price'], [2, 'consumidor', 'priceConsumidor'], [3, 'mayorista', 'priceMayorista'], [4, 'proveedor', 'priceProveedor']]));
  intenta('el rotulo dice "margen N % sobre la venta", con N sacado de MARGENES_SOBRE_VENTA', () => {
    if (!niveles || !MARGENES) return false;
    const r = niveles.map((n) => M!.rotuloDelNivel(n) as string);
    const esperado = niveles.map((n) => `Precio ${n.numero} (${n.nombre}, margen ${Math.round(MARGENES[n.clave] * 100)} % sobre la venta)`);
    return [JSON.stringify(r) === JSON.stringify(esperado) && r[0] === 'Precio 1 (Base, margen 25 % sobre la venta)', r.join(' | ')];
  });
  intenta('  y se DERIVA: si cambia el margen, cambia el rotulo (30 %, 12,5 %)', () => {
    if (!niveles || !MARGENES) return false;
    const antes = MARGENES.price;
    try {
      MARGENES.price = 0.3; const a = M!.rotuloDelNivel(niveles[0]) as string;
      MARGENES.price = 0.125; const b = M!.rotuloDelNivel(niveles[0]) as string;
      return [a.includes('margen 30 %') && b.includes('margen 12,5 %'), `${a} | ${b}`];
    } finally { MARGENES.price = antes; }
  });
  const cli = sinComentarios(leer('src/app/dashboard/customers/page.tsx'));
  ok('la pantalla de clientes pinta las opciones desde NIVELES_DE_PRECIO con rotuloDelNivel',
    /import \{[^}]*\bNIVELES_DE_PRECIO\b[^}]*\brotuloDelNivel\b[^}]*\} from '@\/services\/precios\/margen'/.test(cli)
    && /\{NIVELES_DE_PRECIO\.map\(\(n\) => \(\s*<option key=\{n\.valor\} value=\{n\.valor\}>\{rotuloDelNivel\(n\)\}<\/option>/.test(cli));
  {
    //  Sin comentarios: el de `margen.ts` cuenta, a proposito, como decia antes.
    const viejos = ficheros(resolve(raiz, 'src')).filter((f) => /\(\s*[A-Za-zÁ-ú ]*\+\d+\s*%\s*\)/.test(sinComentarios(readFileSync(f, 'utf8'))));
    ok('ningun rotulo de RECARGO ("Base +25%") en src', viejos.length === 0, viejos.map((f) => f.slice(raiz.length + 1)).join(', '));
  }
  {
    // Dibujado: el desplegable, como lo pinta la pantalla.
    const html = niveles ? renderToStaticMarkup(React.createElement('select', null,
      niveles.map((n) => React.createElement('option', { key: n.valor, value: n.valor }, M!.rotuloDelNivel(n))))) : '';
    ok('dibujado: el desplegable ofrece Precio 1 a 4 con su margen y sin "+"',
      /<option value="proveedor">Precio 4 \(Proveedor, margen 10 % sobre la venta\)<\/option>/.test(html) && !html.includes('+'));
  }
  const api = sinComentarios(leer('src/app/api/v1/customers/route.ts'));
  invariante('la API de clientes sigue aceptando los cuatro valores (no cambia lo que se guarda)',
    /priceType: z\.enum\(\['base', 'consumidor', 'proveedor', 'mayorista'\]\)/.test(api));

  // ─── 2. Stock bajo ─────────────────────────────────────────────────────────
  console.log('\n2) Productos: la tarjeta "Stock Bajo" cuenta\n');
  const E = await cargar('src/services/inventario/existencia.ts');
  const bajo = E?.estaBajoElMinimo as ((n: unknown) => boolean) | undefined;
  const contar = E?.contarProductosConStockBajo as ((n: unknown[]) => number) | undefined;
  intenta('la regla: en su minimo o por debajo es bajo; por encima no; minimo 0 no se vigila', () => {
    if (!bajo) return [false, 'no existe estaBajoElMinimo'];
    const casos: Array<[unknown, boolean]> = [
      [{ quantity: 5, minStock: 5 }, true],
      [{ quantity: 4, minStock: 5 }, true],
      [{ quantity: 0, minStock: 5 }, true],
      [{ quantity: 6, minStock: 5 }, false],
      [{ quantity: 0, minStock: 0 }, false],
      [{ quantity: -3, minStock: 0 }, false],
      [{ quantity: '3.0000', minStock: '5.0000' }, true],
      [{ quantity: '5.0001', minStock: '5.0000' }, false],
      [{ quantity: 4.9999999, minStock: 5 }, true],
      [null, false],
    ];
    const mal = casos.filter(([n, e]) => bajo(n) !== e);
    return [mal.length === 0, mal.map(([n]) => JSON.stringify(n)).join(' ')];
  });
  intenta('  la misma que reorden (minStock > 0 y cantidad <= minimo): 0 discrepancias en 441 casos', () => {
    if (!bajo) return false;
    let d = 0;
    for (let q = -5; q <= 15; q++) for (let m = 0; m <= 20; m++) {
      if (bajo({ quantity: String(q), minStock: String(m) }) !== (m > 0 && q <= m)) d++;
    }
    return [d === 0, `${d} discrepancias`];
  });
  intenta('cuenta PRODUCTOS: uno bajo en dos almacenes es uno, y los de servicio no cuentan', () => {
    if (!contar) return [false, 'no existe contarProductosConStockBajo'];
    const n = contar([
      { productId: 'a', quantity: 1, minStock: 5 }, { productId: 'a', quantity: 0, minStock: 2 },
      { productId: 'b', quantity: 9, minStock: 5 },
      { productId: 'c', quantity: 0, minStock: 0 },
      { productId: 'd', quantity: 1, minStock: 3, tracksInventory: false },
      { productId: 'e', quantity: '2.0000', minStock: '2.0000', tracksInventory: true },
    ]);
    return [n === 2 && contar([]) === 0, `${n}`];
  });
  const ruta = sinComentarios(leer('src/app/api/v1/products/stock-bajo/route.ts'));
  ok('la ruta del conteo usa la regla (importada y llamada) y no la reescribe',
    /import \{ contarProductosConStockBajo \} from '@\/services\/inventario\/existencia';/.test(ruta)
    && /contarProductosConStockBajo\(niveles\)/.test(ruta) && !/<=/.test(ruta));
  ok('  acotada por empresa Y modo, sin borrados ni servicios, con permiso de catalogo',
    /eq\(inventoryLevels\.companyId, auth\.companyId\)/.test(ruta) && /eq\(inventoryLevels\.modo, auth\.modo\)/.test(ruta)
    && /eq\(products\.companyId, auth\.companyId\)/.test(ruta) && /isNull\(products\.deletedAt\)/.test(ruta)
    && /eq\(products\.tracksInventory, true\)/.test(ruta)
    && /enforcePermission\(auth\.userId, auth\.role, auth\.roleId, auth\.companyId, 'catalogo', 'read'\)/.test(ruta));
  const prod = sinComentarios(leer('src/app/dashboard/products/page.tsx'));
  const tarjeta = (() => { const i = prod.indexOf('>Stock Bajo</p>'); return i < 0 ? '' : prod.slice(i, prod.indexOf('</div>', i)); })();
  ok('la tarjeta pinta lo contado, no un 0 fijo ("—" si no se sabe)',
    /\{stockBajo \?\? '—'\}/.test(tarjeta) && !/>\s*0\s*<\/p>/.test(tarjeta), tarjeta.replace(/\s+/g, ' ').slice(0, 160));
  ok('  y lo pide a la ruta mirando el estado (leerRespuesta), al entrar y tras cambiar existencias o minimos',
    /import \{ leerRespuesta \} from '@\/utils\/leerRespuesta';/.test(prod)
    && /leerRespuesta<[^>]*>\(await fetch\('\/api\/v1\/products\/stock-bajo'\)\)/.test(prod)
    && (prod.match(/\bfetchStockBajo\(\);/g) ?? []).length >= 4);
  const reorden = sinComentarios(leer('src/app/api/v1/inventory/reorder-suggestions/route.ts'));
  invariante('reorden sigue con la misma regla (minimo > 0 y cantidad <= minimo)',
    /gt\(sql`CAST\(\$\{inventoryLevels\.minStock\} AS numeric\)`, 0\)/.test(reorden)
    && /CAST\(\$\{inventoryLevels\.quantity\} AS numeric\) <= CAST\(\$\{inventoryLevels\.minStock\} AS numeric\)/.test(reorden));

  // ─── 3. Caja ───────────────────────────────────────────────────────────────
  console.log('\n3) Caja: el boton del historico dice lo que baja\n');
  const hist = sinComentarios(leer('src/app/dashboard/cash/hooks/useHistorialCaja.ts'));
  const X = await cargar('src/app/dashboard/cash/exportarCaja.ts');
  invariante('el historico baja un .csv (lote 281): descargarCsv con nombreDelCsv, que acaba en .csv',
    /descargarCsv\(nombreDelCsv\(/.test(hist) && /\.csv$/.test(String(X?.nombreDelCsv?.('historico caja', '2026-10-04'))));
  const VH = (await cargar('src/app/dashboard/cash/components/VistaHistorico.tsx'))?.VistaHistorico as ((p: unknown) => unknown) | undefined;
  if (!VH) ok('dibujado: el boton dice "EXPORTAR CSV" y nada dice XLS', false, 'no carga VistaHistorico');
  else {
    const nada = () => {};
    const html = renderToStaticMarkup(React.createElement(VH as never, { h: {
      history: [], histStatus: '', histDateFrom: '', aprobando: null, errorCarga: null,
      aprobarDiferencia: nada, handleExportHistory: nada, loadHistory: nada, setHistDateFrom: nada, setHistStatus: nada,
      setSelectedSession: nada, setShowViewModal: nada } }));
    ok('dibujado: el boton dice "EXPORTAR CSV" y nada dice XLS', /EXPORTAR CSV/.test(html) && !/XLS/i.test(html));
  }

  // ─── 4. Central e-CF ───────────────────────────────────────────────────────
  console.log('\n4) Central e-CF: el 46 es Exportaciones y el 47 Pagos al Exterior\n');
  const T = await cargar('src/services/dgii/tiposComprobante.ts');
  const nombre = (c: string) => T!.nombreTipo(c) as string;
  invariante('el catalogo: 46 Exportaciones, 47 Pagos al Exterior, y el 47 no se emite',
    /Exportaciones/.test(nombre('46')) && /Pagos al Exterior/.test(nombre('47')) && T!.esEmitible('47') === false && T!.esEmitible('46') === true);
  const O = await cargar('src/app/dashboard/ecf/opcionesDeTipo.ts');
  intenta('crear secuencia (electronica): los mismos diez tipos, cada uno con el nombre del catalogo', () => {
    if (!O) return [false, 'no existe opcionesDeTipo.ts'];
    const ops = O.opcionesDeSecuencia(true) as AnyRec[];
    return [JSON.stringify(ops.map((o) => o.valor)) === JSON.stringify(['31', '32', '33', '34', '41', '43', '44', '45', '46', '47'])
      && ops.every((o) => o.rotulo === `E${o.valor} — ${nombre(o.valor)}`)
      && /Exportaciones/.test(ops[8].rotulo) && /Pagos al Exterior/.test(ops[9].rotulo), ops.slice(8).map((o) => o.rotulo).join(' | ')];
  });
  intenta('crear secuencia (serie B): los diez de antes, en orden, con B16 Exportacion y B17 Pagos al Exterior', () => {
    if (!O) return false;
    const ops = O.opcionesDeSecuencia(false) as AnyRec[];
    return JSON.stringify(ops.map((o) => o.valor)) === JSON.stringify(['01', '02', '03', '04', '11', '13', '14', '15', '16', '17'])
      && ops[8].rotulo === 'B16 — Comprobante de Exportación' && ops[9].rotulo === 'B17 — Comprobante para Pagos al Exterior';
  });
  intenta('el filtro de la lista: lo que ofrecia (emitibles + 47), sin el 46 repetido y con su nombre', () => {
    if (!O) return false;
    const ops = O.opcionesDelFiltro() as AnyRec[];
    const valores = ops.map((o) => o.valor);
    const antes = [...(T!.CODIGOS_EMITIBLES as string[]), '47'];
    return [JSON.stringify(valores) === JSON.stringify(antes) && new Set(valores).size === valores.length
      && ops.find((o) => o.valor === '46')?.rotulo === 'e-46 Exportaciones'
      && ops.find((o) => o.valor === '47')?.rotulo === 'e-47 Pagos al Exterior', ops.map((o) => o.rotulo).join(' | ')];
  });
  const ecf = sinComentarios(leer('src/app/dashboard/ecf/page.tsx'));
  ok('la pagina de e-CF pinta las opciones de opcionesDeTipo y no escribe ningun tipo 4x a mano',
    /import \{[^}]*\bopcionesDeSecuencia\b[^}]*\bopcionesDelFiltro\b[^}]*\} from '\.\/opcionesDeTipo';/.test(ecf)
    && /opcionesDeSecuencia\(isElectronic\)\.map\(/.test(ecf) && /opcionesDelFiltro\(\)\.map\(/.test(ecf)
    && !/<option value="(4\d|1[67])"/.test(ecf) && !/Pagos al Exterior|Exportaci/.test(ecf));
  {
    // Barrido: ninguna otra copia que ponga el 46 con "Pagos al Exterior" o el 47 con "Exportacion"
    // (ni el 16 / 17 al reves). El catalogo y las opciones son los dos sitios donde viven.
    const cruzadas: string[] = [];
    for (const f of ficheros(resolve(raiz, 'src'))) {
      const rel = f.slice(raiz.length + 1).replace(/\\/g, '/');
      if (rel.endsWith('services/dgii/tiposComprobante.ts')) continue;
      //  Sin comentarios: los que cuentan el cruce de antes lo nombran a proposito.
      sinComentarios(readFileSync(f, 'utf8')).split(/\r?\n/).forEach((l, i) => {
        if (/\b(46|16)\b[^\r\n]*Pagos al Exterior|\b(47|17)\b[^\r\n]*Exportaci/.test(l)) cruzadas.push(`${rel}:${i + 1}`);
      });
    }
    ok('barrido de src: ningun 46/16 llamado "Pagos al Exterior" ni 47/17 llamado "Exportacion"', cruzadas.length === 0, cruzadas.join(', '));
  }
  ok('los rotulos de e-CF no se copian: la pagina no nombra TIPOS_COMPROBANTE ni lleva su propia serie B',
    !nombra(ecf, 'TIPOS_COMPROBANTE') && !/const NCF_B/.test(ecf) && !/'Comprobante de Exportaci/.test(ecf)
    && /import \{[^}]*\bETIQUETAS_DE_TIPO\b[^}]*\} from '\.\/opcionesDeTipo';/.test(ecf));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main().catch((e) => { console.error(e); process.exit(2); });
