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

// ═══════ Al llegar la aceptacion, el papel sale solo ═══════
//
// Se ofrecia unicamente el boton "Imprimir" en el aviso, y quien emite espera
// el papel sin tener que pulsar nada. El motivo de no abrir la ventana era
// real -- a los cinco segundos ya no estamos dentro del gesto del usuario y el
// navegador PUEDE bloquearla -- pero renunciar por si acaso es peor, porque la
// mayoria de las veces no la bloquea.
//
// Ahora se intenta, y `window.open` dice si pudo: devuelve null cuando el
// navegador lo impide. Solo entonces aparece el boton, cuyo clic si es un gesto
// y no se bloquea nunca. Y el aviso lo explica: un bloqueo silencioso es
// exactamente la misma queja de partida.
//
// (Que no se imprima nada sin aceptacion, y que haya un solo sitio que abre la
// impresion, los comprueba scratch/verificar_impresion_tras_veredicto.ts.)

const s = crudo('src/app/dashboard/invoices/page.tsx');
const sc = sinComentarios(s);

ok(
  'abrirImpresion dice si el navegador la dejo abrir',
  sc.includes('const abrirImpresion = (): boolean => {') &&
    sc.includes("const ventana = window.open(`/api/v1/invoices/${invoiceId}/print`, '_blank');") &&
    sc.includes('return !!ventana;')
);
ok(
  'al llegar la aceptacion se intenta abrir sola',
  sc.includes("const seAbrio = postAction === 'print' ? abrirImpresion() : true;")
);
ok('el boton aparece SOLO si el navegador la bloqueo', sc.includes("...(postAction === 'print' && !seAbrio"));
ok(
  'y el aviso dice que la bloqueo, en vez de callarse',
  sc.includes('El navegador bloqueó la ventana de impresión.')
);
ok('la nota explica por que se intenta en vez de renunciar', s.includes('No siempre lo hace, asi que se intenta'));

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
