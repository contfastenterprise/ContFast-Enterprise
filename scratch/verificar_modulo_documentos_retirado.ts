/**
 * Banco del lote 100: se retira el modulo de documentos.
 *
 *     pnpm exec tsx scratch/verificar_modulo_documentos_retirado.ts
 *
 * QUE SE RETIRA Y POR QUE
 * -----------------------
 * Habia un modulo entero -- visor, dos paginas, tres rutas de API, dos
 * servicios, una accion, una plantilla y una tabla -- al que NO SE LLEGABA
 * desde ninguna parte:
 *
 *   - `/dashboard/documents/[type]/[id]` no figuraba en el menu lateral y
 *     ningun fichero enlazaba a ella. Solo se llegaba escribiendo la URL.
 *   - `/documentos/[token]` solo se alcanza con un testigo de compartir, y de
 *     esos habia CERO en la base desde que la tabla existe.
 *   - Las tres rutas `/api/documents/*` las llamaba unicamente el visor.
 *   - `DocumentService` (el de `services/documents`) lo importaba solo
 *     `actions/documents.ts`, que lo importaba solo la ruta de correo.
 *
 * Ademas la pagina publica estaba ROTA para su propio publico: monta el mismo
 * visor que la del dashboard, sin prop que esconda nada, y tres de sus cuatro
 * botones llaman a rutas que un lote anterior cerro con sesion -- con razon,
 * era el agujero F0-03. Un cliente con enlace veia "Error al descargar el PDF".
 *
 * 996 lineas en 11 ficheros. Lo que si se usa para imprimir y enviar facturas
 * es el otro camino (`correoFactura`, `invoices/[id]/print`, `[id]/pdf`), que
 * sigue intacto y se fija aqui abajo como precondicion.
 *
 * CUIDADO CON LOS DOS HOMONIMOS
 * -----------------------------
 * Hay DOS `DocumentService` y DOS rutas que parecen la misma:
 *
 *   services/documents/documentService.ts   <- este se va
 *   services/print/documentService.ts       <- este lo usan 5 rutas, SE QUEDA
 *
 *   /api/documents/pdf|email|share          <- estas se van
 *   /api/v1/documents/[uuid]/download       <- esta SE QUEDA
 *
 * Y `utils/templates/documentTemplates.ts`, que lo importan 20 ficheros, no
 * tiene nada que ver con nada de esto y tambien se queda.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

/** Todos los .ts/.tsx de src/, con el texto ya sin comentarios. */
const FUENTES: { ruta: string; texto: string; crudo: string }[] = [];
(function andar(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) andar(p);
    else if (/\.tsx?$/.test(p)) {
      const t = fs.readFileSync(p, 'utf8');
      FUENTES.push({ ruta: p, texto: sinComentarios(t), crudo: t });
    }
  }
})('src');

const LA_ISLA = [
  'src/components/documents/DocumentViewer.tsx',
  'src/components/documents/templates/InvoiceTemplate.tsx',
  'src/app/documentos/[token]/page.tsx',
  'src/app/dashboard/documents/[type]/[id]/page.tsx',
  'src/services/documents/documentService.ts',
  'src/services/documents/emailService.ts',
  'src/actions/documents.ts',
  'src/app/api/documents/pdf/[type]/[id]/route.ts',
  'src/app/api/documents/email/[type]/[id]/route.ts',
  'src/app/api/documents/share/[type]/[id]/route.ts',
  'src/db/schema/documents.ts',
];

const PDF = 'src/app/api/v1/invoices/[id]/pdf/route.ts';
const PRX = 'src/proxy.ts';
const ESQ = 'src/db/schema.ts';
const TST = 'src/tests/permisosRutas.vitest.ts';

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan, no puntuan: lo de aqui se cumple ANTES y
//  DESPUES del lote, asi que como `ok()` darian un OK gratis en la
//  contraprueba sin distinguir nada. Son los homonimos y el camino vivo.
// ─────────────────────────────────────────────────────────────────────────
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
exige(FUENTES.length > 400, `solo se han leido ${FUENTES.length} fuentes; revisa desde donde se corre`);
//  Cota inferior a proposito: este banco se escribio desde una copia del
//  repositorio que NO tenia los ficheros mas hondos de `app/api/v1` -- el
//  puente de ficheros no llega mas alla de siete carpetas. Cualquier numero
//  exacto sacado de aquella copia habria sido menor que el de verdad.

//  El homonimo que se queda, y quienes lo llaman.
//
//  NO se cuenta: se NOMBRA. Un numero total es fragil por los dos lados --
//  sube si alguien anade un llamador legitimo y no distingue si uno cambia por
//  otro. Nombrar los ficheros fija lo que importa: que estos, que son los que
//  imprimen, lo siguen usando. La comilla de cierre no es adorno: sin ella,
//  `documentServiceX` sigue conteniendo `documentService`.
exige(fs.existsSync('src/services/print/documentService.ts'),
      'services/print/documentService.ts es el que SE QUEDA, y no esta');
const LLAMAN_A_PRINT = [
  'src/app/api/v1/ap/print/route.ts',
  'src/app/api/v1/documents/[uuid]/download/route.ts',
  'src/app/api/v1/invoices/[id]/print/route.ts',
  'src/app/api/v1/quotes/[id]/print/route.ts',
  'src/app/api/v1/tools/print/route.ts',
];
for (const f of LLAMAN_A_PRINT) {
  exige(codigo(f).includes("@/services/print/documentService'"),
        `${f} ha dejado de importar services/print/documentService`);
}

//  La ruta de descarga que se parece a las que se van.
exige(fs.existsSync('src/app/api/v1/documents/[uuid]/download/route.ts'),
      'api/v1/documents/[uuid]/download SE QUEDA, y no esta');

//  Las plantillas, que no tienen nada que ver.
//  Igual con las plantillas: se nombran los veinte que las importan, en vez de
//  contarlos.
const USAN_PLANTILLAS = [
  'src/app/api/v1/ap/payments/report/route.ts',
  'src/app/api/v1/ap/print/route.ts',
  'src/app/api/v1/cartera/[id]/print/route.ts',
  'src/app/api/v1/delivery-notes/[id]/print/route.ts',
  'src/app/api/v1/expenses/[id]/print/route.ts',
  'src/app/api/v1/expenses/report/route.ts',
  'src/app/api/v1/invoices/[id]/pdf/route.ts',
  'src/app/api/v1/invoices/[id]/print/route.ts',
  'src/app/api/v1/invoices/report/route.ts',
  'src/app/api/v1/quotes/[id]/pdf/route.ts',
  'src/app/api/v1/quotes/[id]/print/route.ts',
  'src/app/api/v1/reports/payables/print/route.ts',
  'src/app/api/v1/reports/pdf/route.ts',
  'src/app/api/v1/reports/receivables/print/route.ts',
  'src/app/api/v1/supplier-orders/[id]/email/route.ts',
  'src/app/api/v1/supplier-orders/[id]/pdf/route.ts',
  'src/app/api/v1/supplier-orders/report/route.ts',
  'src/app/api/v1/tools/print/route.ts',
  'src/services/invoice/correoFactura.ts',
  'src/services/invoice/invoiceFileGenerator.ts',
];
for (const f of USAN_PLANTILLAS) {
  exige(codigo(f).includes("@/utils/templates/documentTemplates'"),
        `${f} ha dejado de importar utils/templates/documentTemplates`);
}

//  El camino vivo de impresion y correo.
for (const f of [
  'src/services/invoice/correoFactura.ts',
  'src/app/api/v1/invoices/[id]/print/route.ts',
  PDF,
]) exige(crudo(f).length > 1000, `${f} es el camino vivo y no se ha podido leer`);

//  El proxy sigue protegiendo lo que protegia.
//  `pathname.startsWith('/api/v1')` sale CUATRO veces en el proxy, asi que
//  buscarla suelta no distingue la del bloque de proteccion de las otras
//  tres. Se fija la linea entera, con su `||` y su sangria.
for (const t of ["    pathname.startsWith('/dashboard') ||", "    pathname.startsWith('/api/v1') ||",
                 "'/dashboard/:path*'", "'/api/v1/:path*'"]) {
  exige(codigo(PRX).includes(t), `el proxy ha perdido ${t}`);
}

//  La llamada de mSeller a SU `/api/documents/download` es ajena: no es
//  nuestra ruta, se parece, y si algun dia desaparece la comprobacion de
//  abajo dejaria de distinguir nada. Por eso se fija aqui y revienta.
exige(FUENTES.some((f) => f.texto.includes('https://ecf.mseller.app/api/documents/download')),
      'msellerClient ha perdido su llamada a ecf.mseller.app/api/documents/download');

//  Y el aviso del comentario que se reescribe: lo que cambia es a que apunta,
//  no la advertencia. Se cumple antes y despues, asi que va de guarda.
//  Buscar la frase suelta no vale: tras el lote sale dos veces -- en el punto
//  4 de la lista de arriba y en el parrafo nuevo del final -- y contar dos
//  seria fijar el estado de DESPUES, no una invariante. Lo que se cumple en
//  los dos estados es el punto 4 entero, que este lote no toca.
exige(crudo(PDF).includes(
        ' *  4. Un credencial en la barra de direcciones queda en los registros del'),
      'el comentario de pdf/route.ts ha perdido el punto 4: el credencial en la URL');
//  Y quedan acciones de servidor que no son el ayudante: si no, la prueba
//  `permisosRutas` pasaria por vacia en vez de por correcta.
const acciones = fs.readdirSync('src/actions').filter((f) => f.endsWith('.ts') && !f.startsWith('_'));
exige(acciones.length >= 2, `quedan ${acciones.length} acciones de servidor; se esperaban 2 o mas`);

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LA ISLA YA NO ESTA');
// ─────────────────────────────────────────────────────────────────────────
for (const f of LA_ISLA) {
  ok(`fuera ${f.replace('src/', '')}`, !fs.existsSync(f));
}
ok('y no quedan las carpetas vacias detras',
   !fs.existsSync('src/app/documentos') && !fs.existsSync('src/app/api/documents')
   && !fs.existsSync('src/services/documents') && !fs.existsSync('src/components/documents')
   && !fs.existsSync('src/app/dashboard/documents'));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. NADIE LA NOMBRA YA');
// ─────────────────────────────────────────────────────────────────────────
function nadieDice(aguja: string, salvo: (r: string) => boolean = () => false): string[] {
  return FUENTES.filter((f) => f.texto.includes(aguja) && !salvo(f.ruta)).map((f) => f.ruta);
}
for (const aguja of ['@/services/documents', '@/actions/documents', '@/components/documents',
                     '@/db/schema/documents', 'DocumentViewer', 'documentShares']) {
  const quedan = nadieDice(aguja);
  ok(`ningun fuente importa ni nombra ${aguja}${quedan.length ? ` (queda en ${quedan[0]})` : ''}`,
     quedan.length === 0);
}

//  `/api/documents/` tiene un homonimo que NO es nuestro: msellerClient llama
//  a `https://ecf.mseller.app/api/documents/download`, que es de ELLOS. Si se
//  buscara a secas, esa linea daria un falso positivo para siempre.
const apiDocs = FUENTES.filter((f) => /(?<!mseller\.app)\/api\/documents\//.test(f.texto))
  .filter((f) => !f.texto.includes('ecf.mseller.app/api/documents'));
ok('nadie llama ya a /api/documents/ (y el de mSeller, que es ajeno, no cuenta)',
   apiDocs.length === 0);

ok('el esquema ya no reexporta la tabla',
   !codigo(ESQ).includes('schema/documents'));
ok('el proxy ya no protege una ruta que no existe',
   !codigo(PRX).includes('/api/documents'));

// ─────────────────────────────────────────────────────────────────────────
console.log('C. EL COMENTARIO QUE APUNTABA AQUI DICE LA VERDAD');
// ─────────────────────────────────────────────────────────────────────────
//  Sobre el CRUDO a proposito: lo que se fija es un comentario.
ok('ya no dice que el mecanismo "YA" existe y solo hay que usarlo',
   !crudo(PDF).includes('sistema YA tiene el mecanismo correcto'));
ok('cuenta que se retiro y por que',
   crudo(PDF).includes('lote 100') && crudo(PDF).includes('CERO filas'));
ok('y conserva la forma, que es lo que valia',
   crudo(PDF).includes('testigo ALEATORIO de 32')
   && crudo(PDF).includes('caducidad')
   && crudo(PDF).includes('revocarlo'));

// ─────────────────────────────────────────────────────────────────────────
console.log('D. LA PRUEBA DE PERMISOS NO QUEDA CON ENTRADAS FANTASMA');
// ─────────────────────────────────────────────────────────────────────────
//  `permisosRutas` tiene dos listas de rutas por NOMBRE, y las dos se caen
//  solas si nombran un fichero que ya no existe. Es la trampa de este lote.
for (const id of ["'documents/pdf/[type]/[id]/route.ts'",
                  "'documents/email/[type]/[id]/route.ts'",
                  "'documents/share/[type]/[id]/route.ts'"]) {
  ok(`la prueba ya no nombra ${id}`, !codigo(TST).includes(id));
}
//  "lote 100" sale TRES veces en ese fichero, asi que buscarlo suelto no
//  distingue nada: se fijan las dos notas concretas, la de cada lista.
ok('y explica por que salieron, que no fue por corregirse',
   crudo(TST).includes('salieron de aqui en el lote 100, no por')
   && crudo(TST).includes('El lote 100 retiro el modulo entero'));

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
