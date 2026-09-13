/**
 * Banco del lote 94: la fecha limite de pago deja de inventarse.
 *
 *     pnpm exec tsx scratch/verificar_fecha_limite_pago.ts
 *
 * EL FALLO
 * --------
 * `FechaLimitePago` es un campo del e-CF que la DGII exige cuando el TipoPago
 * es 2 (credito). El sistema no tenia de donde sacarlo -- no habia columna de
 * vencimiento en `invoices` ni plazo de credito en `customers`, que solo
 * guarda `credit_limit` -- asi que `msellerClient` lo FABRICABA:
 *
 *     const defaultDueDate = new Date(params.issueDate);
 *     defaultDueDate.setMonth(defaultDueDate.getMonth() + 1);
 *
 * El parametro `paymentDueDate` que habria evitado eso estaba declarado desde
 * siempre, pero NO LO PASABA NADIE en todo el sistema: las dos unicas
 * apariciones eran la firma y la linea que comprobaba si faltaba. O sea que la
 * rama del valor inventado corria SIEMPRE.
 *
 * Medido contra la base: el credito es el 84% de las facturas de produccion
 * (42 de 50). No es un camino secundario, es el principal.
 *
 * Y el `setMonth` lo empeoraba los dias 29-31: emitida el 31 de enero, la
 * fecha limite declarada era el 3 de MARZO, porque el 31 de febrero no existe
 * y JavaScript lo normaliza hacia adelante en silencio.
 *
 * LO QUE FIJA ESTE BANCO
 * ----------------------
 *   A. La comprobacion de calendario (`esDiaReal`) distingue una fecha que no
 *      existe de una mal formateada, y no construye ningun `Date` -- porque
 *      `new Date(2026, 1, 31)` no falla: se convierte en el 3 de marzo.
 *   B. El esquema EXIGE la fecha a credito y solo a credito, ejecutandose de
 *      verdad, no leyendose.
 *   C. El reparto por pasos: el campo cae en el paso 1, con la forma de pago
 *      que lo hace aparecer.
 *   D. La fontaneria: el dato llega desde la pantalla hasta el e-CF y hasta la
 *      columna, y VUELVE en los dos SELECT explicitos del repositorio -- que
 *      es donde se pierde un campo nuevo sin que nadie se entere.
 */
import { fuente, crudo } from './_fuente';
import { esDiaReal } from '@/utils/fechasLocales';
import { fechaDgiiExigida } from '@/services/dgii/fechaDgii';
import { esquemaFactura } from '@/schemas/factura';
import { randomUUID } from 'node:crypto';

const PG  = 'src/app/dashboard/invoices/page.tsx';
const ESQ = 'src/db/schema/invoices.ts';
const TIP = 'src/services/invoice/types.ts';
const REP = 'src/repositories/invoiceRepository.ts';
const BOO = 'src/services/invoice/invoiceDbBooker.ts';
const SUB = 'src/services/invoice/invoiceSubmissionService.ts';
const DRA = 'src/app/api/v1/invoices/draft/route.ts';
const MS  = 'src/services/dgii/msellerClient.ts';
const JR  = 'src/infrastructure/jobRunners.ts';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

/** Un fichero que puede no existir todavia. Vacio en vez de excepcion. */
const leer = (ruta: string, conComentarios = false): string => {
  try { return (conComentarios ? crudo(ruta) : fuente(ruta)).replace(/\r\n/g, '\n'); }
  catch { return ''; }
};

//  Una negacion sobre una cadena vacia es cierta gratis: estos dos atan cada
//  comprobacion a que el fichero se haya leido de verdad.
const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);

const pg = leer(PG);
const esq = leer(ESQ);

//  Precondicion, no comprobacion. Con los fuentes sin leer, la seccion D daria
//  verde entera sin mirar nada.
if (pg.length < 50000 || esq.length < 5000) {
  throw new Error('No se pudieron leer los fuentes. Revisa las rutas antes de creerte nada.');
}

// ─────────────────────────────────────────────────────────────────────────
console.log('A. UNA FECHA QUE NO EXISTE NO ES UNA FECHA MAL ESCRITA');
// ─────────────────────────────────────────────────────────────────────────
const dias: [string | null | undefined, boolean][] = [
  ['2026-12-31', true],  ['2026-02-28', true],  ['2028-02-29', true],  ['2000-02-29', true],
  ['2026-02-29', false], ['1900-02-29', false], ['2026-02-31', false], ['2026-04-31', false],
  ['2026-13-01', false], ['2026-00-01', false], ['2026-01-00', false], ['2026-01-32', false],
  ['31-12-2026', false], ['2026-1-1', false],   ['2026-12-311', false],['x2026-12-31', false],
  ['', false], [null, false], [undefined, false],
];
let malDias = 0;
for (const [v, esperado] of dias) if (esDiaReal(v) !== esperado) { malDias++; console.log(`        ${JSON.stringify(v)} dio ${!esperado}`); }
ok(`${dias.length} dias juzgados por el calendario, no por la forma`, malDias === 0);
ok('se admiten espacios alrededor', esDiaReal('  2026-12-31  '));

//  Lo que hacia el codigo de antes, y por que validar con `Date` no sirve.
const normalizada = new Date(2026, 1, 31);
ok(`el 31 de febrero, pasado por new Date, se convierte en el ${normalizada.getDate()}/${normalizada.getMonth() + 1}  (por eso esDiaReal no usa Date)`,
   normalizada.getMonth() === 2 && !esDiaReal('2026-02-31'));

// ─────────────────────────────────────────────────────────────────────────
console.log('\nB. EL ESQUEMA LA EXIGE A CREDITO, Y SOLO A CREDITO');
// ─────────────────────────────────────────────────────────────────────────
const base = {
  warehouseId: randomUUID(),
  ecfType: '32',
  buyerRnc: '130000000',
  buyerName: 'Cliente',
  lines: [{ productId: randomUUID(), productName: 'X', quantity: 1, unitPrice: 100 }],
};
const rutas = (r: any): string[] => r.success ? [] : r.error.issues.map((i: any) => i.path.join('.'));
/** Falla, y el UNICO error es la fecha limite: si arrastrara otros, el caso no probaria lo que dice. */
const soloPorLaFecha = (cuerpo: any): boolean => {
  const r = esquemaFactura.safeParse(cuerpo);
  return !r.success && rutas(r).length === 1 && rutas(r)[0] === 'paymentDueDate';
};
const pasa = (cuerpo: any): boolean => esquemaFactura.safeParse(cuerpo).success;

ok('al contado, sin fecha limite, pasa',        pasa({ ...base, paymentType: 'cash' }));
ok('por transferencia, sin fecha limite, pasa', pasa({ ...base, paymentType: 'bank_transfer', bankName: 'B', transactionNumber: '1' }));
ok('al contado CON fecha se admite (no se declara, pero no estorba)',
   pasa({ ...base, paymentType: 'cash', paymentDueDate: '2026-12-31' }));

ok('A CREDITO sin fecha se para',               soloPorLaFecha({ ...base, paymentType: 'credit' }));
ok('a credito con la fecha vacia se para',      soloPorLaFecha({ ...base, paymentType: 'credit', paymentDueDate: '' }));
ok('a credito con un 31 de febrero se para',    soloPorLaFecha({ ...base, paymentType: 'credit', paymentDueDate: '2026-02-31' }));
ok('a credito con el mes 13 se para',           soloPorLaFecha({ ...base, paymentType: 'credit', paymentDueDate: '2026-13-01' }));
ok('a credito con un 29-feb no bisiesto se para', soloPorLaFecha({ ...base, paymentType: 'credit', paymentDueDate: '2027-02-29' }));
ok('a credito en dd-MM-aaaa se para',           soloPorLaFecha({ ...base, paymentType: 'credit', paymentDueDate: '31-12-2026' }));
ok('a credito con basura pegada se para',       soloPorLaFecha({ ...base, paymentType: 'credit', paymentDueDate: '2026-12-311' }));
ok('a credito con fecha real pasa',             pasa({ ...base, paymentType: 'credit', paymentDueDate: '2026-12-31' }));
ok('a credito un 29 de febrero bisiesto pasa',  pasa({ ...base, paymentType: 'credit', paymentDueDate: '2028-02-29' }));

ok('el mensaje dice que se pacta, no que falta un formato',
  (() => {
    const r = esquemaFactura.safeParse({ ...base, paymentType: 'credit' });
    return !r.success && r.error.issues.some((i: any) =>
      i.path.join('.') === 'paymentDueDate' && /no se puede suponer/i.test(i.message));
  })());

// ─────────────────────────────────────────────────────────────────────────
console.log('\nC. LA PANTALLA');
// ─────────────────────────────────────────────────────────────────────────
ok('el control existe y se llena del estado',     tiene(pg, 'value={paymentDueDate}'));
ok('aparece SOLO cuando el pago es a credito',    tiene(pg, "{paymentType === 'credit' && ("));
ok('su error se pinta junto al control',          tiene(pg, "err('paymentDueDate')"));
ok('los TRES envios al servidor lo llevan',
   pg.split("paymentDueDate: paymentType === 'credit' ? (paymentDueDate || undefined) : undefined").length - 1 === 3);
ok('y ninguno lo manda cuando no es a credito',
   !/paymentDueDate: paymentDueDate\b/.test(pg));
ok('abrir una factura o un borrador lo restaura', (pg.match(/setPaymentDueDate\(/g) || []).length >= 3);
ok('el repaso del paso 4 lo ensena',              tiene(pg, "'Fecha límite de pago'"));
ok('y dice cuando no se ha pactado, en vez de callarlo', tiene(pg, '— sin pactar —'));
ok('la fecha se pinta con el formateador compartido, no con una copia',
   tiene(pg, "import { formatDateDisplay } from '@/utils/fechasLocales'"));

// ─────────────────────────────────────────────────────────────────────────
console.log('\nD. DE LA PANTALLA A LA DGII Y A LA COLUMNA');
// ─────────────────────────────────────────────────────────────────────────
const tip = leer(TIP), rep = leer(REP), boo = leer(BOO), sub = leer(SUB), dra = leer(DRA);

ok('la columna existe, anulable y sin valor por defecto',
   (() => {
     const m = esq.match(/paymentDueDate: date\('payment_due_date'\)[^\n]*/);
     return m !== null && !m[0].includes('notNull') && !m[0].includes('default');
   })());
ok('el tipo de entrada la declara opcional',      tiene(tip, 'paymentDueDate?: string'));
ok('el repositorio la ESCRIBE',                   tiene(rep, 'paymentDueDate: data.paymentDueDate ?? null'));

//  Este es el que de verdad importa de la seccion. Los dos SELECT del
//  repositorio enumeran las columnas una a una, y una lista explicita NO falla
//  al anadir una columna: simplemente no la devuelve. Si `getById` no la
//  trajera, el asistente abriria una factura a credito con la fecha en blanco
//  y el envio en diferido no tendria que declarar.
ok('y la DEVUELVE en los DOS select explicitos',
   (rep.match(/paymentDueDate: invoices\.paymentDueDate/g) || []).length === 2);

ok('el booker la pasa en los dos sitios (emision y rechazo)',
   (boo.match(/paymentDueDate: data\.paymentDueDate/g) || []).length === 2);
ok('la emision la manda dentro del e-CF, en crudo',
   tiene(sub, 'paymentDueDate: data.paymentDueDate || undefined'));
ok('y NO la formatea ella: eso reparte otra vez el formateo',
   !sub.includes('fechaDgii(data.paymentDueDate)'));
ok('el borrador la guarda...',                    tiene(dra, 'paymentDueDate: data.paymentDueDate ?? null'));
ok('...pero NO la exige: un borrador esta a medias por definicion',
   tiene(dra, 'paymentDueDate: z.string().optional()'));

// ─────────────────────────────────────────────────────────────────────────
console.log('\nE. LA PARADA, EN LA ULTIMA PUERTA ANTES DEL e-CF');
// ─────────────────────────────────────────────────────────────────────────
//  `buildECFPayload` no se ejecuta aqui: importar msellerClient arrastra
//  `encryption` y de ahi `kmsService`, que pide credenciales al cargar. Un
//  banco que revienta al importar no comprueba nada. Asi que la PARADA se
//  comprueba por donde de verdad ocurre -- `fechaDgiiExigida`, que es la que
//  lanza -- y el cableado se comprueba sobre el fuente.
const ms = leer(MS), jr = leer(JR);
if (ms.length < 20000 || jr.length < 5000) {
  throw new Error('No se pudieron leer msellerClient ni jobRunners.');
}

ok('el payload EXIGE la fecha cuando el pago es a credito',
   tiene(ms, "idDoc.FechaLimitePago = fechaDgiiExigida(params.paymentDueDate, 'FechaLimitePago')"));
ok('y no queda ni rastro del valor inventado',
   !/setMonth|defaultDueDate|dueDateStr/.test(ms));

//  Esto es la parada, ejecutada.
ok('sin fecha, fechaDgiiExigida se para en vez de suponer',
   (() => { try { fechaDgiiExigida(undefined, 'FechaLimitePago'); return false; } catch { return true; } })());
ok('...y el mensaje dice QUE campo falta',
   (() => { try { fechaDgiiExigida(undefined, 'FechaLimitePago'); return false; }
            catch (e) { return String((e as Error).message).includes('FechaLimitePago'); } })());
ok('con el dia pactado, lo formatea para la DGII',
   fechaDgiiExigida('2026-12-31', 'FechaLimitePago') === '31-12-2026');
ok('y no le resta un dia por el camino',
   fechaDgiiExigida('2027-01-01', 'FechaLimitePago') === '01-01-2027');

ok('el envio en diferido decide el TipoPago por COMO se pacto',
   tiene(jr, "invoice.paymentType === 'credit' ? '2' : '1'"));
ok('y ya no por si se ha cobrado',
   !jr.includes("paymentStatus === 'unpaid' ? '2' : '1'"));
ok('el diferido tambien manda la fecha limite',
   tiene(jr, 'paymentDueDate:'));
ok('leyendola de la factura, no inventandola',
   /paymentDueDate: \(invoice as any\)\.paymentDueDate/.test(jr));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
