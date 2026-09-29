/**
 * Lote 221 -- el panel avisa del conduce que no se pudo despachar, y dice QUE
 * mercancia falta y CUANTA.
 *
 * POR QUE
 * -------
 * Facturar no descuenta existencia: lo hace el conduce al aprobarse, y ahi se
 * asienta el costo de venta. El conduce automatico que falla por "inventario
 * insuficiente" se quedaba en borrador y solo constaba en la auditoria. Medido
 * el 2026-09-28: cinco en PRODUCCION (10/09 a 25/09). A dos les faltaba
 * mercancia (1 Puerta Roble 90*210; 4 Dintel Caoba), dos ya tenian existencia
 * repuesta y uno solo llevaba productos sin inventario. El aviso los distingue.
 *
 * La regla del aviso tiene que ser LA DE LA APROBACION (`alcanzaLaExistencia`,
 * con el minimo del almacen): si contara distinto, diria "falta" de un conduce
 * que se aprueba. El banco EJECUTA la regla con esos casos reales, y el mismo
 * caso contra `alcanzaLaExistencia` para que no puedan separarse.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

type Modulo = typeof import('../src/services/inventario/faltanteDelConduce');

const R = (productId: string, nombre: string, sku: string | null, pedido: number | string, existencia: number | string | null, minimo: number | string | null = 0, llevaInventario = true) =>
  ({ productId, nombre, sku, pedido, existencia, minimo, llevaInventario });

async function main() {
  // Vale en los dos estados: la regla de la aprobacion no la toca este lote.
  const existencia = leer('src/services/inventario/existencia.ts');
  if (!/export function alcanzaLaExistencia/.test(existencia)) {
    throw new Error('Precondicion: ya no existe alcanzaLaExistencia, la regla de la aprobacion');
  }
  if (!/alcanzaLaExistencia\(existencia, minimo, totalPedido\)/.test(leer('src/services/inventoryService.ts'))) {
    throw new Error('Precondicion: checkStockBatch ya no decide con alcanzaLaExistencia');
  }
  const E = await import('../src/services/inventario/existencia');

  let F: Modulo | null = null;
  try { F = await import('../src/services/inventario/faltanteDelConduce'); } catch { F = null; }

  console.log('\n1) Los casos reales del 2026-09-28, ejecutados\n');
  const ETQ = [
    'CON-000056: faltan 4 Dintel Caoba (pide 5, hay 1)',
    '  y lo que alcanza no sale',
    'CON-000041: falta 1 Puerta Roble 90*210 (pide 2, hay 1)',
    'CON-000044: productos sin inventario no faltan nunca',
    'CON-000053: con existencia repuesta, no falta nada',
    'sin nivel en el almacen, la existencia es 0',
    'el minimo del almacen cuenta, como en la aprobacion',
    'el mismo producto en dos renglones pide la SUMA',
    'la regla coincide con alcanzaLaExistencia en 400 casos',
    'cantidades con decimales, sin basura de coma flotante',
  ];
  if (!F) {
    for (const t of ETQ) ok(t, false, 'no existe faltanteDelConduce.ts');
  } else {
    const f56 = F.faltantesDelConduce([
      R('dc', 'Dintel Caoba', 'PROD-000035', '5.0000', '1.0000'),
      R('jr', 'Jamba Roble', 'PROD-000040', '20.0000', '24.0000'),
      R('pb', 'Puerta Blanca 70*200', 'PROD-000017', '12.0000', '12.0000'),
    ]);
    ok(ETQ[0], f56.length >= 1 && f56[0].nombre === 'Dintel Caoba' && f56[0].faltan === 4 && f56[0].pedido === 5 && f56[0].existencia === 1,
      JSON.stringify(f56[0] ?? null));
    // Justo lo que hay (12 de 12) ALCANZA: es el borde de la regla.
    ok(ETQ[1], f56.length === 1, `${f56.length} faltantes`);

    const f41 = F.faltantesDelConduce([
      R('pr', 'Puerta Roble 90*210', 'PROD-000072', 2, 1),
      R('dr', 'Dintel Roble', 'PROD-000039', 2, 13),
    ]);
    ok(ETQ[2], f41.length === 1 && f41[0].faltan === 1);

    const f44 = F.faltantesDelConduce([
      R('cl', 'Closet Blanco en Espejo', 'PROD-000081', 103, 0, 0, false),
      R('gb', 'Gabinetes Blanco', 'PROD-000056', 24, null, null, false),
    ]);
    ok(ETQ[3], f44.length === 0);

    ok(ETQ[4], F.faltantesDelConduce([R('db', 'Dintel Blanco', 'PROD-000003', 10, 190)]).length === 0);

    const sinNivel = F.faltantesDelConduce([R('x', 'Puerta Blanca 85*210', 'PROD-000010', 1, null, null)]);
    ok(ETQ[5], sinNivel.length === 1 && sinNivel[0].faltan === 1 && sinNivel[0].existencia === 0);

    // Hay 6 en el estante, pero el minimo es 3: pedir 5 deja 1 < 3. Faltan 2.
    const conMinimo = F.faltantesDelConduce([R('m', 'Marco', 'M1', 5, 6, 3)]);
    ok(ETQ[6], conMinimo.length === 1 && conMinimo[0].faltan === 2 && conMinimo[0].minimo === 3
      && E.alcanzaLaExistencia(6, 3, 5) === false, JSON.stringify(conMinimo[0] ?? null));

    // 3 + 3 contra 4: por separado "alcanza" cada uno; juntos faltan 2.
    const repetido = F.faltantesDelConduce([R('p', 'Puerta', 'P', 3, 4), R('p', 'Puerta', 'P', 3, 4)]);
    ok(ETQ[7], repetido.length === 1 && repetido[0].pedido === 6 && repetido[0].faltan === 2);

    // Barrido: el aviso dice "falta" EXACTAMENTE cuando la aprobacion diria que no alcanza.
    let discrepancias = 0;
    for (let hay = 0; hay <= 9; hay++) for (let minimo = 0; minimo <= 3; minimo++) for (let pide = 1; pide <= 10; pide++) {
      const falta = F.faltantesDelConduce([R('a', 'A', null, pide, hay, minimo)]).length === 1;
      if (falta === E.alcanzaLaExistencia(hay, minimo, pide)) discrepancias++;
    }
    ok(ETQ[8], discrepancias === 0, `${discrepancias} discrepancias`);

    const dec = F.faltantesDelConduce([R('d', 'Tablero', null, '0.3000', '0.1000')]);
    ok(ETQ[9], dec.length === 1 && dec[0].faltan === 0.2, String(dec[0]?.faltan));
  }

  console.log('\n2) Lo que dice el aviso\n');
  if (!F) {
    for (const t of ['nombra producto, SKU y cuantas faltan', '  y con minimo, lo dice', 'el titulo dice que falta mercancia',
                     '  la descripcion nombra la factura y la consecuencia', 'sin faltantes: "listo para despachar"',
                     '  y si sus productos no llevan inventario, lo dice en vez de hablar de existencia',
                     'muchos faltantes: se enumeran 5 y se cuenta el resto']) ok(t, false, 'no existe faltanteDelConduce.ts');
  } else {
    const t = F.textoDelFaltante({ productId: 'dc', nombre: 'Dintel Caoba', sku: 'PROD-000035', pedido: 5, existencia: 1, minimo: 0, faltan: 4 });
    ok('nombra producto, SKU y cuantas faltan', t === 'Dintel Caoba (PROD-000035): faltan 4 — pide 5, hay 1', t);
    const tm = F.textoDelFaltante({ productId: 'm', nombre: 'Marco', sku: null, pedido: 5, existencia: 6, minimo: 3, faltan: 2 });
    ok('  y con minimo, lo dice', /mínimo del almacén 3/.test(tm) && /hay 6/.test(tm), tm);

    const faltantes = F.faltantesDelConduce([R('dc', 'Dintel Caoba', 'PROD-000035', 5, 1)]);
    const aviso = F.avisoDelConduce({ numero: 'CON-2026-000056', ncf: 'E310000000027', faltantes, llevaInventario: true } as never);
    ok('el titulo dice que falta mercancia', /CON-2026-000056/.test(aviso.title) && /falta mercancía/.test(aviso.title), aviso.title);
    ok('  la descripcion nombra la factura y la consecuencia',
      /Dintel Caoba \(PROD-000035\): faltan 4/.test(aviso.description) && /E310000000027/.test(aviso.description)
      && /costo de venta/.test(aviso.description), aviso.description);

    const listo = F.avisoDelConduce({ numero: 'CON-2026-000053', ncf: 'E310000000026', faltantes: [], llevaInventario: true } as never);
    ok('sin faltantes: "listo para despachar"', /listo para despachar/.test(listo.title) && /Ya hay existencia/.test(listo.description));
    // CON-2026-000044, medido: solo productos sin inventario. Decirle "ya hay
    // existencia" o que la mercancia "sigue contando en el inventario" era falso.
    const sinInv = F.avisoDelConduce({ numero: 'CON-2026-000044', ncf: 'E320000000070', faltantes: [], llevaInventario: false } as never);
    ok('  y si sus productos no llevan inventario, lo dice en vez de hablar de existencia',
      /no llevan inventario/.test(sinInv.description) && !/existencia/.test(sinInv.description)
      && !/sigue contando en el inventario/.test(sinInv.description), sinInv.description);

    const muchos = F.faltantesDelConduce(Array.from({ length: 8 }, (_, i) => R(`p${i}`, `Producto ${i}`, null, 2, 1)));
    const avisoLargo = F.avisoDelConduce({ numero: 'CON-X', ncf: null, faltantes: muchos, llevaInventario: true } as never);
    ok('muchos faltantes: se enumeran 5 y se cuenta el resto',
      (avisoLargo.description.match(/: falta 1 —/g) ?? []).length === 5 && /y 3 productos más/.test(avisoLargo.description),
      avisoLargo.description.slice(0, 120));
  }

  console.log('\n3) El panel lo usa\n');
  const repo = sinComentarios(leer('src/repositories/dashboardRepository.ts'));
  ok('importa la regla, no una copia',
    /from '@\/services\/inventario\/faltanteDelConduce'/.test(repo) && /faltantesDelConduce\(conduce\.renglones\)/.test(repo)
    && /avisoDelConduce\(\{/.test(repo));
  ok('  y le dice si algun producto lleva inventario',
    /llevaInventario: conduce\.renglones\.some\(\(r\) => r\.llevaInventario\)/.test(repo));
  //  ACOTADO al bloque de este lote: el filtro de facturas vivas ya existia en
  //  el mismo fichero (aviso del 606/607, lote 159), y mirarlo en todo el
  //  fichero lo daba por bueno sin que este aviso lo tuviera.
  const i = repo.indexOf('const renglonesSinDespachar');
  const bloque = i < 0 ? '' : repo.slice(i, repo.indexOf('const conducesSinDespachar', i));
  ok('mira los conduces en borrador', /eq\(deliveryNotes\.status, 'draft'\)/.test(bloque));
  ok('  de facturas vivas (ni borradas, ni rechazadas, ni anuladas)',
    /isNull\(invoices\.deletedAt\)/.test(bloque) && /not in \('draft', 'rejected', 'void'\)/.test(bloque));
  ok('  con el nivel del almacen de SU factura, y de su modo',
    /eq\(inventoryLevels\.warehouseId, invoices\.warehouseId\)/.test(repo) && /eq\(inventoryLevels\.modo, deliveryNotes\.modo\)/.test(repo));
  ok('  acotado por empresa y modo', /withTenantMode\(deliveryNotes, ctx,/.test(repo));
  // La clave es estable por conduce: asi el aviso se actualiza al cambiar la
  // existencia y se cierra solo al aprobarse (sincronizarAvisos, lote 160).
  ok('clave estable por conduce, y lleva a la pantalla de conduces',
    /id: `conduce-sin-despachar-\$\{conduceId\}`/.test(repo) && /actionLink: '\/dashboard\/delivery-notes'/.test(repo));
  const { severidadDeAviso } = await import('../src/services/avisos/avisoDelPanel');
  ok('es una advertencia, no informativo (va al correo de avisos)', severidadDeAviso('conduce_sin_despachar') === 'warning');

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
