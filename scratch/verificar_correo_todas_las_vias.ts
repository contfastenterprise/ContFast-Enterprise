import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

const crudo = (rutaRelativa: string): string | null => {
  const p = join(RAIZ, rutaRelativa);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
};

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════ El correo tiene que salir por TODOS los caminos que aceptan ═══════
//
// Cinco sitios pueden dejar una factura en aceptada. El documento y el correo
// se habian enganchado en tres; faltaban dos, y uno de ellos es el boton
// "Sincronizar" del listado de e-CF, que es el que se usa a diario. Por ahi la
// factura pasaba a aceptada sin PDF y sin correo: aceptada y muda. Se vio en
// los datos -- una factura aceptada con `customer_email_sent_at` en null es una
// que llego por ese camino.
//
// La guarda de verdad esta dentro de `enviarFacturaPorCorreo`: exige la factura
// aceptada y toma la marca con `IS NULL` en el propio UPDATE. Por eso llamar de
// mas es inofensivo -- devuelve 'ya_enviado' -- y llamar de menos es un correo
// que no sale. La comparacion con el estado anterior esta solo para no hacer la
// llamada en balde.

const VIAS: [string, string][] = [
  ['src/services/invoice/invoiceFileGenerator.ts', 'la emision sincrona'],
  ['src/app/api/v1/ecf/[id]/dgii-status/route.ts', 'la consulta de una factura'],
  ['src/services/dgii/sincronizarPendientes.ts', 'el barrido de pendientes'],
  ['src/app/api/v1/ecf/dgii-status/batch/route.ts', 'el boton Sincronizar del listado'],
  ['src/infrastructure/jobRunners.ts', 'el worker de envio'],
];

// ─────────── 1) Los dos caminos que faltaban ───────────
let s = crudo('src/app/api/v1/ecf/dgii-status/batch/route.ts')!;
ok(
  'batch: al aceptar manda el correo',
  s.includes("if (inv.status !== 'accepted' && newStatus === 'accepted') {") &&
    s.includes('await enviarFacturaPorCorreo({') &&
    s.includes('esReenvio: false,')
);
ok(
  'batch: un correo fallido no tumba la sincronizacion de las demas',
  s.includes('no puede tumbar la sincronizacion de las demas')
);
ok('batch: la nota dice que este es el camino que mas se usa', s.includes('aceptada y muda'));

s = crudo('src/infrastructure/jobRunners.ts')!;
ok(
  'worker: al aceptar manda el correo',
  s.includes("if (invoice.status !== 'accepted' && newStatus === 'accepted') {") &&
    s.includes('await enviarFacturaPorCorreo({ invoiceId, companyId, modo, esReenvio: false });')
);
ok(
  'worker: el import es dinamico para no cerrar el ciclo con la cola',
  s.includes("const { enviarFacturaPorCorreo } = await import('@/services/invoice/correoFactura');") &&
    !s.includes("import { enviarFacturaPorCorreo } from '@/services/invoice/correoFactura';")
);
ok('worker: la nota explica el ciclo', s.includes('Estatico cerraria el ciclo'));

// ─────────── 2) Ningun camino se queda fuera ───────────
// Cada uno tiene que nombrar el envio del correo. La emision sincrona lo hace
// por su cuenta desde antes: arma el correo ella misma.
const faltan: string[] = [];
for (const [ruta, nombre] of VIAS) {
  const t = crudo(ruta);
  if (t === null) {
    faltan.push(`${nombre} (fichero ausente)`);
    continue;
  }
  if (!t.includes('enviarFacturaPorCorreo') && !t.includes('emails-sending')) faltan.push(nombre);
}
ok(`los cinco caminos mandan el correo al aceptar (faltan: ${faltan.length ? faltan.join(', ') : 'ninguno'})`, faltan.length === 0);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
