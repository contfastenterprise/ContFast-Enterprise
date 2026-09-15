/**
 * Banco del lote 122: confirmar el cobro de cheques en garantia DICE que se va
 * a asentar antes de asentarlo.
 *
 *     pnpm exec tsx scratch/verificar_confirmar_cobro_garantias.ts
 *
 * EL HUECO
 * --------
 * En Cuentas por Pagar > Garantias, "Confirmar cobro (n)" llamaba directo a
 * `/api/v1/ap/payments/apply-guarantees`. Eso ASIENTA: registra la salida del
 * banco y rebaja la cuenta por pagar de cada cheque, CON LA FECHA DE COBRO del
 * selector. Una fecha equivocada (el valor por defecto, un dia de otro mes)
 * cae en otro periodo contable, y nada lo enseñaba antes de escribir.
 *
 * La otra puerta que aplica cheques en garantia (compras >
 * GuaranteeChecksView) si pide confirmacion con el dialogo del sistema; esta
 * no. Marcar los cheques uno a uno ayuda, pero no dice cuanto dinero ni con
 * que fecha.
 *
 * EL ARREGLO
 * ----------
 * Antes del fetch, `useConfirm` con lo que se va a asentar: cuantos cheques,
 * el total y la fecha de cobro en dd-MM-aaaa. Cancelar no toca nada (y no deja
 * el boton en "Procesando...": el estado de carga se enciende DESPUES).
 */
import fs from 'fs';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

const AP = 'src/app/dashboard/ap/page.tsx';
const GV = 'src/app/dashboard/purchases/components/GuaranteeChecksView.tsx';
const src = codigo(AP);

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(src.length > 20_000, `No se pudo leer ${AP}`);
exige(src.includes('const handleConfirmarCobros = async () => {'), 'handleConfirmarCobros ya no existe');
exige(src.includes("fetch('/api/v1/ap/payments/apply-guarantees', {"), 'la pantalla ya no llama a apply-guarantees');
exige(src.includes('body: JSON.stringify({ checkIds: chequesConfirmados, fechaCobro })'),
      'ya no se manda la fecha de cobro: el motivo del dialogo cambia');
exige(src.includes('onClick={handleConfirmarCobros}'), 'el boton ya no llama a handleConfirmarCobros');
//  La otra puerta ya confirma: es el modelo.
exige(codigo(GV).includes('const confirm = useConfirm();') && codigo(GV).includes("title: 'Aplicar cheque contablemente'"),
      'GuaranteeChecksView ya no confirma: revisar el modelo');

const handler = bloque(src, 'const handleConfirmarCobros = async () => {');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. SE PREGUNTA ANTES DE ASENTAR');
// ─────────────────────────────────────────────────────────────────────────
ok('la pantalla importa useConfirm del proveedor del sistema',
   /import \{[^}]*\buseConfirm\b[^}]*\} from '@\/providers\/confirm-provider'/.test(src));
ok('y lo usa dentro del componente',
   /export default function AccountsPayablePage\(\) \{[\s\S]{0,300}?const confirm = useConfirm\(\);/.test(src));
ok('el dialogo va ANTES del fetch que asienta',
   handler.includes('await confirm({')
   && handler.indexOf('await confirm({') < handler.indexOf("fetch('/api/v1/ap/payments/apply-guarantees'"));
ok('y cancelar sale sin asentar',
   /if \(!confirmado\) return;/.test(handler)
   && handler.indexOf('if (!confirmado) return;') < handler.indexOf("fetch('/api/v1/ap/payments/apply-guarantees'"));
//  Con indexOf -1 (sin la guarda) la comparacion daba OK antes del lote: se
//  exige que la guarda exista.
ok('el "Procesando..." se enciende DESPUES de confirmar, no antes',
   handler.indexOf('if (!confirmado) return;') >= 0
   && handler.indexOf('if (!confirmado) return;') < handler.indexOf('setApplyingGuarantees(true);'));
//  La negacion sola era cierta de balde: se ata a que el dialogo propio exista.
ok('con el dialogo del sistema, no window.confirm',
   handler.includes('await confirm({') && !/window\.confirm\(/.test(src));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. EL DIALOGO DICE LO QUE SE VA A ASENTAR');
// ─────────────────────────────────────────────────────────────────────────
ok('suma el importe de los cheques marcados',
   /const seleccionados = pendingGuarantees\.filter\(\(p\) => !!p\.checkId && chequesConfirmados\.includes\(p\.checkId\)\);/.test(handler)
   && /const total = seleccionados\.reduce\(\(s, p\) => s \+ \(Number\(p\.amount\) \|\| 0\), 0\);/.test(handler));
ok('y lo enseña: cuantos, el total y la fecha de cobro',
   /\$\{seleccionados\.length\}/.test(handler) && /\$\{fmt\(total\)\}/.test(handler)
   && /\$\{formatDateDisplay\(fechaCobro\)\}/.test(handler));
ok('con la fecha en el formato de las pantallas',
   /import \{[^}]*\bformatDateDisplay\b[^}]*\} from '@\/utils\/fechasLocales'/.test(src));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
