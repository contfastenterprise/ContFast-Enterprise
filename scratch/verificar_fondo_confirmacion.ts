/**
 * Lote 216 -- el dialogo de confirmacion, con el fondo y el pie del resto de la aplicacion.
 *
 * Reportado por el dueño el 2026-09-27: en Codigos de Barra, "Autogenerar Faltantes" lanza
 * un dialogo cuyo fondo "no es consistente con la app". No era de esa pantalla: es el de
 * TODAS las confirmaciones (useConfirm -> ConfirmDialog -> AlertDialog, 29 ficheros), y
 * traia los colores de la plantilla:
 *   - fondo `bg-black/10`: apenas oscurecia; la pagina de detras quedaba casi tan viva como
 *     la ventana. Los modales escritos a mano usan `bg-black/60 backdrop-blur-sm`;
 *   - pie con franja gris (`bg-muted/50`), que ningun otro modal lleva;
 *   - y una LINEA OSCURA sobre el pie, que solo se vio al dibujarlo: en Tailwind 4 un
 *     `border-t` sin color toma `currentColor` (en la 3 era un gris claro).
 *
 * Lo que se vigila es la PROPIEDAD:
 *   - el fondo de la confirmacion oscurece como el MODAL COMPARTIDO (dialog.tsx) y
 *     desenfoca como la mayoria de los fondos, DERIVADO contando en src/ (lote 244: la
 *     oscuridad dejo de contarse, ver abajo);
 *   - todo borde del dialogo lleva su color (la trampa de Tailwind 4);
 *   - ni la ventana ni el pie usan colores del tema que aqui no corresponden.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');

let fallos = 0;
let contadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  contadas++;
  if (!c) fallos++;
};

const ALERTA = 'src/components/ui/alert-dialog.tsx';
const CONFIRMACION = 'src/components/ui/confirm-dialog.tsx';
const DIALOGO = 'src/components/ui/dialog.tsx';
const PROVEEDOR = 'src/providers/confirm-provider.tsx';

function ficheros(dir: string): string[] {
  const res: string[] = [];
  for (const n of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(raiz, rel)).isDirectory()) res.push(...ficheros(rel));
    else if (/\.tsx$/.test(n)) res.push(rel);
  }
  return res;
}

/** El `className` por defecto de un componente del fichero: la primera cadena de su `cn(`. */
function clasesDe(src: string, componente: string): string {
  const i = src.indexOf(`function ${componente}(`);
  if (i < 0) return '';
  const cuerpo = src.slice(i, src.indexOf('\nfunction ', i + 1) > 0 ? src.indexOf('\nfunction ', i + 1) : undefined);
  return /cn\(\s*"([^"]*)"/.exec(cuerpo)?.[1] ?? '';
}

function main() {
  //  PRECONDICIONES, ciertas en los DOS estados: la confirmacion compartida sigue pasando
  //  por estos componentes. Si alguien la reescribe con otros, el banco se niega a correr.
  const alerta = leer(ALERTA);
  const confirmacion = leer(CONFIRMACION);
  if (!alerta || !confirmacion || !leer(PROVEEDOR)) throw new Error('Precondicion: falta alguno de los tres ficheros de la confirmacion');
  if (!/<ConfirmDialog\b/.test(leer(PROVEEDOR))) throw new Error('Precondicion: useConfirm ya no pinta ConfirmDialog');
  for (const c of ['AlertDialogContent', 'AlertDialogFooter']) {
    if (!new RegExp(`<${c}\\b`).test(confirmacion)) throw new Error(`Precondicion: ConfirmDialog ya no usa ${c}`);
  }
  if (!/<AlertDialogOverlay\s*\/>/.test(alerta)) throw new Error('Precondicion: AlertDialogContent ya no pinta su fondo');
  console.log('  pre   la confirmacion sigue siendo ConfirmDialog -> AlertDialog, con su fondo');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) El fondo, el de los demas modales -- DERIVADO\n');
  // ───────────────────────────────────────────────────────────────────────────
  const fondo = clasesDe(alerta, 'AlertDialogOverlay');
  const oscuridad = (s: string) => /\bbg-black\/(\d+)\b/.exec(s)?.[1] ?? null;
  const desenfoque = (s: string) => /backdrop-blur-(\w+)\b/.exec(s)?.[1] ?? null;
  // LA OSCURIDAD, la del modal compartido (`dialog.tsx`, lote 214). Hasta el lote 244 se
  // derivaba CONTANDO los modales escritos a mano, y dejo de valer: cada pantalla que pasa
  // su alta a pestanas quita un modal, y al quitar los de clientes y suplidores la cuenta
  // cambio de ganador (bg-black/40, seis veces) sin que nadie tocara la confirmacion. Un
  // recuento que se mueve solo no es una convencion; el modal compartido si lo es.
  // Su fondo es el primer `className` tras el comentario que lo rotula.
  const compartido = /\{\/\* Backdrop \*\/\}[^]*?className="([^"]*)"/.exec(leer(DIALOGO))?.[1] ?? '';
  if (!oscuridad(compartido)) throw new Error('Precondicion: el modal compartido (dialog.tsx) ya no declara su fondo');
  ok('oscurece como el modal compartido', oscuridad(fondo) === oscuridad(compartido), `bg-black/${oscuridad(fondo)} frente a bg-black/${oscuridad(compartido)}`);
  // EL DESENFOQUE, tambien el del modal compartido (LOTE 276). Hasta entonces se derivaba
  // CONTANDO los fondos escritos a mano, y los lotes 277-280 pasan esas ventanas al `Modal`:
  // la cuenta se quedaria sin convencion y el banco se negaria a correr sin que nadie tocara
  // la confirmacion — lo mismo que paso con la oscuridad en el 244. El 276 le dio al modal
  // compartido el desenfoque que mas se repetia entre ellos (`blur-sm`).
  const desCasa = desenfoque(compartido);
  if (!desCasa) throw new Error('Precondicion: el modal compartido (dialog.tsx) ya no declara su desenfoque');
  ok('  y desenfoca como el modal compartido', desenfoque(fondo) === desCasa, `blur-${desenfoque(fondo)} frente a blur-${desCasa}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) La ventana y el pie\n');
  // ───────────────────────────────────────────────────────────────────────────
  const ventana = clasesDe(alerta, 'AlertDialogContent');
  const pie = clasesDe(alerta, 'AlertDialogFooter');
  ok('la ventana es blanca, con borde y sombra', /\bbg-white\b/.test(ventana) && /\bshadow-2xl\b/.test(ventana) && !/\bbg-popover\b/.test(ventana));
  ok('el pie es blanco: sin la franja gris', /\bbg-white\b/.test(pie) && !/\bbg-muted\b/.test(pie));
  // Tailwind 4: un borde sin color es `currentColor`. Cada `border`, `border-t`... del
  // dialogo tiene que ir acompañado de un color de borde en las mismas clases.
  const sinColor = [['ventana', ventana], ['pie', pie]]
    .filter(([, c]) => /(^|\s)border(-[trblxy])?(\s|$)/.test(c) && !/(^|\s)border-(slate|gray|neutral|zinc|white|black|transparent|\[)/.test(c))
    .map(([n]) => n);
  ok('todo borde lleva su color (en Tailwind 4 el de defecto es el del texto)', sinColor.length === 0, sinColor.join(', ') || 'ventana y pie');

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} (${contadas} comprobaciones)`);
  process.exit(fallos === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(2);
}
