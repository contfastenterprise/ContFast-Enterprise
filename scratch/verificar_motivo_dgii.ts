import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

const crudo = (rutaRelativa: string): string =>
  readFileSync(join(RAIZ, rutaRelativa), 'utf8').replace(/\r\n/g, '\n');

/** Sin las lineas de comentario: los comentarios citan lo que se quito. */
const sinComentarios = (t: string): string =>
  t
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════ El motivo del rechazo se lee en un sitio, y el cron deja de tirarlo ═══════
//
// `sincronizarPendientes` guardaba "Rechazado por la DGII (Rechazado)." y nada
// mas: llamaba a `mensajeEstado(lectura, null)`, con el null puesto a proposito,
// y nunca miraba los mensajes del validador. Un comprobante fiscal rechazado sin
// el motivo no se puede arreglar.
//
// Y no era que la DGII no lo dijera: la respuesta trae los mensajes con codigo y
// texto. Lo que pasaba es que ese bucle existia CINCO veces -- tres en
// msellerClient y una en la ruta en lote -- con formatos distintos, y la lectura
// que faltaba era justo la del camino automatico.
//
// Que la funcion EXTRAIGA lo que debe se prueba ejecutandola, en
// src/tests/firmaComprobante.vitest.ts. Aqui solo se vigila que siga habiendo
// una sola y que nadie se deje otra copia.

// ─────────── 1) La funcion, donde viven las demas lecturas ───────────
let s = crudo('src/services/dgii/estadoEnvio.ts');
ok('motivoDgii vive junto a leerEstado y camposDeFirma', s.includes('export function motivoDgii(raw: unknown): string | null {'));
ok(
  'recorre las cadenas JSON anidadas, no solo el primer nivel',
  s.includes('visitar(JSON.parse(t), profundidad + 1);') &&
    s.includes("if (clave.toLowerCase() === 'mensajes' && Array.isArray(valor)) {")
);
ok(
  'descarta el acuse de que todo fue bien (codigo 0) y los vacios',
  s.includes('if (codigo === 0) return;') &&
    s.includes("if (typeof valor !== 'string' || valor.trim() === '') return;")
);
ok('quita duplicados: dgiiResponse es un historial y repite', s.includes('if (yaPuestos.has(clave)) return;'));
ok('cae a error/mensaje, que es donde va el rechazo por estructura', s.includes('[r.error, r.mensaje]'));

// ─────────── 2) El cron deja de tirarlo ───────────
s = crudo('src/services/dgii/sincronizarPendientes.ts');
ok('el cron lee el motivo', s.includes('const motivo = motivoDgii(r.data);'));
ok(
  'y lo COMPONE con el veredicto, sin sustituirlo',
  s.includes('const veredicto = mensajeEstado(lectura, null);') &&
    s.includes('const mensaje = motivo ? `${veredicto} ${motivo}` : veredicto;')
);
ok('ya no pasa null como mensaje y se queda ciego', !s.includes('const mensaje = mensajeEstado(lectura, null);'));

// ─────────── 3) Ni una copia mas del bucle ───────────
const COPIAS = [
  'src/services/dgii/msellerClient.ts',
  'src/app/api/v1/ecf/dgii-status/batch/route.ts',
  'src/services/dgii/sincronizarPendientes.ts',
];
const conCopia: string[] = [];
for (const ruta of COPIAS) {
  const t = sinComentarios(crudo(ruta));
  // La marca de una copia: recorrer dgiiResponse buscando `mensajes`.
  if (t.includes('parsed.mensajes') || t.includes('parsed?.mensajes') || t.includes('.filter((m) => m.valor')) {
    conCopia.push(ruta.split('/').pop()!);
  }
}
ok(`no queda ninguna copia del bucle (con copia: ${conCopia.length ? conCopia.join(', ') : 'ninguna'})`, conCopia.length === 0);
ok('los tres ficheros usan la funcion', COPIAS.every((r) => crudo(r).includes('motivoDgii(')));

s = crudo('src/services/dgii/msellerClient.ts');
ok(
  'msellerClient ya no declara su propia interfaz del mensaje',
  !s.includes('interface MensajeDgii') && !s.includes('dgiiMessages') && !s.includes('validMsgs')
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
