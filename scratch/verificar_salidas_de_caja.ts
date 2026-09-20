/**
 * Lote 169 -- lo que mueve la Caja General del mayor se ve tambien en la
 * sesion de caja abierta.
 *
 * EL HUECO
 * --------
 * Las ventas y los cobros en efectivo pasaban por la sesion; las SALIDAS no.
 * Medido el 2026-09-19 en Latin Doors: 86 compras en efectivo (904.351,51) y
 * 2 pagos a suplidores en efectivo (30.679,84) bajaron la caja del mayor sin
 * tocar la sesion, y llevar efectivo al banco tampoco. La sesion cerrada ese
 * dia "esperaba" 2.204.992,49 con 85.000,00 reales.
 *
 * LO QUE SE COMPRUEBA
 * -------------------
 * 1. `movimientoDeCaja`, EJECUTANDOLA.
 * 2. El cableado: compra (alta en ruta y servicio, edicion, borrado), pago a
 *    suplidor y movimiento de banco miden el efecto en la caja del mayor y lo
 *    reflejan; en edicion y borrado, solo la DIFERENCIA.
 * 3. La sesion: la propia, o la unica abierta; si no, se niega.
 *
 * Solo codigo. La ejecucion contra una base: `verificar_salidas_de_caja_db.ts`
 * (integracion, en la base desechable).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente, bloque } from './_fuente';

// El modulo importa `@/db`, que exige DATABASE_URL al cargarse. Una que no
// conecta a nada: este banco no toca ninguna base.
process.env.DATABASE_URL = 'postgres://banco:banco@127.0.0.1:1/banco_sin_base';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const RAIZ = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(RAIZ, r)) ? fuente(r) : '');
type Mod = typeof import('../src/services/caja/efectivoDeCaja');

async function main() {
  let m: Mod | null = null;
  try { m = await import('../src/services/caja/efectivoDeCaja'); } catch { m = null; }
  const mov = (x: number) => (m ? m.movimientoDeCaja(x) : undefined);

  console.log('\n1) De cambio en el mayor a movimiento de caja\n');
  ok('la caja del mayor bajo 1.500: SALIDA de 1.500', JSON.stringify(mov(-1500)) === JSON.stringify({ tipo: 'cash_out', monto: 1500 }), JSON.stringify(mov(-1500)));
  ok('subio 250,50: ENTRADA de 250,50', JSON.stringify(mov(250.5)) === JSON.stringify({ tipo: 'cash_in', monto: 250.5 }));
  ok('no cambio: nada (ni siquiera se busca sesion)', mov(0) === null);
  ok('en centavos: 0,1 + 0,2 - 0,3 es cero, no un movimiento de 0,00000000000000006', mov(0.1 + 0.2 - 0.3) === null);
  ok('un cambio ilegible no mueve nada', mov(Number.NaN) === null);

  console.log('\n2) Cada camino refleja su efecto en la caja\n');
  const EFE = leer('src/services/caja/efectivoDeCaja.ts');
  const efecto = bloque(EFE, 'export async function efectoEnCajaDeDocumento(');
  // Lote 170: el CALCULO (asiento + sus reversiones, sobre una cuenta) subio a
  // `services/contabilidad/efectoEnCuenta.ts`, porque el banco lo necesita
  // igual. Aqui se comprueba la propiedad en los dos sitios: que la caja pide
  // la cuenta por la clave `cash` y delega, y que el calculo comun sigue
  // sumando el asiento Y sus reversiones sobre la cuenta pedida.
  const CALC = bloque(leer('src/services/contabilidad/efectoEnCuenta.ts'), 'export async function efectoEnCuentaDeDocumento(');
  ok('el efecto se mide en la cuenta de efectivo (clave cash) sobre el asiento Y sus reversiones',
    /resolverCuentaPorMapeo\(tx, companyId, 'cash', '1\.1\.01\.01'/.test(efecto)
    && /efectoEnCuentaDeDocumento\(tx, companyId, modo, documentoId, caja\.id\)/.test(efecto)
    && /const referencias = \[documentoId, \.\.\.\w+\.map\(/.test(CALC)
    && /inArray\(journalEntries\.reference, referencias\)/.test(CALC)
    && /eq\(journalEntryLines\.accountId, accountId\)/.test(CALC));
  // Hasta el final: `bloque()` tomaria las llaves del tipo del parametro.
  const reflejar = EFE.slice(EFE.indexOf('export async function reflejarEnCaja('));
  ok('reflejar: sin cambio no busca sesion; con cambio, apunta en la sesion',
    reflejar.indexOf('if (!mov) return;') > 0 && reflejar.indexOf('if (!mov) return;') < reflejar.indexOf('sesionParaEfectivo(')
    && /CashRepository\.addMovement\(tx, \{[\s\S]*type: mov\.tipo,[\s\S]*amount: mov\.monto,/.test(reflejar));

  const ALTA = leer('src/app/api/v1/expenses/route.ts');
  ok('alta de compra (ruta): refleja el efecto de su asiento, y solo si se pago en efectivo (01)',
    /\n\s*if \(paymentMethod === '01'\) await reflejarEnCaja\(tx, \{[\s\S]*?referencia: newExpenseId,[\s\S]*?cambioEnCaja: await efectoEnCajaDeDocumento\(tx, session\.companyId, session\.modo, newExpenseId\),/.test(ALTA)
    && ALTA.indexOf('reflejarEnCaja(') > ALTA.lastIndexOf('AccountRepository.createJournalEntry('));
  const SVC = leer('src/services/expenseService.ts');
  ok('alta de compra (servicio): lo mismo, y solo el metodo 01',
    /\n\s*if \(expenseData\.paymentMethod === '01'\) await reflejarEnCaja\(tx, \{[\s\S]*?referencia: expense\.id,[\s\S]*?cambioEnCaja: await efectoEnCajaDeDocumento\(tx, expenseData\.companyId, expenseData\.modo, expense\.id\),/.test(SVC)
    && SVC.indexOf('reflejarEnCaja(') > SVC.indexOf('AccountRepository.createJournalEntry('));

  const ED = leer('src/app/api/v1/expenses/[id]/route.ts');
  const put = ED.slice(ED.indexOf('export async function PUT'));
  const del = ED.slice(ED.indexOf('export async function DELETE'), ED.indexOf('export async function PUT'));
  ok('edicion: mide ANTES de revertir y refleja solo la DIFERENCIA',
    /const cajaAntesPut = await efectoEnCajaDeDocumento\(tx, session\.companyId, session\.modo, id\);/.test(put)
    && put.indexOf('const cajaAntesPut') < put.indexOf('revertirAsientoContable(')
    && /if \(paymentMethod === '01' \|\| existing\[0\]\.paymentMethod === '01'\) await reflejarEnCaja\(/.test(put)
    && /cambioEnCaja: \(await efectoEnCajaDeDocumento\(tx, session\.companyId, session\.modo, id\)\) - cajaAntesPut,/.test(put)
    && put.indexOf('- cajaAntesPut') > put.lastIndexOf('AccountRepository.createJournalEntry('));
  ok('borrado: mide ANTES de revertir y devuelve a la caja lo que la reversion devolvio al mayor',
    /const cajaAntes = await efectoEnCajaDeDocumento\(tx, session\.companyId, session\.modo, id\);/.test(del)
    && del.indexOf('const cajaAntes') < del.indexOf('revertirAsientoContable(')
    && /if \(expenseRow\.paymentMethod === '01'\) await reflejarEnCaja\(/.test(del)
    && /cambioEnCaja: \(await efectoEnCajaDeDocumento\(tx, session\.companyId, session\.modo, id\)\) - cajaAntes,/.test(del)
    && del.indexOf('- cajaAntes') > del.lastIndexOf('revertirAsientoContable('));

  const AP = leer('src/services/apService.ts');
  const reg = bloque(AP, 'static async registerPayment(');
  ok('pago a suplidor: refleja el efecto de su asiento (por banco es cero)',
    /\n\s*await reflejarEnCaja\(tx, \{[\s\S]*?referencia: payment\.id,[\s\S]*?cambioEnCaja: await efectoEnCajaDeDocumento\(tx, input\.companyId, input\.modo, payment\.id\),/.test(reg)
    && reg.indexOf('reflejarEnCaja(') > reg.lastIndexOf('AccountRepository.createJournalEntry('));
  const BK = leer('src/repositories/bankRepository.ts');
  const rt = BK.slice(BK.indexOf('static async registerTransaction('));
  ok('movimiento de banco: refleja el efecto en caja (deposito desde caja, retiro a caja)',
    /\n\s*await reflejarEnCaja\(tx, \{[\s\S]*?referencia: txId,[\s\S]*?cambioEnCaja: await efectoEnCajaDeDocumento\(tx, data\.companyId, data\.modo, txId\),/.test(rt)
    && rt.indexOf('reflejarEnCaja(') > rt.indexOf('AccountRepository.createJournalEntry('));

  console.log('\n3) La sesion\n');
  const ses = bloque(EFE, 'export async function sesionParaEfectivo(');
  ok('busca las abiertas de la empresa y el entorno',
    /eq\(cashSessions\.companyId, companyId\), eq\(cashSessions\.modo, modo\), eq\(cashSessions\.status, 'open'\)/.test(ses));
  ok('primero la del usuario, si no la unica abierta',
    ses.indexOf('if (propia) return propia.id;') > 0 && ses.indexOf('if (propia)') < ses.indexOf('if (abiertas.length === 1) return abiertas[0].id;'));
  ok('sin ninguna, o con varias ajenas, se niega (abra caja primero)',
    /if \(abiertas\.length === 0\) \{\s*throw new Error\('No hay una caja abierta/.test(ses) && /cajas abiertas y ninguna es suya/.test(ses));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
