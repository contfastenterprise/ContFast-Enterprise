/**
 * Banco del lote 99: lo que se le manda a la DGII se guarda.
 *
 *     pnpm exec tsx scratch/verificar_peticion_guardada.ts
 *
 * EL FALLO
 * --------
 * `dgii_submissions` guardaba la RESPUESTA de la DGII (`response_payload`) y
 * no la PETICION. La columna para la peticion existia -- `xml_payload`, desde
 * la migracion 0000 -- y en todo src/ la palabra aparecia UNA sola vez: la
 * declaracion del esquema. Ningun insert la escribia, nadie la leia.
 *
 * Medido en la base: 61 envios, 61 con respuesta guardada, CERO con peticion.
 *
 * No es una curiosidad de esquema. Un e-CF es un documento fiscal, y cuando
 * alguien pregunta meses despues lo que importa no es solo que contesto la
 * DGII sino QUE SE LE DECLARO. Sin esto, la unica forma de saberlo es deducirlo
 * del codigo de hoy, que puede haber cambiado diez veces. En esta auditoria
 * hizo falta tres veces, y las tres hubo que deducirlo.
 *
 * Y el nombre mentia: lo que se manda a mSeller es JSON, no XML. Se renombro a
 * `request_payload` en el mismo movimiento -- la columna estaba vacia y nadie
 * la leia, asi que no habia mejor momento -- y ahora hace juego con
 * `response_payload`, que tampoco se llama xml y tampoco lo es.
 *
 * POR QUE SE COMPRUEBA SOBRE EL FUENTE
 * -----------------------------------
 * Lo que hay que fijar es DONDE se escribe y donde deliberadamente no. Eso no
 * se ve ejecutando: haria falta una base, mSeller al otro lado y una factura
 * de verdad. Lo que si se puede fijar, y es lo que se rompe, es el cableado:
 * que el dato viaje desde donde se arma hasta donde se guarda, y que los
 * caminos que NO lo guardan digan por que.
 */
import fs from 'fs';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));
const tiene = (f: string, t: string): boolean => codigo(f).includes(t);

const ESQ = 'src/db/schema/invoices.ts';
const TIP = 'src/services/invoice/types.ts';
const SUB = 'src/services/invoice/invoiceSubmissionService.ts';
const BOO = 'src/services/invoice/invoiceDbBooker.ts';
const JOB = 'src/infrastructure/jobRunners.ts';
const EST = 'src/app/api/v1/ecf/[id]/dgii-status/route.ts';

//  Precondicion: casi todo lo de abajo son negaciones, y sobre ficheros sin
//  leer son ciertas gratis.
for (const f of [ESQ, TIP, SUB, BOO, JOB, EST]) {
  if (crudo(f).length < 1000) throw new Error(`No se pudo leer ${f}. Revisa desde donde se corre.`);
}

//  Precondicion 2: lo que ya funcionaba antes de este lote y tiene que seguir
//  igual despues. Como se cumple en los DOS estados, comprobarlo con `ok()`
//  daria un OK gratis en la contraprueba y no distinguiria nada; va como
//  guarda que revienta, y con el numero exacto de sitios, para que quitar una
//  de esas escrituras se note.
function exige(f: string, aguja: string, n: number): void {
  const escapada = aguja.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const veces = (codigo(f).match(new RegExp(escapada, 'g')) ?? []).length;
  if (veces !== n) {
    throw new Error(
      `Precondicion rota: ${f} tiene ${veces} veces \`${aguja}\`, se esperaban ${n}. Este lote no toca eso.`,
    );
  }
}
exige(BOO, 'responsePayload:', 2);
exige(JOB, 'responsePayload:', 3);
exige(BOO, 'securityCode:', 3);
exige(JOB, 'securityCode:', 1);

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LA COLUMNA: EXISTE, SE LLAMA COMO LO QUE GUARDA');
// ─────────────────────────────────────────────────────────────────────────
ok('el esquema declara request_payload',
   tiene(ESQ, "requestPayload: text('request_payload')"));
ok('y ya no queda ni rastro de xml_payload',
   !codigo(ESQ).includes('xml_payload') && !codigo(ESQ).includes('xmlPayload'));
ok('en NINGUN sitio de src/ queda xmlPayload',
   (() => {
     for (const raiz of ['src']) {
       const andar = (d: string): boolean => {
         for (const e of fs.readdirSync(d, { withFileTypes: true })) {
           const p = `${d}/${e.name}`;
           if (e.isDirectory()) { if (andar(p)) return true; }
           else if (/\.tsx?$/.test(p) && sinComentarios(fs.readFileSync(p, 'utf8')).includes('xmlPayload')) return true;
         }
         return false;
       };
       if (andar(raiz)) return false;
     }
     return true;
   })());
ok('el esquema cuenta que nunca se escribio',
   crudo(ESQ).includes('NUNCA SE ESCRIBIO'));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. EL DATO VIAJA DESDE DONDE SE ARMA HASTA DONDE SE GUARDA');
// ─────────────────────────────────────────────────────────────────────────
ok('el tipo del resultado lo lleva',        tiene(TIP, 'msellerRequestPayload: unknown'));
ok('la emision lo declara en el ambito bueno',
   tiene(SUB, 'let msellerRequestPayload: unknown = null'));
ok('lo recoge del payload que arma',        tiene(SUB, 'msellerRequestPayload = msellerPayload'));
ok('y lo devuelve',                         tiene(SUB, 'msellerRequestPayload,'));

//  El orden importa: si se guardara DESPUES de enviar, un envio que revienta
//  se lleva por delante justo lo que hace falta para entender por que.
ok('se recoge ANTES de enviar, no despues',
   (() => {
     const t = codigo(SUB);
     const i = t.indexOf('msellerRequestPayload = msellerPayload');
     const j = t.indexOf('sendDocument(msellerPayload)');
     return i > 0 && j > 0 && i < j;
   })());

// ─────────────────────────────────────────────────────────────────────────
console.log('C. LOS DOS CAMINOS QUE ENVIAN LO GUARDAN');
// ─────────────────────────────────────────────────────────────────────────
ok('la emision directa lo escribe en sus DOS filas',
   (codigo(BOO).match(/requestPayload: submission\.msellerRequestPayload/g) ?? []).length === 2);
ok('el envio en diferido tambien',          tiene(JOB, 'requestPayload: JSON.stringify(ecfPayload)'));

//  Igual que arriba, pero en el otro camino: el diferido lo guarda al marcar
//  'processing', que ocurre ANTES de `sendDocument`. Si lo guardara en las
//  ramas de resultado, un envio que muere por el camino no dejaria rastro.
ok('el diferido lo guarda al marcar processing, antes de enviar',
   (() => {
     const t = codigo(JOB);
     const i = t.indexOf('requestPayload: JSON.stringify(ecfPayload)');
     const j = t.indexOf('sendDocument(ecfPayload)');
     return i > 0 && j > 0 && i < j;
   })());
ok('y en UN solo sitio, no repetido en cada rama',
   (codigo(JOB).match(/requestPayload:/g) ?? []).length === 1);

// ─────────────────────────────────────────────────────────────────────────
console.log('D. LOS CAMINOS QUE NO LO GUARDAN DICEN POR QUE');
// ─────────────────────────────────────────────────────────────────────────
//  Un hueco sin explicar se lee como un olvido, y el siguiente lo "arregla"
//  metiendo algo que no corresponde. Estas dos comprobaciones son sobre el
//  CRUDO a proposito: lo que se fija es que el comentario siga ahi.
ok('la fila `pending` explica que el comprobante aun no se ha armado',
   crudo(BOO).includes('en este camino el comprobante todavia no se ha armado')
   || crudo(BOO).includes('Aqui NO se guarda `requestPayload`'));
ok('la consulta de estado explica que es una pregunta, no un envio',
   crudo(EST).includes('NO es un envio, es una') && crudo(EST).includes('CONSULTA'));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
