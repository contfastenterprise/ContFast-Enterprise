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

// ═══════ La pantalla imprimia y mandaba el correo sin esperar a la DGII ═══════
//
// El backend ya no genera nada sin veredicto, pero la pantalla de facturacion
// hacia las dos cosas por su cuenta, medio segundo despues de emitir:
//
//   1. `window.open(.../print)` a los 500 ms. Esa ruta arma el PDF al vuelo
//      leyendo la factura, asi que salia el comprobante provisional: sin codigo
//      de seguridad, sin fecha de firma y sin QR, porque a esa altura la DGII
//      todavia no ha contestado.
//
//   2. `POST .../email`, que es la ruta del boton de REENVIAR. Entra con
//      `esReenvio: true`, o sea que se salta las dos guardas nuevas: la de
//      exigir factura aceptada y la marca de idempotencia. El correo automatico
//      al aceptar seguia estando, asi que el cliente acababa recibiendo DOS.

const s = crudo('src/app/dashboard/invoices/page.tsx');
const sc = sinComentarios(s);

// ─────────── 1) Imprimir: solo lo aceptado ───────────
ok('no se abre la impresion sin veredicto', sc.includes("if (postAction === 'print' && estadoEmitido === 'accepted') {"));
ok(
  'hay un solo sitio que abre la impresion',
  sc.includes('const abrirImpresion = () => {') && sc.split("/print`, '_blank')").length - 1 === 1
);
ok(
  'cuando la DGII acepta se ofrece el boton de imprimir',
  sc.includes("action: { label: 'Imprimir', onClick: abrirImpresion }")
);
ok(
  'la nota explica por que se ofrece el boton en vez de abrir la ventana',
  s.includes('lo bloquea el navegador') || s.includes('bloquea `window.open` fuera de un gesto')
);
ok(
  'si sigue pendiente y se pidio imprimir, se dice',
  sc.includes("toast.info('El comprobante se imprime cuando la DGII conteste', {")
);

// ─────────── 2) El correo no se pide desde la pantalla ───────────
// En HEAD habia TRES llamadas a esa ruta: dos en la emision (las dos ramas del
// post-action) y una en el boton de reenviar. Solo debe quedar la del boton.
ok(
  'la emision ya no pide el correo por la ruta de reenviar',
  sc.split('fetch(`/api/v1/invoices/${invoiceId}/email`').length - 1 === 1
);
// `handleResendEmail` existia ya, asi que comprobar que existe no distingue
// nada. Lo que distingue es DONDE cae la llamada: en HEAD la primera estaba en
// la emision, que va antes en el fichero.
ok(
  'la unica llamada que queda cae dentro del boton de reenviar',
  sc.includes('const handleResendEmail = async (invoiceId: string) => {') &&
    sc.indexOf('fetch(`/api/v1/invoices/${invoiceId}/email`') >
      sc.indexOf('const handleResendEmail = async (invoiceId: string) => {')
);
ok('la nota explica que el correo lo manda el backend al aceptar', s.includes('La pantalla no tiene que pedirlo'));
ok(
  'y explica por que el atajo se saltaba las guardas',
  s.includes('se salta las dos guardas') && s.includes('dos correos')
);

// ─────────── 3) Un boton que no hacia nada distinto ───────────
// "Emitir y Enviar por Correo" hacia ya lo mismo que "Solo Guardar", porque el
// correo lo manda el backend al aceptar se pulse lo que se pulse.
ok(
  'no queda el boton de emitir y enviar por correo',
  !sc.includes("handleSubmitTrigger(undefined, 'email');") && s.includes('Dos botones iguales no son una')
);
ok(
  "'email' ya no es una accion posible tras emitir",
  !sc.includes("'print' | 'email' | 'none'") && sc.includes("postAction?: 'print' | 'none'")
);
ok('la pantalla dice cuando sale el correo', sc.includes('El correo al cliente sale cuando la DGII acepta.'));

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
