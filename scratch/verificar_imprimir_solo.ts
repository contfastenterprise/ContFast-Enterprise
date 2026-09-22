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
// LOTE 180: EL PROBLEMA DE PARTIDA DESAPARECIO, no se resolvio mejor.
//
// Todo esto existia porque el papel salia a los cinco segundos, FUERA del gesto
// del usuario, donde el navegador puede bloquear la ventana. Desde el lote 180
// se imprime EN EL CLIC -- ya no hay que esperar el veredicto para tener el
// timbre --, y dentro del gesto el navegador no bloquea. El respaldo se queda
// igualmente, porque un bloqueo silencioso sigue siendo la queja de partida.
ok(
  'se intenta abrir sola, y en el CLIC (que es cuando el navegador no bloquea)',
  sc.includes('} else if (!abrirImpresion()) {') && !sc.includes('setTimeout(abrirImpresion')
);
ok('el boton aparece SOLO si el navegador la bloqueo',
  sc.includes("action: { label: 'Imprimir', onClick: () => { abrirImpresion(); } },"));
ok(
  'y el aviso dice que la bloqueo, en vez de callarse',
  s.includes('El navegador bloqueó la ventana de impresión')
);
ok('la nota explica por que se imprime en el clic y no despues',
  s.includes('DENTRO DEL GESTO DEL USUARIO'));
// Al llegar la aceptacion NO se imprime otra vez: serian dos papeles del mismo
// comprobante, uno "Pendiente" y otro "Firma Digital Valida".
//
// LOTE 181: y tampoco se ofrece reimprimir, porque ya no hay aviso donde
// ofrecerlo -- la aceptacion no se anuncia (decision del dueño, 2026-09-22): es
// lo que tiene que pasar. Quien quiera el papel con la leyenda definitiva lo
// reimprime desde el listado.
ok('al aceptar no se reimprime sola',
  !sc.includes("const seAbrio = postAction === 'print' ? abrirImpresion() : true;")
  && !sc.includes('Reimprimir con la firma'));

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
