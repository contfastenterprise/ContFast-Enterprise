/**
 * "Añadir Línea", en el registro de compras, baja al pie de la tabla.
 *
 * Estaba arriba a la derecha, en la misma barra que el titulo "Líneas de Compra
 * / Gasto". El sitio donde la vista se queda mientras escribes una compra es el
 * final de la ultima fila, no la cabecera: para añadir la siguiente linea habia
 * que subir la mirada a la esquina contraria y volver.
 *
 * Lo que este banco defiende, ademas de la posicion:
 *
 *   - EL BOTON NO PUEDE ACABAR DENTRO DEL `overflow-x-auto`. Esa caja es la que
 *     se desplaza en horizontal cuando la tabla no cabe. Un boton metido ahi se
 *     va con el desplazamiento y desaparece de la vista justo en las pantallas
 *     estrechas, que son en las que mas falta hace. Tiene que ser HERMANO de la
 *     tabla, no hijo del scroll.
 *
 *   - Y SIGUE HABIENDO UNO SOLO. Mover un boton copiando y pegando deja dos: el
 *     nuevo abajo y el viejo arriba, los dos funcionando.
 */
import { crudo as crudoCrudo } from './_fuente';

const c = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const COMPRAS = 'src/app/dashboard/purchases/page.tsx';
const BOTON = 'onClick={addLine}';

const src = c(COMPRAS);

// La tarjeta de lineas, acotada: el fichero pasa de 120 KB y tiene mas de una
// tabla, asi que buscar en todo el devolveria aciertos por casualidad.
//
// EL ANCLA DE CIERRE ERA UN COMENTARIO, Y SE FUE.
// Cerraba en `{/* Resumen y Config */}`. P2-35 desmonto esa columna para
// repartirla en pasos, el comentario dejo de existir, el recorte salio vacio y
// las cinco comprobaciones de abajo fallaron a la vez -- sin que el boton, que
// es lo que este banco defiende, se hubiera movido un pixel.
//
// Ahora cierra en `const paso3`, que es una frontera de CODIGO y no un rotulo:
// mientras el formulario tenga pasos, la tarjeta de lineas esta antes del
// tercero. Y si algun dia tampoco existe, el banco revienta diciendolo en vez
// de dar cinco fallos que no significan lo que parece.
const ini = src.indexOf('Líneas de Compra / Gasto');
const fin = src.indexOf('const paso3', ini);
if (ini === -1 || fin === -1) {
  throw new Error(
    'No se pudo acotar la tarjeta de lineas de compras ' +
    `(inicio ${ini}, fin ${fin}). Cambio la estructura de la pantalla: ` +
    'arregla los anclajes antes de creerte nada de lo que siga.'
  );
}
const tarjeta = src.slice(ini, fin);

// La cabecera: del <h3> al cierre del div que lo envuelve.
const finH3 = tarjeta.indexOf('</h3>');
const cabecera = finH3 !== -1 ? tarjeta.slice(0, tarjeta.indexOf('</div>', finH3)) : '';

const iBoton = tarjeta.indexOf(BOTON);
const iTabla = tarjeta.indexOf('</table>');
const iScroll = tarjeta.indexOf('overflow-x-auto');

// ─── el boton sale de la cabecera ───────────────────────────────────────
{
  // "Se encuentra la tarjeta" no es una comprobacion -- sale igual antes y
  // despues de cualquier arreglo --, es la condicion para comprobar. Por eso
  // esta arriba como excepcion y no como un `ok(...)` mas.
  ok('la cabecera ya no lleva el boton',
    cabecera !== '' && !cabecera.includes(BOTON));

  // Acotado a la ventana justo anterior al <h3>: buscar la clase en todo el
  // fichero acertaria con cualquier otra barra igual que haya en la pagina.
  ok('la cabecera deja de ser una barra de dos elementos',
    ini !== -1
    && !src.slice(Math.max(0, ini - 400), ini).includes('flex justify-between items-center mb-4'));
}

// ─── y baja al pie de la tabla, a la izquierda ──────────────────────────
{
  ok('el boton va despues del cierre de la tabla',
    iBoton !== -1 && iTabla !== -1 && iBoton > iTabla);

  // Antes esto pasaba tambien -- con el boton en la cabecera tampoco estaba
  // dentro del scroll --, asi que no comprobaba nada. Apretada: entre el cierre
  // de la tabla y el boton tiene que haber un `</div>`, el del contenedor que
  // se desplaza. Eso es lo que de verdad lo hace hermano y no hijo.
  const tramo = iTabla !== -1 && iBoton > iTabla ? tarjeta.slice(iTabla, iBoton) : '';
  ok('el contenedor que se desplaza cierra ANTES del boton',
    iScroll !== -1 && tramo.includes('</div>'));

  ok('alineado a la izquierda',
    iTabla !== -1 && tarjeta.slice(iTabla).includes('flex justify-start'));
}

// ─── y sigue siendo UN solo boton que hace lo mismo ─────────────────────
{
  ok('hay exactamente un boton de añadir linea, y esta debajo de la tabla',
    tarjeta.split(BOTON).length - 1 === 1
    && iBoton > iTabla
    && iTabla !== -1
    && tarjeta.slice(iTabla).includes('Añadir Línea'));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
