/**
 * Editar una compra ya no revierte y vuelve a meter la mercancia cuando nada de
 * inventario cambia, y el freno de existencia mira lo NETO.
 *
 * EL CASO REAL (lote 150)
 * -----------------------
 * E310000013249 (Latin Doors, PRODUCCION): editada el 11/09 a las 12:07 hora RD,
 * antes del freno `c2525cb` (15:53). El reverso saco 332 unidades y cuatro
 * productos quedaron en rojo en el kardex (hasta -94) antes de la reentrada.
 * Con el freno puesto, esa misma edicion -y la de 6 de las 7 compras con
 * inventario- se negaba entera, aunque solo se cambiara la descripcion.
 *
 * Se EJECUTA la comparacion y la cuenta; el cableado de la ruta se lee.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};
const bloque = (src: string, ancla: string): string => {
  const i = src.indexOf(ancla);
  if (i < 0) return '';
  const j = src.indexOf('{', i + ancla.length - 1);
  let n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return '';
};

const ALM = 'alm-principal';
//  Las cinco lineas de E310000013249 (costos de ejemplo; lo que importa es que coinciden).
const LINEAS = [
  { productId: 'dintel', quantity: '72.00', unitCost: '850.00' },
  { productId: 'marco-bisagra', quantity: '120.00', unitCost: '1200.00' },
  { productId: 'marco-llavin', quantity: '120.00', unitCost: '1200.00' },
  { productId: 'puerta-200', quantity: '10.00', unitCost: '2657.00' },
  { productId: 'puerta-210', quantity: '10.00', unitCost: '2657.00' },
];
const VIVO = new Map([
  [`dintel|${ALM}`, 72], [`marco-bisagra|${ALM}`, 120], [`marco-llavin|${ALM}`, 120],
  [`puerta-200|${ALM}`, 10], [`puerta-210|${ALM}`, 10],
]);

async function main() {
  const RUTA = fuente('src/app/api/v1/expenses/[id]/route.ts');

  console.log('\n0) Precondiciones\n');
  exige('la edicion sigue revirtiendo inventario, borrando lineas y volviendo a meter con addStock',
    RUTA.includes('export async function PUT(') && RUTA.includes('await revertirMovimientosInventario(')
    && RUTA.includes('.delete(expenseLines)') && RUTA.includes('`Edición de Compra a suplidor / Gasto`'));
  exige('el freno de existencia ya consumida sigue ahi', RUTA.includes("err.code = 'STOCK_YA_CONSUMIDO';"));

  let m: typeof import('../src/services/inventario/entradasDeCompra') | null = null;
  try { m = await import('../src/services/inventario/entradasDeCompra'); } catch { m = null; }
  const sin = new Set<string>();
  const iguales = (lineasDespues: typeof LINEAS, almDespues = ALM, sinInv: Set<string> = sin, vivo = VIVO, lineasAntes = LINEAS) =>
    !!m && m.kardexSinCambios(vivo, m.entradasDeLineas(lineasAntes, ALM, new Set()), m.entradasDeLineas(lineasDespues, almDespues, sinInv));

  console.log('\n1) Sin cambios de inventario, el kardex no se toca\n');
  ok('E310000013249 editada sin tocar sus lineas: sin cambios', !!m && iguales(LINEAS));
  ok('las mismas lineas en otro orden: sin cambios', !!m && iguales([...LINEAS].reverse()));
  ok('una linea de servicio (sin control de existencia) añadida: sin cambios',
    !!m && iguales([...LINEAS, { productId: 'flete', quantity: '1', unitCost: '500' }], ALM, new Set(['flete'])));
  {
    const conFlete = [...LINEAS, { productId: 'flete', quantity: '1', unitCost: '500' }];
    ok('una compra que YA traia un servicio, editada sin tocar lineas: sin cambios',
      !!m && iguales(conFlete, ALM, new Set(['flete']), VIVO, conFlete));
  }
  ok('costo tecleado con mas decimales de los que se guardan (1200.004): sin cambios',
    !!m && iguales(LINEAS.map((l, i) => (i === 1 ? { ...l, unitCost: 1200.004 as unknown as string } : l))));

  console.log('\n2) Cualquier cambio de inventario va por el camino de siempre\n');
  ok('cambia solo un costo: CAMBIA (el promedio tiene que enterarse)',
    !!m && !iguales(LINEAS.map((l, i) => (i === 0 ? { ...l, unitCost: '900.00' } : l))));
  ok('cambia una cantidad: CAMBIA', !!m && !iguales(LINEAS.map((l, i) => (i === 3 ? { ...l, quantity: '8.00' } : l))));
  ok('cambia el almacen: CAMBIA', !!m && !iguales(LINEAS, 'alm-otro'));
  ok('se quita una linea: CAMBIA', !!m && !iguales(LINEAS.slice(1)));
  ok('se añade un producto con existencia: CAMBIA', !!m && !iguales([...LINEAS, { productId: 'bisagra', quantity: '4', unitCost: '90' }]));
  ok('lo vivo en el kardex no coincide con las lineas (compra antigua): CAMBIA',
    !!m && !iguales(LINEAS, ALM, sin, new Map([...VIVO].map(([k, v]) => [k, k.startsWith('dintel') ? 70 : v]))));
  ok('el kardex tiene vivo un producto que ya no esta en las lineas: CAMBIA (el reverso lo saca)',
    !!m && !iguales(LINEAS, ALM, sin, new Map([...VIVO, [`bisagra|${ALM}`, 4]])));
  ok('sin almacen no entra nada', !!m && m.entradasDeLineas(LINEAS, null, sin).length === 0);

  console.log('\n3) El freno mira lo neto\n');
  ok('hay 26, se revierten 120 y vuelven 120: quedan 26, se permite',
    !!m && m.existenciaTrasEditar(26, 120, 120) === 26 && !m.quedaEnRojo(m.existenciaTrasEditar(26, 120, 120)));
  ok('hay 26, se revierten 120 y vuelven 100: quedan 6, se permite', !!m && !m.quedaEnRojo(m.existenciaTrasEditar(26, 120, 100)));
  ok('hay 26, se revierten 120 y vuelven 90: -4, se niega', !!m && m.quedaEnRojo(m.existenciaTrasEditar(26, 120, 90)));
  ok('al eliminar no vuelve nada: -94, se niega', !!m && m.quedaEnRojo(m.existenciaTrasEditar(26, 120, 0)));
  ok('quedar justo en cero se permite', !!m && m.existenciaTrasEditar(26, 26, 0) === 0 && !m.quedaEnRojo(0));
  ok('ruido de coma flotante no es rojo', !!m && !m.quedaEnRojo(0.1 + 0.2 - 0.3 - 1e-12));

  console.log('\n4) El cableado de la ruta\n');
  {
    const revertir = bloque(RUTA, 'async function revertirMovimientosInventario(');
    ok('revertir recibe lo que vuelve a entrar y el freno lo suma',
      /vuelveAEntrar: ReadonlyMap<string, number> = new Map\(\)/.test(revertir)
      && /const entra = vuelveAEntrar\.get\(clave\) \?\? 0;\s*const quedaria = existenciaTrasEditar\(actual, r\.cantidad, entra\);\s*if \(quedaEnRojo\(quedaria\)\)/.test(revertir));
    ok('y lee lo vivo con el lector compartido (el que usa la edicion para comparar)',
      /const vivos = await movimientosVivosDeCompra\(tx, companyId, modo, expenseId\);/.test(revertir));

    //  PUT y DELETE empiezan por `{ params }`: el bloque de llaves se quedaria
    //  en eso. Se toma hasta la siguiente funcion exportada.
    const hasta = (ancla: string) => {
      const i = RUTA.indexOf(ancla);
      if (i < 0) return '';
      const j = RUTA.indexOf('export async function', i + ancla.length);
      return RUTA.slice(i, j < 0 ? undefined : j);
    };
    const put = hasta('export async function PUT(');
    const iIgual = put.indexOf('const kardexIgual = kardexSinCambios(');
    ok('la edicion compara con lo vivo, las lineas de antes en su almacen y las nuevas con la condicion de addStock',
      iIgual > 0
      && /const vivosAntes = await movimientosVivosDeCompra\(tx, session\.companyId, session\.modo, id\);/.test(put)
      && /const entradasDespues = entradasDeLineas\(lines, warehouseId, sinInventario\);/.test(put)
      && /entradasDeLineas\(lineasAntes, existing\[0\]\.warehouseId, new Set\(\)\)/.test(put));
    ok('lee las lineas de antes ANTES de borrarlas', iIgual > 0 && iIgual < put.indexOf('.delete(expenseLines)')
      && put.indexOf('const lineasAntes = await tx') < iIgual);
    ok('revierte solo si cambia, pasando lo que vuelve a entrar',
      /if \(!kardexIgual\) \{\s*await revertirMovimientosInventario\([^;]*cantidadPorNivel\(entradasDespues\)\s*\);\s*\}/.test(put));
    ok('y vuelve a meter solo si revirtio',
      /if \(!kardexIgual && line\.productId && warehouseId && !sinInventario\.has\(line\.productId\)\)/.test(put));
    const del = hasta('export async function DELETE(');
    ok('eliminar sigue sin devolver nada al freno (seis argumentos)',
      /await revertirMovimientosInventario\(\s*tx,\s*session\.companyId,\s*session\.modo,\s*id,\s*session\.userId,\s*`Eliminación de compra NCF: \$\{expenseRow\.ncf \|\| 'N\/A'\}`\s*\);/.test(del)
      && /vuelveAEntrar/.test(revertir));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
