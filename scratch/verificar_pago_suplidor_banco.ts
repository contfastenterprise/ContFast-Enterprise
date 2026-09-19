/**
 * Lote 163 -- un pago a suplidor por transferencia o cheque sale del banco:
 * mueve su saldo y queda en su libro.
 *
 * EL HUECO
 * --------
 * `registerPayment` asentaba el pago (debe CxP, haber la cuenta que eligiera
 * la pantalla) pero no tocaba el banco: ni el saldo ni el libro. La
 * transferencia ni mandaba la cuenta bancaria. Medido el 2026-09-19 en Latin
 * Doors PRODUCCION: 1 transferencia de RD$6.923,52 (06/08) sin movimiento de
 * banco. El cobro de un cheque en garantia SI movia el banco: el mismo pago
 * aparecia o no segun el camino. Criterio del lote 151 para los cobros.
 *
 * LO QUE SE COMPRUEBA
 * -------------------
 * 1. La regla (`services/cxp/cuentaDelPago.ts`), EJECUTANDOLA.
 * 2. El servicio: valida banco y cuenta ANTES de escribir nada (tambien para
 *    el cheque en garantia), y despues del asiento baja el saldo y crea el
 *    retiro pendiente -- solo si hay banco, y no en la garantia.
 * 3. La pantalla: la transferencia elige banco y lo envia; se valida lo que se
 *    envia; la cuenta de credito la dicta el banco; el aviso de efectivo ya no
 *    promete un movimiento de caja.
 *
 * Solo codigo: no toca base de datos.
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

type Mod = typeof import('../src/services/cxp/cuentaDelPago');

async function main() {
  let m: Mod | null = null;
  try { m = await import('../src/services/cxp/cuentaDelPago'); } catch { m = null; }
  const pago = (metodo: string, banco: string | null) => (m ? m.motivoParaNoRegistrarPago(metodo, banco) : undefined);
  const cuenta = (credito: string, chart: string | null) =>
    m ? m.motivoCuentaDelBanco(credito, { chartAccountId: chart, bankName: 'Scotiabank', accountNumber: '03219801680' }) : undefined;

  console.log('\n1) La regla\n');
  ok('la transferencia y el cheque salen del banco; el efectivo no',
    !!m && m.saleDelBanco('transfer') && m.saleDelBanco('check') && !m.saleDelBanco('cash'));
  ok('transferencia sin banco: no se registra', typeof pago('transfer', null) === 'string', String(pago('transfer', null)));
  ok('cheque sin banco: no se registra', typeof pago('check', undefined as unknown as null) === 'string');
  ok('transferencia con banco: se registra', pago('transfer', 'b1') === null);
  ok('efectivo sin banco: se registra', pago('cash', null) === null);
  ok('efectivo CON banco: se niega (contradictorio)', typeof pago('cash', 'b1') === 'string' && /efectivo/.test(pago('cash', 'b1') ?? ''));
  ok('cuenta de credito = la del banco: cuadra', cuenta('c-scotia', 'c-scotia') === null);
  ok('cuenta de credito distinta: se niega, nombrando el banco',
    typeof cuenta('c-caja', 'c-scotia') === 'string' && /Scotiabank 03219801680/.test(cuenta('c-caja', 'c-scotia') ?? ''));
  ok('banco sin cuenta contable: se niega', typeof cuenta('c-scotia', null) === 'string' && /no tiene cuenta contable/.test(cuenta('c-scotia', null) ?? ''));

  console.log('\n2) El servicio\n');
  const SVC = leer('src/services/apService.ts');
  ok('importa la regla', /import \{ motivoParaNoRegistrarPago, motivoCuentaDelBanco \} from '@\/services\/cxp\/cuentaDelPago'/.test(SVC));
  const reg = bloque(SVC, 'static async registerPayment(');
  {
    const iRegla = reg.search(/motivoParaNoRegistrarPago\(input\.paymentMethod, input\.bankAccountId\)/);
    const iCuenta = reg.search(/motivoCuentaDelBanco\(input\.creditAccountId, banco\)/);
    const iGarantia = reg.indexOf('if (input.isGuarantee)');
    const iPrimerEscrito = Math.min(...['ApRepository.createCheck(', 'ApRepository.createPayment(', 'tx.insert('].map((s) => {
      const i = reg.indexOf(s); return i < 0 ? Infinity : i;
    }));
    ok('valida banco y cuenta ANTES de escribir nada', iRegla > 0 && iCuenta > iRegla && iCuenta < iPrimerEscrito, `${iRegla} < ${iCuenta} < ${iPrimerEscrito}`);
    ok('  y antes de separar la garantia (que tambien queda validada)', iCuenta > 0 && iCuenta < iGarantia, `${iCuenta} < ${iGarantia}`);
    ok('  los motivos se lanzan', /if \(motivoBanco\) \{\s*throw new Error\(motivoBanco\);/.test(reg) && /if \(motivoCuenta\) \{\s*throw new Error\(motivoCuenta\);/.test(reg));
    ok('  el banco se busca en ESTA empresa',
      /\.from\(bankAccounts\)\s*\.where\(and\(eq\(bankAccounts\.id, input\.bankAccountId\), eq\(bankAccounts\.companyId, input\.companyId\)\)\)/.test(reg)
      && /if \(!banco\) \{\s*throw new Error\(/.test(reg));

    // El movimiento de banco: despues del asiento del pago inmediato, solo con banco.
    const iAsiento = reg.lastIndexOf('AccountRepository.createJournalEntry(');
    const conBanco = bloque(reg.slice(iAsiento), /if \(banco\) /);
    ok('tras el asiento, con banco: baja el saldo de ese banco en este entorno',
      iAsiento > 0 && /BankRepository\.ajustarSaldo\(banco\.id, input\.companyId, input\.modo, -input\.amount, tx\)/.test(conBanco));
    ok('  y crea el retiro en su libro, pendiente de conciliar',
      /tx\.insert\(bankTransactions\)\.values\(\{[\s\S]*?bankAccountId: banco\.id,[\s\S]*?type: 'withdrawal',[\s\S]*?amount: input\.amount\.toString\(\),[\s\S]*?status: 'pending',/.test(conBanco));
    ok('  con la referencia del cheque o la del estado de cuenta (PAG-...)',
      /reference: input\.checkNumber \|\| `PAG-\$\{payment\.id\.slice\(0, 8\)\}`/.test(conBanco));
    ok('  en el entorno y la empresa del pago', /companyId: input\.companyId,\s*modo: input\.modo,/.test(conBanco));
    // Una negacion sola es verdad de balde antes del lote (la garantia nunca
    // movio el banco; la contraprueba lo regalaba). Va unida a la marca del
    // estado posterior: el pago inmediato SI lo mueve, y la garantia no.
    ok('la garantia NO mueve el banco al registrarse (lo mueve su cobro), aunque el pago inmediato si',
      (() => {
        const g = bloque(reg, 'if (input.isGuarantee)');
        return g !== '' && !/ajustarSaldo|bankTransactions/.test(g) && /BankRepository\.ajustarSaldo\(banco\.id/.test(conBanco);
      })());
  }

  console.log('\n3) La pantalla\n');
  const PAG = leer('src/app/dashboard/ap/page.tsx');
  ok('importa la regla', /import \{ saleDelBanco, motivoParaNoRegistrarPago \} from '@\/services\/cxp\/cuentaDelPago'/.test(PAG));
  const enviar = bloque(PAG, 'const handleSubmitPayment = async');
  ok('se valida y se envia el MISMO banco (el que viaja)',
    /const bancoQueViaja = saleDelBanco\(paymentForm\.paymentMethod\) \? \(paymentForm\.bankAccountId \|\| null\) : null;/.test(enviar)
    && /motivoParaNoRegistrarPago\(paymentForm\.paymentMethod, bancoQueViaja\)/.test(enviar)
    && /bankAccountId: bancoQueViaja \?\? undefined,/.test(enviar));
  ok('  y el motivo para: sin el no se envia',
    /if \(motivoBanco\) \{\s*toast\.error\(motivoBanco\);\s*return;\s*\}/.test(enviar)
    && enviar.search(/if \(motivoBanco\)/) < enviar.indexOf("fetch('/api/v1/ap/payments'"));
  ok('  ya no se envia el banco solo con el cheque', !/bankAccountId: paymentForm\.paymentMethod === 'check'/.test(PAG));
  const modal = PAG.slice(PAG.indexOf('<form onSubmit={handleSubmitPayment}'));
  const transfer = bloque(modal, "{paymentForm.paymentMethod === 'transfer' && (");
  ok('la transferencia tiene su selector de banco, que arrastra la cuenta contable',
    /value=\{paymentForm\.bankAccountId\}/.test(transfer)
    && /creditAccountId: cuentaDeSalida\(paymentForm\.paymentMethod, e\.target\.value\)/.test(transfer)
    && /bankAccountsList\.map/.test(transfer));
  ok('la cuenta de credito la dicta el banco (bloqueada si el pago sale del banco)',
    /disabled=\{saleDelBanco\(paymentForm\.paymentMethod\)\}\s*value=\{paymentForm\.creditAccountId\}/.test(modal));
  // Lote 163 corrigio un aviso que prometia un movimiento de caja que no se
  // creaba. El lote 169 lo crea de verdad, y el aviso lo dice: lo que se vigila
  // es que el aviso diga lo que pasa, no la frase de cada momento.
  ok('el aviso de efectivo dice lo que pasa con la caja',
    !/afectará el balance esperado de su sesión actual/.test(PAG)
    && /se registra como salida en la sesión de caja abierta/.test(PAG)
    && /reflejarEnCaja\(/.test(leer('src/services/apService.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
