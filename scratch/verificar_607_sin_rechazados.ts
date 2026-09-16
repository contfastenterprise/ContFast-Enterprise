/**
 * El 607 no declara comprobantes rechazados.
 *
 * EL FALLO (lote 141)
 * -------------------
 * El TXT del 607 y el libro de ventas (tabla y totales de la pantalla del 607)
 * filtraban `ne(status, 'draft')` y `ne(status, 'void')`, cada uno por su
 * cuenta. Un comprobante que la DGII rechazo salia en el fichero que se le
 * presenta a la DGII. Medido el 2026-09-16 (scratch/_to_delete/medir_lote141_607.ts):
 * dos e-44 rechazadas en PRUEBA y E320000000059 en PRODUCCION.
 *
 * Ese ultimo caso esta mal en el sistema, no en la DGII: alli esta ACEPTADA.
 * Se corrige consultando su estado, y es tarea del dueño antes de desplegar.
 * Este banco no lo mira: mira que la regla sea una y la misma en los dos caminos.
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

const TXT = 'src/app/api/v1/reports/607/txt/route.ts';
const LIBRO = 'src/app/api/v1/reports/sales-book/route.ts';
const IMPORT = "import { ESTADOS_FUERA_DEL_607 } from '@/services/dgii/estadosReportables';";

/** El `.where(and(...))` de la consulta de facturas, con parentesis emparejados. */
function filtroDeFacturas(src: string): string {
  const i = src.indexOf('.from(invoices)');
  const j = src.indexOf('.where(', i);
  if (i < 0 || j < 0) return '';
  let n = 0;
  for (let k = j + '.where'.length; k < src.length; k++) {
    if (src[k] === '(') n++;
    else if (src[k] === ')') { n--; if (n === 0) return src.slice(j, k + 1); }
  }
  return '';
}

async function main() {
  console.log('\n0) Precondiciones: el resto del filtro sigue en su sitio\n');
  for (const ruta of [TXT, LIBRO]) {
    const f = filtroDeFacturas(fuente(ruta));
    const nombre = ruta.split('/').slice(-3, -1).join('/');
    exige(`${nombre}: se localiza el filtro de la consulta`, f.length > 0);
    exige(`${nombre}: sigue filtrando por modo`, /eq\(invoices\.modo, auth\.modo\)/.test(f));
    exige(`${nombre}: sigue excluyendo los borrados`, /isNull\(invoices\.deletedAt\)/.test(f));
  }

  console.log('\n1) La lista: fuera borradores, rechazados y anulados; dentro lo emitido\n');
  let lista: string[] | null = null;
  try {
    lista = (await import('../src/services/dgii/estadosReportables')).ESTADOS_FUERA_DEL_607;
  } catch {
    lista = null;
  }
  const todos = ['draft', 'signed', 'submitted', 'accepted', 'rejected', 'void'];
  const van = lista ? todos.filter((s) => !lista!.includes(s)) : [];
  ok('rechazados fuera del 607', !!lista && lista.includes('rejected'), lista ? JSON.stringify(lista) : 'no existe estadosReportables.ts');
  ok('borradores y anulados, fuera como antes', !!lista && lista.includes('draft') && lista.includes('void'));
  ok('van exactamente accepted, submitted y signed', JSON.stringify(van.sort()) === JSON.stringify(['accepted', 'signed', 'submitted']), JSON.stringify(van));

  console.log('\n2) Los dos caminos usan ESA lista, no una copia\n');
  for (const ruta of [TXT, LIBRO]) {
    const src = fuente(ruta);
    const f = filtroDeFacturas(src);
    const nombre = ruta.split('/').slice(-3, -1).join('/');
    ok(`${nombre}: importa la lista compartida`, src.includes(IMPORT));
    ok(`${nombre}: la aplica en el filtro de la consulta`, /notInArray\(invoices\.status, ESTADOS_FUERA_DEL_607\)/.test(f));
    ok(`${nombre}: ya no filtra estados a mano (con la lista presente)`,
      src.includes(IMPORT) && !/ne\(invoices\.status,/.test(f) && !/'rejected'/.test(f));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
