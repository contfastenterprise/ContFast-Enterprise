/**
 * Banco del lote 137: un movimiento bancario no puede mover el saldo sin
 * llegar al mayor -- y fuera la ruta gemela que contabilizaba contra un banco
 * que no existe.
 *
 *     pnpm exec tsx scratch/verificar_banco_al_mayor.ts
 *
 * DOS COSAS, MEDIDAS EL 2026-09-15 contra la base (solo lectura):
 *
 * 1. EL SALDO SE MOVIA SIN ASIENTO. `BankRepository.registerTransaction` ajusta
 *    el saldo en el paso 3 y asienta en el paso 4, pero el paso 4 entero
 *    colgaba de un `if (data.contraAccountId)` y el parametro era opcional en
 *    el esquema de la ruta. Sin contrapartida: saldo movido, mayor sin
 *    enterarse, y ni un error. Las 8 transacciones bancarias de la empresa que
 *    opera -- RD$3,99 M, SEIS de ellas ya marcadas como conciliadas -- no
 *    tienen asiento ninguno. Es el mismo defecto (b) que el propio fichero
 *    documenta ("el `if` se saltaba el asiento EN SILENCIO"), arreglado para
 *    el caso de la cuenta contable ausente y abierto para este.
 *
 *    El formulario ya la exige (`<select required>`), asi que esto no cierra
 *    nada que hoy funcione: cierra la puerta de atras.
 *
 * 2. HABIA UNA RUTA GEMELA, `bank/accounts/[id]/transactions`, QUE NO LLAMABA
 *    NADIE. Resolvia el banco por el codigo FIJO '1.1.01.02' -- las cuentas
 *    bancarias reales de la empresa apuntan a 1.1.01.03 (Banreservas) y
 *    1.1.01.04 (Scotiabank), y 1.1.01.02 "Banco Popular" tiene CERO renglones
 *    --, y creaba al vuelo `4.1.99` y `6.1.99`, que no existen en ninguna de
 *    las seis empresas, con `nature` y `level` por defecto. Se retiro entera;
 *    con ella se va la ULTIMA copia de `getOrCreateAccount` del arbol.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));

const REPO = 'src/repositories/bankRepository.ts';
const RUTA = 'src/app/api/v1/bank/transactions/route.ts';
const PANTALLA = 'src/app/dashboard/bank/page.tsx';
const GEMELA = 'src/app/api/v1/bank/accounts/[id]/transactions/route.ts';
const RESOLVER = 'src/services/accounting/resolverCuentas.ts';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
{
  const repo = codigo(REPO);
  //  Lo que hace que el hueco importe: el saldo SI se mueve, siempre.
  exige(/await BankRepository\.ajustarSaldo\(/.test(repo),
        'registerTransaction ya no ajusta el saldo: el lote pierde su motivo');
  //  Y el asiento sigue pasando por el motor central, con sus validaciones.
  exige(/AccountRepository\.createJournalEntry\(tx, \{/.test(repo),
        'el movimiento bancario ya no asienta por el motor central');
  //  El formulario ya exigia la contrapartida: por eso esto no rompe nada.
  exige(/<select required value=\{txForm\.contraAccountId\}/.test(codigo(PANTALLA)),
        'el formulario de banco ya no exige la contrapartida');
  //  El resolvedor no crea cuentas: por eso la ruta gemela sobraba.
  exige(!/\.insert\(chartOfAccounts\)/.test(codigo(RESOLVER)), 'el resolvedor ahora crea cuentas');

  //  Lo que el camino BUENO ya hacia bien antes de este lote, y que es la razon
  //  de que la ruta gemela sobrara. Va de PRECONDICION, no de comprobacion: se
  //  cumplia igual antes, asi que como `ok()` regalaria OKs en la contraprueba.
  //  Como precondicion sirve: si alguien lo deshace, el banco revienta y hay
  //  que mirarlo.
  const crear = bloque(repo, 'static async registerTransaction(');
  exige(/account\.chartAccountId/.test(crear) && !/'1\.1\.01\.02'/.test(crear),
        'el asiento del banco ya no sale de bank_accounts.chart_account_id');
  exige(/account\.chartAccountId === data\.contraAccountId/.test(crear),
        'ya no se rechaza que la contrapartida sea la misma cuenta del banco');
  exige(/if \(!cuenta\.isTransactional\)/.test(crear),
        'el movimiento bancario ya no exige cuentas transaccionales');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. SIN CONTRAPARTIDA NO SE MUEVE EL BANCO');
// ─────────────────────────────────────────────────────────────────────────
{
  const repo = codigo(REPO);
  ok('el repositorio se para en vez de mover el saldo y callarse',
     /if \(!data\.contraAccountId\) \{\s*throw new Error\(/.test(repo));
  ok('y el asiento ya no cuelga de un `if` que se pueda no cumplir',
     !/if \(data\.contraAccountId\) \{/.test(repo));
  ok('el tipo de entrada la pide: ya no es opcional',
     /contraAccountId: string;/.test(repo) && !/contraAccountId\?: string/.test(repo));
  ok('y la ruta tampoco la acepta ausente',
     /contraAccountId: z\.string\(\)\.uuid\(\{/.test(codigo(RUTA))
     && !/contraAccountId: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(codigo(RUTA)));
}

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LA RUTA GEMELA YA NO ESTA');
// ─────────────────────────────────────────────────────────────────────────
function ficherosTs(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) ficherosTs(p, acc);
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}
{
  //  Una ausencia sola seria cierta de balde, asi que va pegada a las marcas
  //  del estado posterior: nadie la llama, y lo que vivia dentro tampoco esta
  //  en ningun otro sitio.
  ok('el fichero no existe',
     !fs.existsSync(GEMELA));
  ok('y no queda ninguna copia de getOrCreateAccount en todo el arbol',
     ficherosTs('src').filter((f) =>
       f !== RESOLVER && !f.startsWith('src/tests/')
       && /(async function|static async)\s+getOrCreateAccount/.test(codigo(f))
     ).length === 0);
  ok('ni nadie que cree al vuelo 4.1.99 / 6.1.99, que no existen en ninguna empresa',
     ficherosTs('src').filter((f) => /'4\.1\.99'|'6\.1\.99'/.test(codigo(f))).length === 0);
  ok('ni ninguna pantalla que llame a esa ruta',
     ficherosTs('src').filter((f) => /bank\/accounts\/[^'"`]*\/transactions/.test(codigo(f))).length === 0);
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
