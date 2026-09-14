/**
 * Banco del lote 107 (P3-48): pagos y cheques dejan de prometer una anulacion
 * que no existe.
 *
 *     pnpm exec tsx scratch/verificar_p3_48.ts
 *
 * EL PROBLEMA
 * -----------
 * `ApRepository.createPayment` y `createCheck` aceptaban `status: 'voided'`, y
 * los comentarios del esquema listaban `voided` entre los estados de
 * `ap_payments` y `checks`. Pero NADA anula un pago ni un cheque: no hay ruta,
 * no hay servicio, no hay asiento de reversa ni se devuelve el saldo a la
 * cuenta por pagar. Quien leyera el tipo podia pasar `'voided'` creyendo que
 * eso deshacia el pago, y lo unico que conseguia era una fila con otra
 * etiqueta, con el asiento y el saldo intactos.
 *
 * MEDIDO ANTES DE DECIDIR (2026-09-14, transaccion READ ONLY)
 * ---------------------------------------------------------
 *   ap_payments: applied 9, pending_guarantee 3, voided 0; voided_by: 0
 *   checks:      cleared 6, pending 3, voided 0; deleted_at: 0
 * Ni una fila con ese estado: quitarlo del tipo no deja a nadie fuera.
 *
 * POR QUE QUITARLO Y NO IMPLEMENTARLO
 * -----------------------------------
 * Implementar la anulacion es una funcion contable nueva (reversa del asiento,
 * saldo restituido, cheque anulado en banco, periodo cerrado, auditoria). Eso
 * no es cerrar un hueco: es decidir como anula la empresa, y lo decide el
 * dueno. Lo que si es un hueco es que el tipo lo prometa.
 *
 * Los conduces SI tienen anulacion de verdad (`DeliveryRepository`, con stock
 * y asiento revertidos): esa no se toca, y es precondicion abajo.
 *
 * Las columnas `voided_by` (migracion 0049, P1-13) SE QUEDAN: estan en la base
 * de datos y quitarlas pediria migracion. Quedan reservadas, y se dice.
 */
import fs from 'fs';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}

const REPO = 'src/repositories/apRepository.ts';
const ESQ = 'src/db/schema/accounting.ts';
const CONDUCES = 'src/repositories/deliveryRepository.ts';

/** Todos los fuentes de src/, sin comentarios. */
const FUENTES: { ruta: string; texto: string }[] = [];
(function andar(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) andar(p);
    else if (/\.tsx?$/.test(p)) FUENTES.push({ ruta: p, texto: sinComentarios(fs.readFileSync(p, 'utf8')) });
  }
})('src');

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(FUENTES.length > 400, `solo se han leido ${FUENTES.length} fuentes; revisa desde donde se corre`);
exige(codigo(REPO).includes('static async createPayment('), 'createPayment ya no esta en ApRepository');
exige(codigo(REPO).includes('static async createCheck('), 'createCheck ya no esta en ApRepository');

//  La razon de quitarlo: que NADIE lo escriba. Si alguien empezara a anular
//  pagos o cheques, este lote estaria borrando un estado vivo.
//  (Los conduces se excluyen: esos si se anulan, ver abajo.)
const escribenVoided = FUENTES.filter(
  (f) => f.ruta !== CONDUCES && /status:\s*'voided'/.test(f.texto)
);
exige(escribenVoided.length === 0,
      `alguien escribe status 'voided' fuera de los conduces: ${escribenVoided.map((f) => f.ruta).join(', ')}`);
exige(!FUENTES.some((f) => /\.update\((apPayments|checks)\)[\s\S]{0,200}voided/.test(f.texto)),
      'alguien actualiza un pago o un cheque a voided: la anulacion existe y este lote no aplica');

//  La anulacion de conduces es real y no se toca.
exige(codigo(CONDUCES).includes("status: 'voided',") && codigo(CONDUCES).includes('voidedBy: userId,'),
      'la anulacion de conduces ya no marca voided: revisar antes de seguir');

//  Las columnas reservadas siguen en el esquema (quitarlas pediria migracion).
exige((codigo(ESQ).match(/voidedBy: uuid\('voided_by'\)/g) ?? []).length >= 2,
      'las columnas voided_by de P1-13 ya no estan en accounting.ts');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL TIPO YA NO PROMETE UNA ANULACION');
// ─────────────────────────────────────────────────────────────────────────
//  `bloque` y no una ventana de caracteres: el `{` que sigue a la firma es el
//  del tipo de `data`, y con las llaves emparejadas no se cuela el metodo de
//  al lado.
const tipoPago = bloque(codigo(REPO), 'static async createPayment(');
const tipoCheque = bloque(codigo(REPO), 'static async createCheck(');

ok('createPayment admite exactamente pending_guarantee | applied',
   /\bstatus: 'pending_guarantee' \| 'applied';/.test(tipoPago));
ok('createCheck admite exactamente pending | cleared',
   /\bstatus: 'pending' \| 'cleared';/.test(tipoCheque));
ok("y en todo ApRepository no queda un 'voided' en el codigo",
   codigo(REPO).includes('static async createPayment(') && !/'voided'/.test(codigo(REPO)));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. EL ESQUEMA DICE LO QUE HAY');
// ─────────────────────────────────────────────────────────────────────────
//  Aqui lo que se comprueba ES el comentario: por eso `crudo`.
const esq = crudo(ESQ);
ok('checks: el comentario del estado ya no lista voided',
   esq.includes("status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | cleared\n"));
ok('ap_payments: el comentario del estado ya no lista voided',
   esq.includes("status: varchar('status', { length: 50 }).default('applied').notNull(), // pending_guarantee | applied\n"));
//  Cada una por su nombre, no "al menos dos": con tres notas, contar dejaba
//  borrar cualquiera sin que nada fallara (mutante que sobrevivio).
ok('queda escrito que NO existe anulacion de cheques, de pagos ni de cobros',
   ['no existe anulacion de cheques', 'no existe anulacion de pagos', 'no existe anulacion de cobros']
     .every((frase) => esq.includes(frase)));
ok('y que voided_by queda reservada, no en uso',
   (esq.match(/reservada/g) ?? []).length >= 2);

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
