/**
 * Lote 228 -- "Balance Actual" de /dashboard/cash decia RD$0,00 con la caja
 * abierta.
 *
 * POR QUE
 * -------
 * El arqueo ciego del lote 172 quito el saldo esperado de `/cash/sessions/active`
 * con la caja abierta, pero la tarjeta "Balance Actual" y el pie "Total Neto en
 * Caja" siguieron leyendo ese campo y, sin el, pintaban `fmt('0')`: RD$0,00, un
 * dato FALSO. Medido el 2026-09-29: la caja abierta de Latin Doors (PRODUCCION)
 * tenia RD$328.719,58. Reportado por el dueño.
 *
 * Decision del dueño (2026-09-29): administracion y sistemas ven el saldo real;
 * el resto cuenta a ciegas y la pantalla dice que se ve al cerrar. La tarjeta
 * EFECTIVO sigue la misma regla, porque su suma ES el saldo menos el fondo.
 *
 * El banco EJECUTA la regla con los nombres de rol reales.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { leerPantallaDeCaja } from './pantallaDeCaja';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };

const PANTALLA = 'src/app/dashboard/cash/page.tsx';
const RUTA = 'src/app/api/v1/cash/sessions/active/route.ts';

async function main() {
  //  Vale en los dos estados: la regla de quien es administracion (P0-02).
  const R = await import('../src/utils/rolMatch');
  if (!R.esAdminOSistemas('administracion') || R.esAdminOSistemas('cajero')) {
    throw new Error('Precondicion: esAdminOSistemas ya no distingue administracion de cajero');
  }

  console.log('\n1) Quien ve el saldo, ejecutado\n');
  let A: typeof import('../src/services/caja/arqueoCiego') | null = null;
  try { A = await import('../src/services/caja/arqueoCiego'); } catch { A = null; }
  const E1 = ['administracion ve el saldo real', 'sistemas tambien', 'un cajero cuenta a ciegas: sin saldo',
    '  y la pantalla sabe que esta oculto', 'sin rol, a ciegas (lo prudente)', 'sin sesion, nada',
    'la regla es la de P0-02, no una copia (mayusculas y espacios)'];
  if (!A) falta(E1, 'no existe services/caja/arqueoCiego.ts');
  else {
    const abierta = { id: 's', initialBalance: '0.00', expectedBalance: '328719.58' };
    const adm = A.sesionParaMostrar(abierta, 'administracion');
    ok(E1[0], adm?.expectedBalance === '328719.58' && adm?.saldoVisible === true);
    ok(E1[1], A.sesionParaMostrar(abierta, 'sistemas')?.expectedBalance === '328719.58');
    const caj = A.sesionParaMostrar(abierta, 'cajero');
    ok(E1[2], caj !== null && caj.expectedBalance === undefined && caj.id === 's' && caj.initialBalance === '0.00');
    ok(E1[3], caj?.saldoVisible === false);
    ok(E1[4], A.sesionParaMostrar(abierta, null)?.expectedBalance === undefined && A.sesionParaMostrar(abierta, '')?.saldoVisible === false);
    ok(E1[5], A.sesionParaMostrar(null, 'administracion') === null);
    ok(E1[6], A.veElSaldoEsperado('  Administracion ') === R.esAdminOSistemas('  Administracion ')
      && A.veElSaldoEsperado('admin') === R.esAdminOSistemas('admin')
      && /import \{ esAdminOSistemas \} from '@\/utils\/rolMatch';/.test(leer('src/services/caja/arqueoCiego.ts')));
  }

  console.log('\n2) La ruta lo aplica en el servidor\n');
  const ruta = sinComentarios(leer(RUTA));
  ok('la ruta usa la regla con el rol de la sesion', /sesionParaMostrar\(activeSession, auth\.role\)/.test(ruta) && /data: paraMostrar/.test(ruta));

  console.log('\n3) La pantalla ya no pinta 0,00 donde falta el dato\n');
  //  Lote 229: la pantalla esta partida; se lee entera.
  const pant = sinComentarios(leerPantallaDeCaja(raiz));
  ok('ningun sitio pinta el saldo de la sesion abierta con un 0 de relleno',
    !/fmt\((?:c\.)?session\?\.expectedBalance \|\| '0'\)/.test(pant));
  ok('"Balance Actual": el saldo si se ve, y si no, lo dice',
    /(?:c\.)?session\?\.saldoVisible \? \(\s*<p[^>]*>\s*\{fmt\((?:c\.)?session\.expectedBalance \|\| '0'\)\}/.test(pant)
    && /\{TEXTO_SALDO_OCULTO\}/.test(pant));
  ok('"Total Neto en Caja", igual',
    /\{(?:c\.)?session\?\.saldoVisible \? fmt\((?:c\.)?session\.expectedBalance \|\| '0'\) : TEXTO_SALDO_OCULTO\}/.test(pant));
  ok('la tarjeta EFECTIVO no da hecha la suma a quien cuenta a ciegas',
    /amount: (?:c\.)?session\?\.saldoVisible\s*\?/.test(pant) && /card\.amount === null \? '—' : fmt\(card\.amount\)/.test(pant));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
