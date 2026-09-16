/**
 * El panel de inicio avisa de los comprobantes rechazados.
 *
 * EL FALLO (lote 148)
 * -------------------
 * El aviso vivia dentro del bucle sobre `allInvoices`, pedidas con
 * `inArray(status, ['accepted', 'signed', 'submitted'])`. Una rechazada no
 * podia llegar al bucle, asi que `if (inv.status === 'rejected')` no se cumplia
 * nunca y el aviso no salio jamas. Medido el 2026-09-16: dos e-44 rechazadas en
 * PRUEBA, sin aviso.
 *
 * `getStats` consulta la base y no se ejecuta aqui; se lee su estructura con
 * los bloques de llaves emparejados.
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
/** Desde `ancla`, el bloque con llaves emparejadas. */
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

const src = fuente('src/repositories/dashboardRepository.ts');
const stats = bloque(src, "static async getStats(companyId: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {");

console.log('\n0) Precondiciones\n');
exige('se localiza getStats', stats.length > 0);
exige('la consulta de ventas sigue pidiendo solo aceptadas, firmadas y enviadas',
  /inArray\(invoices\.status, \['accepted', 'signed', 'submitted'\]\)/.test(stats));
exige('el aviso sigue siendo del tipo invoice_rejected que pinta el panel',
  /type: 'invoice_rejected' \| 'check_due'/.test(src) && /alert\.type === 'invoice_rejected'/.test(fuente('src/app/dashboard/page.tsx')));

console.log('\n1) El aviso ya no depende de una consulta que excluye las rechazadas\n');
{
  const bucleVentas = bloque(stats, 'for (const inv of allInvoices) {');
  exige('se localiza el bucle de ventas', bucleVentas.length > 0);
  ok('el bucle de ventas ya no intenta avisar de rechazadas', !/invoice_rejected/.test(bucleVentas) && !/'rejected'/.test(bucleVentas));

  ok('hay una consulta propia de rechazadas, en la empresa y el modo, sin borradas',
    /const rechazados = await db\.select\(\{[\s\S]{0,120}\}\)\.from\(invoices\)\s*\.where\(\s*withTenantMode\(\s*invoices,\s*ctx,\s*eq\(invoices\.status, 'rejected'\),\s*isNull\(invoices\.deletedAt\)\s*\)\s*\)/.test(stats));

  const bucleRechazados = bloque(stats, 'for (const inv of rechazados) {');
  ok('cada rechazada suma al contador y entra en la lista de avisos',
    /alertCount\+\+;/.test(bucleRechazados) && /type: 'invoice_rejected',/.test(bucleRechazados)
    && /actionLink: `\/dashboard\/invoices\/\$\{inv\.id\}`/.test(bucleRechazados));
  ok('y el contador que devuelve incluye esos avisos',
    //  Sin el `>= 0`, un bucle que no existe (-1) quedaba "antes" del return.
    /alertCount: alertCount \+ dueGuaranteeChecksCount/.test(stats)
    && stats.indexOf('for (const inv of rechazados) {') >= 0
    && stats.indexOf('for (const inv of rechazados) {') < stats.indexOf('return {'));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
