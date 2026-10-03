/**
 * Lote 260 -- "Consultar DGII" cubre todo el filtro, y una consulta no deshace
 * un veredicto definitivo. Pedido del dueño (2026-10-03): "que sincronizar
 * cubra todo el filtro, no solo la página y cambia el nombre de los botones".
 *
 * Antes el boton mandaba los ids de la PAGINA visible; ahora manda el filtro y
 * el servidor lo resuelve con las mismas condiciones que el listado. Al medir
 * salio que la consulta reescribia el estado fuera cual fuera el de antes:
 * E340000000002 (dada de baja) volvia a `rejected`, y E320000001014 (PRUEBA,
 * aceptada) bajaria a rechazada. Ver `consultaDeEstado.ts`.
 *
 * Se EJECUTAN las reglas y el filtro (renderizado a SQL); las rutas y la
 * pantalla se miran en el codigo. La consulta a la base se ejecuto contra
 * PRODUCCION en solo lectura (`scratch/_to_delete/medir_260.ts`): sin filtro
 * consulta 1 y deja 65.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
/** Ejecuta y devuelve 'LANZO' si revienta: un mutante que lanza tiene que dar FALLA, no abortar. */
const intenta = <T>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };
let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco se quedo colgado y no llego al final'); process.exit(1); } });

const BATCH = 'src/app/api/v1/ecf/dgii-status/batch/route.ts';
const INDIVIDUAL = 'src/app/api/v1/ecf/[id]/dgii-status/route.ts';
const LISTADO = 'src/app/api/v1/ecf/route.ts';
const PAGINA = 'src/app/dashboard/ecf/page.tsx';
const SELECCION = 'src/services/dgii/facturasParaConsultar.ts';

async function main() {
  const batch = sinComentarios(leer(BATCH));
  const individual = sinComentarios(leer(INDIVIDUAL));
  const listado = sinComentarios(leer(LISTADO));
  const pagina = sinComentarios(leer(PAGINA));
  const seleccion = sinComentarios(leer(SELECCION));
  //  Vale en los dos estados.
  if (!/getDocumentsStatusBatch\(/.test(batch) || !/const handleSyncFilteredStatus = async/.test(pagina) || !/getDocumentStatus\(/.test(individual)) {
    throw new Error('Precondicion: la consulta por lotes, la individual o el boton de la pantalla ya no estan donde estaban');
  }
  //  `@/db` crea el cliente al cargarse; sin conexion no consulta nada.
  process.env.DATABASE_URL ||= 'postgres://nadie@127.0.0.1:1/nada';

  console.log('\n1) Una consulta no deshace un veredicto definitivo\n');
  type C = typeof import('../src/services/dgii/consultaDeEstado');
  let C: C | null = null;
  try { C = await import('../src/services/dgii/consultaDeEstado'); } catch { C = null; }
  const E1 = ['una dada de baja sigue dada de baja aunque mSeller diga rechazado (E340000000002)',
    'una aceptada sigue aceptada aunque mSeller diga rechazado (E320000001014)',
    'un enviado o un rechazado si cambian con lo que se lee (un rechazado puede acabar aceptado, lote 141)',
    'al sincronizar el filtro no se consulta lo aceptado, lo dado de baja ni el borrador; si lo que espera',
    'las tandas: 250 son 100+100+50, nunca mas de 100 por consulta',
    'el aviso dice cuantas se consultaron, cuantas cambiaron y cuantas se dejaron y por que',
    '  y avisa (no felicita) si el filtro se recorto o la consulta se corto a medias'];
  if (!C) falta(E1, 'no existe services/dgii/consultaDeEstado.ts');
  else {
    const c = C;
    const t = (a: string, l: string) => intenta(() => c.estadoTrasConsultar(a, l));
    const baja = t('void', 'rejected');
    ok(E1[0], baja !== 'LANZO' && baja.estado === 'void' && baja.protegido, JSON.stringify(baja));
    const acep = t('accepted', 'rejected');
    ok(E1[1], acep !== 'LANZO' && acep.estado === 'accepted' && acep.protegido, JSON.stringify(acep));
    const casos: Array<[string, string]> = [['submitted', 'accepted'], ['submitted', 'rejected'], ['rejected', 'accepted'], ['submitted', 'submitted'], ['accepted', 'accepted']];
    ok(E1[2], casos.every(([a, l]) => { const r = t(a, l); return r !== 'LANZO' && r.estado === l && !r.protegido; }));
    const no = [...c.ESTADOS_QUE_NO_SE_SINCRONIZAN] as string[];
    ok(E1[3], ['accepted', 'void', 'draft'].every((e) => no.includes(e)) && ['submitted', 'signed', 'rejected'].every((e) => !no.includes(e)), no.join(','));
    const tandas = intenta(() => c.enTandas(Array.from({ length: 250 }, (_, i) => i)));
    const vacias = intenta(() => c.enTandas([]));
    ok(E1[4], tandas !== 'LANZO' && tandas.map((x) => x.length).join(',') === '100,100,50' && tandas.flat().join() === Array.from({ length: 250 }, (_, i) => i).join()
      && vacias !== 'LANZO' && vacias.length === 0 && c.MAXIMO_POR_CONSULTA === 100, tandas === 'LANZO' ? 'LANZO' : tandas.map((x) => x.length).join(','));
    const a1 = intenta(() => c.avisoDeSincronizacion({ consultadas: 3, cambiaron: 1, sinConsultar: 64, recortadas: 0 }));
    const a0 = intenta(() => c.avisoDeSincronizacion({ consultadas: 0, cambiaron: 0, sinConsultar: 65, recortadas: 0 }));
    ok(E1[5], a1 !== 'LANZO' && a1.tipo === 'success' && /3 comprobantes/.test(a1.texto) && /1 cambió de estado/.test(a1.texto) && /64 no se consultaron/.test(a1.texto)
      && a0 !== 'LANZO' && a0.tipo === 'info' && /Ningún comprobante del filtro espera veredicto/.test(a0.texto), a1 === 'LANZO' ? 'LANZO' : a1.texto);
    const ar = intenta(() => c.avisoDeSincronizacion({ consultadas: 500, cambiaron: 0, sinConsultar: 0, recortadas: 20 }));
    const af = intenta(() => c.avisoDeSincronizacion({ consultadas: 100, cambiaron: 2, sinConsultar: 0, recortadas: 0, fallo: 'sin red' }));
    ok(E1[6], ar !== 'LANZO' && ar.tipo === 'warning' && /quedan 20/.test(ar.texto) && af !== 'LANZO' && af.tipo === 'warning' && /se cortó a medias: sin red/.test(af.texto));
  }

  console.log('\n2) El filtro, el mismo que el listado\n');
  type F = typeof import('../src/services/dgii/filtroDelListadoEcf');
  let F: F | null = null;
  try { F = await import('../src/services/dgii/filtroDelListadoEcf'); } catch { F = null; }
  const E2 = ['el filtro del cuerpo: solo texto, sin vacios; sin objeto es null (no "todo")',
    'las condiciones salen a SQL con empresa, modo, estado, busqueda y fechas en hora de RD',
    'el listado y la consulta usan esas condiciones, sin copia propia'];
  if (!F) falta(E2, 'no existe services/dgii/filtroDelListadoEcf.ts');
  else {
    const f = F;
    const cuerpo = intenta(() => f.filtroDelCuerpo({ status: 'submitted', q: '  ', ecfType: 31, from: '2026-09-01', otro: 'x' }));
    ok(E2[0], cuerpo !== 'LANZO' && JSON.stringify(cuerpo) === JSON.stringify({ status: 'submitted', from: '2026-09-01' })
      && f.filtroDelCuerpo(undefined) === null && f.filtroDelCuerpo([]) === null && JSON.stringify(f.filtroDelCuerpo({})) === '{}', JSON.stringify(cuerpo));
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const q = intenta(() => new PgDialect().sqlToQuery(f.dondeDelFiltro({ companyId: 'EMP', modo: 'PRUEBA' }, { status: 'submitted', q: 'E31', from: '2026-09-01', to: '2026-09-30' })!));
    const p = q === 'LANZO' ? [] : q.params.map(String);
    ok(E2[1], q !== 'LANZO' && /"status" = \$/.test(q.sql) && /"ncf" ilike \$/.test(q.sql) && /"deleted_at" is null/.test(q.sql)
      && ['EMP', 'PRUEBA', 'submitted', '%E31%'].every((x) => p.includes(x))
      && q.params.some((x) => { const d = x instanceof Date ? x : new Date(String(x)); return !isNaN(+d) && d.toISOString() === '2026-09-01T04:00:00.000Z'; }), q === 'LANZO' ? 'LANZO' : `${q.sql} ${p.join('|')}`);
    ok(E2[2], /from '@\/services\/dgii\/filtroDelListadoEcf'/.test(listado) && /condicionesDelFiltro\(\s*\{ companyId: auth\.companyId, modo: auth\.modo \},\s*filtroDeParametros\(searchParams\)\s*\)/.test(listado)
      && !/ilike\(invoices\.ncf/.test(listado) && !/tiposDelFiltro/.test(listado)
      && /const delFiltro = condicionesDelFiltro\(alcance, filtro\);/.test(seleccion) && /\.where\(and\(\.\.\.delFiltro, consultable\)\)/.test(seleccion)
      && /notInArray\(invoices\.status, \[\.\.\.ESTADOS_QUE_NO_SE_SINCRONIZAN\]\)/.test(seleccion));
  }

  console.log('\n3) Las rutas\n');
  ok('la consulta por lotes acepta el filtro y lo resuelve en el servidor',
    /const filtro = Array\.isArray\(invoiceIds\) \? null : filtroDelCuerpo\(body\?\.filtro\);/.test(batch)
    && /if \(filtro\) \{[\s\S]{0,120}await facturasParaConsultar\(alcance, filtro\);/.test(batch));
  ok('  y pregunta a mSeller en tandas, guardando lo ya consultado si una tanda posterior falla',
    /for \(const tanda of enTandas\(ncfsToQuery, MAXIMO_POR_CONSULTA\)\) \{\s*const batchResult = await client\.getDocumentsStatusBatch\(tanda\);/.test(batch)
    && /if \(resultados\.length === 0\) \{[\s\S]{0,260}status: 500/.test(batch) && /resumen\.fallo = motivo;\s*break;/.test(batch)
    && /for \(const result of resultados\)/.test(batch) && !/getDocumentsStatusBatch\(ncfsToQuery\)/.test(batch));
  ok('la consulta por lotes no cambia estado ni mensaje de lo definitivo, ni toca su envio',
    /const tras = estadoTrasConsultar\(inv\.status, lectura\.estado\);\s*newStatus = tras\.estado;/.test(batch)
    && /\.\.\.\(tras\.protegido \? \{\} : \{ status: newStatus as any, dgiiMessage: displayMessage \}\)/.test(batch)
    && /const envio = tras\.protegido \? null : await envioVigente/.test(batch) && !/^\s*status: newStatus as any,\s*\n\s*dgiiMessage: displayMessage/m.test(batch));
  ok('  y la del boton de la fila tampoco',
    /const tras = estadoTrasConsultar\(invoice\.status, lectura\.estado\);\s*protegido = tras\.protegido;\s*newStatus = tras\.estado;/.test(individual)
    && /\.\.\.\(protegido \? \{\} : \{ status: newStatus as any, dgiiMessage: statusResult\.message \|\| null \}\)/.test(individual)
    && /if \(protegido\) \{\s*\} else if \(!envio\) \{/.test(individual));
  ok('cada factura dice si cambio, y la respuesta lleva cuantas se dejaron, recortaron o si se corto',
    /const cambio = newStatus !== inv\.status;/.test(batch) && /updated: updatePerformed,\s*cambio,/.test(batch) && /data: updatedResults,\s*meta: resumen,/.test(batch));

  console.log('\n4) La pantalla\n');
  const i = pagina.indexOf('const handleSyncFilteredStatus = async');
  const fn = i < 0 ? '' : pagina.slice(i, pagina.indexOf('const fetchStats', i));
  ok('"Consultar DGII" manda el FILTRO, no los ids de la pagina',
    /body: JSON\.stringify\(\{ filtro: filters \}\)/.test(fn) && !/invoiceList\.map/.test(fn) && /if \(meta\.total === 0\) return;/.test(fn));
  ok('  y se apaga solo si el filtro no tiene nada (no si la pagina esta vacia)',
    /onClick=\{handleSyncFilteredStatus\}\s*disabled=\{syncingBatch \|\| meta\.total === 0\}/.test(pagina));
  ok('las dos consultas avisan con la misma regla y leen la respuesta mirando el estado',
    (pagina.match(/avisar\(leido\.cuerpo\.data, leido\.cuerpo\.meta\);/g) ?? []).length === 2
    && /const aviso = avisoDeSincronizacion\(\{[\s\S]{0,300}cambiaron: data\.filter\(\(item\) => item\.cambio\)\.length,/.test(pagina)
    && !/Sincronización completada/.test(pagina));
  ok('los botones se llaman por lo que hacen: CONSULTAR DGII y RECARGAR LISTA',
    /<span>CONSULTAR DGII<\/span>/.test(pagina) && /<span>RECARGAR LISTA<\/span>/.test(pagina)
    && !/SINCRONIZAR DGII|ACTUALIZAR DATOS|Sincronizar Lote DGII/.test(pagina)
    && /onClick=\{fetchInvoices\}\s*title="Vuelve a leer la lista guardada; no consulta a la DGII"/.test(pagina));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
