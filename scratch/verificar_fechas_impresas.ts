/**
 * Banco de la capa 3: los IMPRESOS. Y el cierre del barrido entero.
 *
 *     pnpm exec tsx scratch/verificar_fechas_impresas.ts
 *
 * Las capas 1 y 2 dejaron el formateador y las pantallas. Esta cierra lo que
 * se lleva el cliente: las plantillas HTML que se imprimen y se mandan por
 * correo, y el generador de PDF.
 *
 *     utils/templates/documentTemplates.ts   45 sitios
 *     services/pdfGenerator.ts               12
 *     actions/documents.ts                    1
 *     tres rutas de app/api que alimentan las plantillas
 *
 * De esos 61, veinte recibian una columna `date` y por tanto IMPRIMIAN UN
 * DIA MENOS en el papel del cliente.
 *
 * POR QUE ESTE BANCO MIRA TODO src/ Y NO SOLO SU CAPA
 * --------------------------------------------------
 * Porque es el ultimo. Un barrido en tres tandas tiene una forma tipica de
 * fallar: cada tanda sale verde por separado y entre dos de ellas queda un
 * hueco que ninguna vigila. Aqui se comprueba la propiedad final -- NADIE en
 * todo el arbol formatea una fecha a mano -- en vez de la de esta tanda.
 *
 * LA TRAMPA, OTRA VEZ
 * -------------------
 * `x.toLocaleString('es-DO')` es una FECHA cuando x es un `Date` y un IMPORTE
 * cuando es un numero. En los impresos hay 19 del segundo tipo. Lo que decide
 * es el RECEPTOR, no las opciones: mirar `minimumFractionDigits` clasifico mal
 * los salarios de la nomina en la capa 2 y habria exigido convertirlos.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

/**
 * La localizacion interna de react-day-picker: los nombres de los meses y de
 * los dias que pinta el propio control. No es un dato del negocio.
 */
const EXCLUIDOS = new Set(['src/components/ui/calendar.tsx']);

function ficheros(raiz: string): string[] {
  const out: string[] = [];
  const andar = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) { if (e.name !== 'node_modules') andar(p); }
      else if (/\.(ts|tsx)$/.test(p) && !EXCLUIDOS.has(p)) out.push(p);
    }
  };
  if (fs.existsSync(raiz)) andar(raiz);
  return out.sort();
}

const TODOS = ficheros('src');
//  Precondicion: casi todo lo de abajo son negaciones, y sobre una lista
//  vacia son ciertas gratis.
if (TODOS.length < 300) {
  throw new Error(`Solo se encontraron ${TODOS.length} ficheros en src/. Revisa desde donde se corre.`);
}

const LLAMADA = /(new\s+Date\s*\([^()]*\)|[\w$.\]\[]+)\.toLocale(Date|Time)?String\(/g;
interface Sitio { fichero: string; linea: number; texto: string }
const fechas: Sitio[] = [];
const importes: Sitio[] = [];
for (const f of TODOS) {
  //  Los comentarios NO cuentan. `fechasLocales.ts` explica en su docblock
  //  exactamente lo que el barrido vino a quitar -- con ejemplos de
  //  `toLocaleDateString` escritos a proposito -- y la primera version de este
  //  banco los conto como codigo pendiente. `sinComentarios` los sustituye por
  //  espacios, asi que los numeros de linea siguen siendo los del fichero.
  sinComentarios(fs.readFileSync(f, 'utf8')).split('\n').forEach((l, i) => {
    for (const m of l.matchAll(LLAMADA)) {
      const esFecha = m[2] === 'Date' || m[2] === 'Time' || /^new\s+Date\s*\(/.test(m[1]);
      (esFecha ? fechas : importes).push({ fichero: f, linea: i + 1, texto: l.trim().slice(0, 95) });
    }
  });
}

console.log(`Revisados ${TODOS.length} ficheros de src/\n`);

// ─────────────────────────────────────────────────────────────────────────
console.log('A. EL BARRIDO ENTERO: NADIE FORMATEA UNA FECHA A MANO');
// ─────────────────────────────────────────────────────────────────────────
ok(`ni un toLocaleDateString / toLocaleTimeString / toLocaleString de fecha en TODO src/  (quedan: ${fechas.length})`,
   fechas.length === 0);
if (fechas.length) for (const s of fechas.slice(0, 15)) console.log(`        ${s.fichero}:${s.linea}  ${s.texto}`);

const usan = TODOS.filter(f => /format(Date|DateTime|Time)Display\s*\(/.test(fs.readFileSync(f, 'utf8')));
const PT = 'src/utils/templates/documentTemplates.ts';
const PG = 'src/services/pdfGenerator.ts';
const leer = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const tiene = (f: string, t: string): boolean => leer(f).includes(t);

/**
 * La marca de que ESTA capa se hizo.
 *
 * Empezo siendo `usan.length >= 40`, y la contraprueba la cazo saliendo en
 * OK: las capas 1 y 2 ya dejaban 42 ficheros usando un formateador, asi que
 * el umbral no distinguia nada. Lo que caracteriza a la capa 3 son los dos
 * impresos, y por eso se mira eso.
 */
const SE_BARRIO =
  /format(Date|DateTime|Time)Display\s*\(/.test(leer(PT)) &&
  /format(Date|DateTime|Time)Display\s*\(/.test(leer(PG));
ok(`${usan.length} ficheros pasan por un formateador compartido, las plantillas y el PDF incluidos`, SE_BARRIO);

// ─────────────────────────────────────────────────────────────────────────
console.log('\nB. LOS IMPRESOS, UNO A UNO');
// ─────────────────────────────────────────────────────────────────────────
//  Precondicion: si las plantillas no se leen, todas las negaciones de esta
//  seccion son ciertas gratis.
if (leer(PT).length < 100000 || leer(PG).length < 20000) {
  throw new Error('No se pudieron leer las plantillas ni el generador de PDF. Revisa las rutas.');
}

//  PRECONDICIONES, no comprobaciones. Las reglas fiscales de los lotes 93 a 95
//  viven en estos mismos ficheros de impresion, y este barrido no puede
//  haberselas llevado por delante. Pero son ciertas ANTES y DESPUES, asi que
//  como comprobacion saldrian OK en la contraprueba sin decir nada. Que
//  revienten aqui, que es lo que son.
for (const f of ['src/app/api/v1/invoices/[id]/print/route.ts',
                 'src/app/api/v1/invoices/[id]/pdf/route.ts',
                 'src/services/invoice/correoFactura.ts']) {
  if (!tiene(f, 'vencimientoSecuenciaSiConsta(')) {
    throw new Error(`PRECONDICION ROTA: ${f} dejo de usar vencimientoSecuenciaSiConsta (lote 95).`);
  }
}
if (!tiene(PT, 'exigeVencimientoSecuencia(inv.ecfType)')) {
  throw new Error('PRECONDICION ROTA: la plantilla dejo de mirar el tipo de comprobante.');
}

ok('las plantillas importan el formateador compartido',
   tiene(PT, "from '@/utils/fechasLocales'"));
ok('y el generador de PDF tambien',
   tiene(PG, "from '@/utils/fechasLocales'"));
ok('las plantillas no construyen ningun Date para una fecha',
   SE_BARRIO && !/new Date\([^)]*\)\.toLocale/.test(leer(PT)));
ok('el generador de PDF tampoco',
   SE_BARRIO && !/new Date\([^)]*\)\.toLocale/.test(leer(PG)));

// ─────────────────────────────────────────────────────────────────────────
console.log('\nC. PERO LOS IMPORTES DE LOS PAPELES SIGUEN INTACTOS');
// ─────────────────────────────────────────────────────────────────────────
//  Un comprobante sin separador de miles en los totales es un comprobante
//  ilegible, y es lo que pasaria si el barrido se pasara de listo.
const importesEnImpresos = importes.filter(s => s.fichero === PT || s.fichero === PG);
ok(`las plantillas y el PDF conservan sus ${importesEnImpresos.length} importes DESPUES de convertir las fechas`,
   SE_BARRIO && importesEnImpresos.length >= 15);
ok(`ninguno de los ${importes.length} importes de src/ pasa por un formateador de fecha`,
   SE_BARRIO && importes.every(s => !/format(Date|DateTime|Time)Display/.test(s.texto)));

//  La otra puerta: mirar QUE LE ENTRA al formateador. Si alguien convirtiera
//  un total, esa linea dejaria de ser un toLocaleString y se saldria del
//  recuento de arriba sin que nadie se enterara. Un mutante hizo justo eso en
//  la capa 2 y escapo.
const DINERO = /parseFloat\s*\(|\bNumber\s*\(|salary|amount|price|total|balance|monto|importe|saldo|subtotal|cost/i;
const conDinero: string[] = [];
for (const f of usan) {
  for (const m of leer(f).matchAll(/format(?:Date|DateTime|Time)Display\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
    if (DINERO.test(m[1])) conDinero.push(`${f}  ->  ${m[0].slice(0, 60)}`);
  }
}
ok(`ningun formateador de fecha recibe algo que huela a dinero  (sospechosos: ${conDinero.length})`,
   SE_BARRIO && conDinero.length === 0);
if (conDinero.length) for (const c of conDinero.slice(0, 8)) console.log(`        ${c}`);

// ─────────────────────────────────────────────────────────────────────────
console.log('\nD. UNOS CUANTOS PAPELES, UNO A UNO');
// ─────────────────────────────────────────────────────────────────────────
ok('la factura impresa: la fecha de emision',
   tiene(PT, 'formatDateDisplay(inv.createdAt)') || tiene(PT, 'formatDateTimeDisplay(inv.createdAt)'));
ok('el estado de cuenta: la fecha de la factura',
   tiene(PT, 'formatDateDisplay(inv.invoiceDate)'));
ok('los recibos: su fecha',
   tiene(PT, 'formatDateDisplay(item.receiptDate)'));
ok('el PDF: los vencimientos de la cartera',
   tiene(PG, 'formatDateDisplay(item.dueDate)'));
ok('el PDF: el periodo de la nomina',
   tiene(PG, 'formatDateDisplay(payroll.periodStart)'));
ok('los informes de CxC y CxP impresos',
   tiene('src/app/api/v1/reports/receivables/print/route.ts', 'formatDateDisplay(')
   && tiene('src/app/api/v1/reports/payables/print/route.ts', 'formatDateDisplay('));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
