/**
 * Lote 162 -- un cheque en garantia no se cobra contra una factura que ya no
 * debe su importe.
 *
 * EL HUECO
 * --------
 * `confirmarCobroDeChequesEnGarantia` y `applySingleGuaranteeCheck` marcaban el
 * cheque cobrado, lo asentaban ENTERO (banco, mayor, estado de cuenta) y solo
 * despues miraban el saldo: si la factura ya se habia pagado por otra via,
 * rebajaban lo que quedaba (`Math.min`) y devolvian el resto como "descuadre".
 * El pago quedaba dos veces en los libros. Paso el 2026-09-19 con el cheque
 * 120 de EVERLAST DOORS (corregido en datos a mano; este lote cierra el hueco).
 *
 * LO QUE SE COMPRUEBA
 * -------------------
 * 1. `motivoParaNoCobrar`, EJECUTANDOLA.
 * 2. Los dos caminos del servicio: la comprobacion va bajo bloqueo y ANTES de
 *    marcar el cheque cobrado, y ya no se recorta lo aplicado.
 *
 * Solo codigo: no toca base de datos. (Contra una base, esto lo cubriria un
 * banco de integracion: ver `scratch/bancos_db/`.)
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const RAIZ = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(RAIZ, r)) ? fuente(r) : '');

type Mod = typeof import('../src/services/cxp/cobroDeGarantia');

async function main() {
  let m: Mod | null = null;
  try { m = await import('../src/services/cxp/cobroDeGarantia'); } catch { m = null; }
  const motivo = (i: string | number, s: string | number): string | null | undefined => (m ? m.motivoParaNoCobrar(i, s) : undefined);

  console.log('\n1) Cuando se puede cobrar y cuando no\n');
  ok('cheque igual al saldo: se cobra', motivo('78381.82', '78381.82') === null, String(motivo('78381.82', '78381.82')));
  ok('cheque menor que el saldo: se cobra', motivo('500', '1000.00') === null);
  const saldada = motivo('78381.82', '0.00');
  ok('el caso del cheque 120 (factura en 0): NO se cobra', typeof saldada === 'string' && saldada.length > 0, String(saldada));
  ok('  y el motivo dice que ya esta saldada y que se asentaria dos veces',
    /saldada/.test(saldada ?? '') && /segunda vez/.test(saldada ?? '') && /78,381\.82/.test(saldada ?? ''), String(saldada));
  const parcial = motivo('1000', '400');
  ok('saldo menor que el cheque: NO se cobra', typeof parcial === 'string', String(parcial));
  ok('  y el motivo da las dos cifras', /400\.00/.test(parcial ?? '') && /1,000\.00/.test(parcial ?? ''), String(parcial));
  ok('un centavo de mas ya no cabe', typeof motivo('100.01', '100') === 'string');
  ok('en centavos: 19,99 cabe justo en 19,99 (sin error de coma flotante)', motivo(19.99, '19.99') === null);
  // El caso anterior arrastra el MISMO error por los dos lados y un mutante sin
  // redondeo sobrevivio. Un importe calculado (0,1 + 0,2 = 0,30000000000000004)
  // frente al saldo escrito 0,30 si lo separa.
  ok('en centavos: un importe calculado 0,1 + 0,2 cabe en un saldo de 0,30', motivo(0.1 + 0.2, '0.30') === null,
    String(motivo(0.1 + 0.2, '0.30')));
  ok('importe ilegible: no se cobra', typeof motivo('abc', '100') === 'string');
  ok('importe 0 o negativo: no se cobra', typeof motivo('0', '100') === 'string' && typeof motivo('-5', '100') === 'string');

  console.log('\n2) Los dos caminos del servicio\n');
  const SVC = leer('src/services/apService.ts');
  ok('el servicio importa la regla', /import \{ motivoParaNoCobrar \} from '@\/services\/cxp\/cobroDeGarantia'/.test(SVC));

  const lote = bloque(SVC, 'static async confirmarCobroDeChequesEnGarantia(');
  {
    const iBloqueo = lote.indexOf('ApRepository.bloquearAp(');
    const iMotivo = lote.search(/motivoParaNoCobrar\(payment\.amount, apBloqueada\.balance\)/);
    const iMarca = lote.indexOf('marcarChequeCobrado(');
    ok('varios cheques: bloquea la factura, comprueba y DESPUES marca el cheque',
      iBloqueo > 0 && iMotivo > iBloqueo && iMarca > iMotivo, `${iBloqueo} < ${iMotivo} < ${iMarca}`);
    ok('  el cheque que no cabe queda en noAplicados con su motivo y se salta',
      /if \(motivo\) \{\s*noAplicados\.push\(\{ checkId: check\.id, cheque: check\.checkNumber, motivo \}\);\s*continue;\s*\}/.test(lote));
    ok('  sin factura bloqueada tampoco se cobra', /apBloqueada\s*\?\s*motivoParaNoCobrar\([^)]*\)\s*:\s*'[^']+'/.test(lote));
    ok('  ya no recorta lo aplicado', !/Math\.min\(amountNum/.test(lote) && /updateApBalance\(tx, ap\.id, companyId, saldoActual - amountNum\)/.test(lote));
  }

  const uno = bloque(SVC, 'static async applySingleGuaranteeCheck(');
  {
    const iBloqueo = uno.indexOf('ApRepository.bloquearAp(');
    const iMotivo = uno.search(/motivoParaNoCobrar\(payment\.amount, ap\.balance\)/);
    const iMarca = uno.indexOf('marcarChequeCobrado(');
    ok('un cheque: bloquea la factura, comprueba y DESPUES marca el cheque',
      iBloqueo > 0 && iMotivo > iBloqueo && iMarca > iMotivo, `${iBloqueo} < ${iMotivo} < ${iMarca}`);
    ok('  y si no cabe, lanza 409 con el motivo (nada se escribe: es una transaccion)',
      /if \(motivo\) \{\s*throw Object\.assign\(new Error\(motivo\), \{ status: 409, code: 'FACTURA_YA_PAGADA' \}\);\s*\}/.test(uno));
    ok('  ya no recorta lo aplicado', !/Math\.min\(amountNum/.test(uno) && /updateApBalance\(tx, ap\.id, companyId, apBalance - amountNum\)/.test(uno));
  }

  // Precondicion (cierta antes y despues del lote): sin ella el 409 llegaria
  // a la pantalla como un 500 generico.
  const RUTA = leer('src/app/api/v1/ap/payments/apply-guarantees/route.ts');
  if (!(/const status = e\.status \|\| 500;/.test(RUTA) && /const code = e\.code \|\| 'SERVER_ERROR';/.test(RUTA))) {
    throw new Error('PRECONDICION ROTA: la ruta de cobro ya no devuelve el status y el code del error');
  }
  console.log('  pre   la ruta devuelve el estado y el codigo del error');

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
