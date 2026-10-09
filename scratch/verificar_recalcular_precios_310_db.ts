/**
 * Lote 310, contra una base -- los productos que siguen con el RECARGO viejo pasan a la formula del
 * lote 265.
 *
 * Medido en PRODUCCION (solo lectura, `scratch/_to_delete/medir_precios_nivel_310.ts`): desde el
 * lote 265 los precios de un producto son `costo / (1 - margen)` (base 25 %, consumidor 20 %,
 * mayorista 15 %, proveedor 10 %), pero 76 de 86 productos con costo seguian guardados con el
 * recargo de antes, `costo x (1 + margen)` (costo 700 -> 875/840/805/770 en vez de
 * 933,33/875/823,53/777,78), y la factura y la cotizacion cobran lo guardado. Decision del dueño
 * (2026-10-08): pasar esos productos a la formula nueva, con un guion de datos que lanza el.
 *
 * El guion (`scratch/_to_delete/recalcular_precios_310.ts`, no versionado) y su regla pura
 * (`scratch/_to_delete/reglaPrecios310.ts`) se cargan PEREZOSOS: si faltan, cada comprobacion da
 * FALLA por su etiqueta en vez de reventar con "Cannot find module".
 *
 * Integracion: base DESECHABLE (scratch/bancos_db), con candado. Siembra productos en las dos
 * empresas de la semilla y comprueba:
 *  · la regla pura: el recargo exacto (tambien el que cae en medio centavo), uno desviado un centavo
 *    y el atado al dolar con el desvio de la tasa SI (decision del dueño, 2026-10-08: |guardado -
 *    exacto| <= 0,01 inclusive), uno a dos centavos NO, y los precios nuevos son los de
 *    `preciosDesdeCosto`;
 *  · el ensayo no cambia nada (y SI dice que recalcularia: la negacion va atada a esa marca);
 *  · `--aplicar` cambia exactamente los candidatos -- tambien el de la otra empresa -- a
 *    `preciosDesdeCosto(costo)` -- tambien el desviado un centavo y el atado al dolar, que sigue
 *    atado --, sin tocar costo ni oferta, ni los puestos a mano, ni los que ya tienen la formula
 *    nueva, ni el desviado dos centavos, ni el borrado, ni los de la semilla;
 *  · un precio cambiado POR OTRO mientras el guion espera su bloqueo no se pisa (relee dentro de la
 *    transaccion);
 *  · deja el JSON con antes y despues de exactamente los candidatos;
 *  · la segunda pasada no cambia nada.
 *
 *   powershell -File scratch\bancos_db\base_desechable.ps1 -Accion correr -Bancos verificar_recalcular_precios_310_db.ts
 */
import postgres from 'postgres';
import { spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { preciosDesdeCosto } from '../src/services/precios/margen';

const ALFA = '11111111-1111-1111-1111-111111111111';
const BETA = '22222222-2222-2222-2222-222222222222';
const raiz = join(__dirname, '..');
const CARPETA = join(raiz, 'scratch', '_to_delete');
const GUION = 'scratch/_to_delete/recalcular_precios_310.ts';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const sql = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });

//  Ids fijos: el banco borra y vuelve a sembrar los suyos.
const id = (n: number) => `31000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
type Siembra = { n: number; empresa: string; sku: string; cost: number; p: [number, number, number, number]; borrado?: boolean; oferta?: number };
const P = {
  R1: { n: 1, empresa: ALFA, sku: 'L310-R1', cost: 700, p: [875, 840, 805, 770] },
  //  123,45 x 1,10 = 135,795: medio centavo justo. 135,80 tiene que contar como recargo.
  R2: { n: 2, empresa: ALFA, sku: 'L310-R2', cost: 123.45, p: [154.31, 148.14, 141.97, 135.8] },
  OTRA: { n: 3, empresa: BETA, sku: 'L310-OTRA', cost: 300, p: [375, 360, 345, 330] },
  OFERTA: { n: 4, empresa: ALFA, sku: 'L310-OFERTA', cost: 1000, p: [1250, 1200, 1150, 1100], oferta: 1100 },
  MANO: { n: 5, empresa: ALFA, sku: 'L310-MANO', cost: 500, p: [700, 650, 600, 560] },
  NUEVA: { n: 6, empresa: ALFA, sku: 'L310-NUEVA', cost: 700, p: [933.33, 875, 823.53, 777.78] },
  //  Un centavo de desvio en un nivel: dentro (|805,01 - 805| = 0,01, inclusive).
  CASI: { n: 7, empresa: ALFA, sku: 'L310-CASI', cost: 700, p: [875, 840, 805.01, 770] },
  //  Dos centavos: fuera.
  DOS: { n: 11, empresa: ALFA, sku: 'L310-DOS', cost: 700, p: [875, 840, 805.02, 770] },
  //  Atado al dolar, el caso medido en PRODUCCION: exacto 562,650 / 540,144 / 517,638 / 495,132.
  DOLAR: { n: 12, empresa: ALFA, sku: 'L310-DOLAR', cost: 450.12, p: [562.64, 540.15, 517.64, 495.13] },
  BORRADO: { n: 8, empresa: ALFA, sku: 'L310-BORRADO', cost: 700, p: [875, 840, 805, 770], borrado: true },
  CARRERA: { n: 9, empresa: ALFA, sku: 'L310-CARRERA', cost: 200, p: [250, 240, 230, 220] },
  SINCOSTO: { n: 10, empresa: ALFA, sku: 'L310-SINCOSTO', cost: 0, p: [0, 0, 0, 0] },
} satisfies Record<string, Siembra>;
const CANDIDATOS = ['R1', 'R2', 'OTRA', 'OFERTA', 'CASI', 'DOLAR'] as const;
const INTACTOS = ['MANO', 'NUEVA', 'DOS', 'BORRADO', 'SINCOSTO'] as const;

type Foto = Record<string, unknown>;
type Precios4 = { price: number; priceConsumidor: number; priceMayorista: number; priceProveedor: number };
/** La forma de la regla pura (`_to_delete/reglaPrecios310.ts`), escrita aqui para no depender de ella al compilar. */
type Regla = {
  estaConRecargoViejo: (p: { cost: number } & Precios4) => boolean;
  preciosNuevos: (costo: number) => Precios4;
};
/** Toda la fila como texto: para "no cambio nada" se compara la fila entera. */
async function fotos(): Promise<Map<string, Foto>> {
  const filas = await sql`select id::text id, row_to_json(p)::text fila from products p order by id`;
  return new Map(filas.map((f) => [f.id as string, JSON.parse(f.fila as string) as Foto]));
}
const precios = (f: Foto | undefined) => f ? [f.price, f.price_consumidor, f.price_mayorista, f.price_proveedor].map(Number) : [];
const iguales = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 0.001);
const nuevos = (cost: number) => { const n = preciosDesdeCosto(cost); return [n.price, n.priceConsumidor, n.priceMayorista, n.priceProveedor]; };
const mismasFilas = (a: Map<string, Foto>, b: Map<string, Foto>, ids?: string[]) =>
  (ids ?? [...new Set([...a.keys(), ...b.keys()])]).every((k) => JSON.stringify(a.get(k)) === JSON.stringify(b.get(k)));

function jsonsDesde(t: number): string[] {
  if (!existsSync(CARPETA)) return [];
  return readdirSync(CARPETA).filter((f) => /^recalcular_precios_310_.*\.json$/.test(f))
    .map((f) => join(CARPETA, f)).filter((f) => statSync(f).mtimeMs >= t);
}

function lanzar(...args: string[]): { listo: Promise<{ codigo: number; salida: string }>; } {
  if (!existsSync(join(raiz, GUION))) return { listo: Promise.resolve({ codigo: -1, salida: `falta ${GUION}` }) };
  const h = spawn(process.execPath, [join(raiz, 'node_modules/tsx/dist/cli.mjs'), '--import', './scratch/bancos_db/precarga.mts', GUION, ...args],
    { cwd: raiz, env: process.env });
  let salida = '';
  h.stdout.on('data', (d) => { salida += d; });
  h.stderr.on('data', (d) => { salida += d; });
  return { listo: new Promise((r) => h.on('close', (c) => r({ codigo: c ?? -1, salida }))) };
}

async function sembrar() {
  await sql`delete from productos_en_dolares where product_id in (select id from products where sku like 'L310-%')`;
  await sql`delete from products where sku like 'L310-%'`;
  for (const s of Object.values(P) as Siembra[]) {
    await sql`insert into products (id, company_id, sku, name, cost, price, price_consumidor, price_mayorista, price_proveedor,
        is_on_sale, promotional_price, deleted_at, updated_at)
      values (${id(s.n)}, ${s.empresa}, ${s.sku}, ${`Producto ${s.sku}`}, ${s.cost}, ${s.p[0]}, ${s.p[1]}, ${s.p[2]}, ${s.p[3]},
        ${s.oferta !== undefined}, ${s.oferta ?? 0}, ${s.borrado ? sql`now()` : null}, '2026-01-01T00:00:00Z')`;
  }
  await sql`insert into productos_en_dolares (product_id, company_id, costo_usd) values (${id(P.DOLAR.n)}, ${ALFA}, 7.5)`;
}

async function main() {
  //  1. La regla pura.
  //  Ruta en variable: con el literal, `tsc -p scratch` fallaria en un clon sin `_to_delete/`.
  const RUTA_REGLA = './_to_delete/reglaPrecios310';
  let regla: Regla | null = null;
  try { regla = (await import(RUTA_REGLA)) as Regla; } catch { regla = null; }
  const prod = (s: Siembra) => ({ cost: s.cost, price: s.p[0], priceConsumidor: s.p[1], priceMayorista: s.p[2], priceProveedor: s.p[3] });
  ok('regla: el recargo exacto (costo 700 -> 875/840/805/770) es recargo viejo', regla?.estaConRecargoViejo(prod(P.R1)) === true);
  ok('regla: el que cae en medio centavo (123,45 x 1,10 = 135,795 guardado 135,80) tambien', regla?.estaConRecargoViejo(prod(P.R2)) === true);
  ok('regla: desviado UN centavo en un nivel si lo es (0,01 inclusive)', regla?.estaConRecargoViejo(prod(P.CASI)) === true);
  ok('regla: el atado al dolar con el desvio de la tasa (450,12 -> 562,64/540,15/517,64/495,13) si lo es', regla?.estaConRecargoViejo(prod(P.DOLAR)) === true);
  ok('regla: desviado DOS centavos en un nivel no lo es', regla?.estaConRecargoViejo(prod(P.R1)) === true && regla.estaConRecargoViejo(prod(P.DOS)) === false);
  ok('regla: ni el puesto a mano, ni el que ya tiene la formula nueva, ni el sin costo',
    regla?.estaConRecargoViejo(prod(P.R1)) === true && !regla.estaConRecargoViejo(prod(P.MANO))
    && !regla.estaConRecargoViejo(prod(P.NUEVA)) && !regla.estaConRecargoViejo(prod(P.SINCOSTO)));
  ok('regla: los precios nuevos son los de preciosDesdeCosto',
    !!regla && [700, 123.45, 1000, 0.01].every((c) => { const n = regla!.preciosNuevos(c); return iguales([n.price, n.priceConsumidor, n.priceMayorista, n.priceProveedor], nuevos(c)); }));

  //  2. Siembra.
  await sembrar();
  const f0 = await fotos();
  if (!f0.has(id(P.R1.n)) || !f0.has(id(P.OTRA.n))) throw new Error('Precondicion: no se sembraron los productos del banco');
  const tInicio = Date.now() - 1000;

  //  3. Ensayo.
  const ens = await lanzar().listo;
  const f1 = await fotos();
  const ensayoDice = ens.codigo === 0 && ens.salida.includes('L310-R1') && ens.salida.includes('L310-OTRA') && /ENSAYO/.test(ens.salida);
  ok('el ensayo termina bien y lista lo que recalcularia (tambien el de la otra empresa)', ensayoDice, ens.codigo === 0 ? '' : ens.salida.slice(-400));
  ok('el ensayo NO cambia ninguna fila de products', ensayoDice && mismasFilas(f0, f1));
  ok('el ensayo NO deja JSON', ensayoDice && jsonsDesde(tInicio).length === 0);
  ok('el ensayo dice por que deja los no candidatos', ensayoDice && /se dejan \(precios distintos/.test(ens.salida) && /se dejan \(ya con la formula nueva/.test(ens.salida));

  //  4. Aplicar, con otro cambiando CARRERA mientras el guion espera su bloqueo.
  const otro = await sql.reserve();
  await otro`begin`;
  await otro`update products set price = 999 where id = ${id(P.CARRERA.n)}`;
  const tAplicar = Date.now() - 1000;
  const ap = lanzar('--aplicar');
  //  Se espera a que el guion este de verdad bloqueado por la fila (o 30 s): si no, la carrera no
  //  se prueba y la comprobacion lo dice.
  let bloqueado = false;
  for (let i = 0; i < 300 && !bloqueado; i++) {
    const [w] = await sql`select count(*)::int n from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`;
    bloqueado = (w.n as number) > 0;
    if (!bloqueado) await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 300));
  await otro`commit`;
  otro.release();
  const apr = await ap.listo;
  const f2 = await fotos();
  const cambiaron = CANDIDATOS.filter((k) => { const s = P[k] as Siembra; return iguales(precios(f2.get(id(s.n))), nuevos(s.cost)); });
  const aplico = apr.codigo === 0 && cambiaron.length === CANDIDATOS.length;
  ok('--aplicar termina bien y deja los cuatro candidatos en preciosDesdeCosto(costo)', aplico,
    apr.codigo === 0 ? `cambiaron: ${cambiaron.join(', ')}` : apr.salida.slice(-400));
  ok('  incluido el de la otra empresa (Beta)', iguales(precios(f2.get(id(P.OTRA.n))), nuevos(P.OTRA.cost)));
  ok('  y el desviado un centavo (CASI) y el atado al dolar (DOLAR, a 600,16/562,65/529,55/500,13)',
    iguales(precios(f2.get(id(P.CASI.n))), nuevos(P.CASI.cost)) && iguales(precios(f2.get(id(P.DOLAR.n))), nuevos(P.DOLAR.cost))
    && iguales(nuevos(P.DOLAR.cost), [600.16, 562.65, 529.55, 500.13]));
  const [atado] = await sql`select count(*)::int n from productos_en_dolares where product_id = ${id(P.DOLAR.n)} and costo_usd = 7.5`;
  ok('  y el atado al dolar sigue atado, con su costo en US$', aplico && atado.n === 1);
  ok('  y el de medio centavo (R2) a 164,60/154,31/145,24/137,17',
    iguales(precios(f2.get(id(P.R2.n))), nuevos(P.R2.cost)) && iguales(nuevos(P.R2.cost), [164.6, 154.31, 145.24, 137.17]));
  ok('  a los candidatos les cambia updated_at', aplico && CANDIDATOS.every((k) => f2.get(id((P[k] as Siembra).n))?.updated_at !== f0.get(id((P[k] as Siembra).n))?.updated_at));
  ok('  NO toca el costo de ningun candidato', aplico && CANDIDATOS.every((k) => Number(f2.get(id((P[k] as Siembra).n))?.cost) === (P[k] as Siembra).cost));
  const fo0 = f0.get(id(P.OFERTA.n)); const fo2 = f2.get(id(P.OFERTA.n));
  ok('  NO toca la oferta (promotional_price 1100, is_on_sale) del candidato con oferta',
    aplico && Number(fo2?.promotional_price) === 1100 && fo2?.is_on_sale === true && fo0?.is_on_sale === true);
  ok('  en los candidatos solo cambian los cuatro precios y updated_at',
    aplico && CANDIDATOS.every((k) => {
      const a = { ...f0.get(id((P[k] as Siembra).n)) }; const b = { ...f2.get(id((P[k] as Siembra).n)) };
      for (const c of ['price', 'price_consumidor', 'price_mayorista', 'price_proveedor', 'updated_at']) { delete a[c]; delete b[c]; }
      return JSON.stringify(a) === JSON.stringify(b);
    }));
  ok('NO toca los puestos a mano, los de formula nueva, el desviado DOS centavos, el borrado ni el sin costo',
    aplico && mismasFilas(f0, f2, INTACTOS.map((k) => id((P[k] as Siembra).n))));
  ok('NO toca los productos de la semilla', aplico && mismasFilas(f0, f2, [...f0.keys()].filter((k) => !k.startsWith('31000000-'))));
  ok('el guion llego a esperar el bloqueo de la fila cambiada por otro', aplico && bloqueado);
  const fc = f2.get(id(P.CARRERA.n));
  ok('el cambiado por otro entre medias NO se pisa (999 y el resto como estaba)',
    aplico && bloqueado && iguales(precios(fc), [999, 240, 230, 220]));

  //  5. El JSON.
  const jsons = jsonsDesde(tAplicar);
  let datos: { id: string; companyId: string; sku: string; antes: Record<string, number>; despues: Record<string, number> }[] = [];
  try { datos = jsons.length === 1 ? JSON.parse(readFileSync(jsons[0], 'utf8')) : []; } catch { datos = []; }
  const idsJson = datos.map((d) => d.id).sort();
  const idsCand = CANDIDATOS.map((k) => id((P[k] as Siembra).n)).sort();
  ok('--aplicar deja UN JSON con exactamente los candidatos', jsons.length === 1 && JSON.stringify(idsJson) === JSON.stringify(idsCand),
    `${jsons.length} ficheros; ids ${idsJson.length}`);
  const r1 = datos.find((d) => d.id === id(P.R1.n));
  ok('  con empresa, sku y los cuatro precios antes y despues',
    !!r1 && r1.companyId === ALFA && r1.sku === 'L310-R1' && r1.antes.price === 875 && r1.antes.priceProveedor === 770
    && r1.despues.price === 933.33 && r1.despues.priceMayorista === 823.53);

  //  6. Segunda pasada.
  const yaEstaban = new Set(jsonsDesde(tInicio));
  const seg = await lanzar('--aplicar').listo;
  const f3 = await fotos();
  ok('la segunda pasada termina bien y NO cambia ninguna fila', aplico && seg.codigo === 0 && mismasFilas(f2, f3), seg.codigo === 0 ? '' : seg.salida.slice(-300));
  ok('  y dice que no recalcula nada, sin dejar otro JSON', aplico && /Total: 0 recalculados/.test(seg.salida) && jsonsDesde(tInicio).every((f) => yaEstaban.has(f)));

  //  Limpieza: los productos del banco y los JSON que dejo.
  for (const f of jsonsDesde(tInicio)) unlinkSync(f);
  await sql`delete from productos_en_dolares where product_id in (select id from products where sku like 'L310-%')`;
  await sql`delete from products where sku like 'L310-%'`;
}

main()
  .catch((e) => { console.log(` FALLA  el banco no llego al final -- ${e instanceof Error ? e.message : e}`); fallos++; })
  .finally(async () => {
    await sql.end({ timeout: 2 });
    console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
    setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
  });
