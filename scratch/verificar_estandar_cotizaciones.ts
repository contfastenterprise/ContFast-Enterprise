/**
 * Cotizaciones: el tamaño de los controles, los espacios y las cifras.
 *
 * Las tres pantallas de cotizaciones iban cada una por su lado. El estandar se
 * toma de `purchases/page.tsx`, que es el mas consistente del proyecto: 13
 * tarjetas en `p-4`, 17 controles en `h-8` y CERO en h-9/h-10/h-11.
 *
 *     control  ->  h-8 px-3 py-1.5 text-xs rounded-lg
 *     tarjeta  ->  rounded-xl p-4
 *     cifra    ->  font-mono-data, alineada a la derecha
 *
 * LO QUE NO ERA SOLO ESTETICO
 * El resumen financiero de la pantalla de EDICION pintaba los importes con
 * `toFixed(2)`, que no separa los miles: "RD$ 1200.00". El alta de la misma
 * cotizacion usaba `toLocaleString('es-DO')` y decia "RD$ 1,200.00". El mismo
 * documento, dos caras distintas segun por donde entraras. Un total de siete
 * cifras mal leido es un error de precio, no de diseño.
 *
 * Y UNA DISTINCION QUE SE MANTIENE A PROPOSITO
 * `font-mono-data` (JetBrains Mono) es para CIFRAS. Los codigos de cotizacion
 * y las fechas se quedan en `font-mono`. El banco lo fija para que el cambio
 * no los arrastre de paso.
 */
import { crudo as crudoCrudo } from './_fuente';

const c = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const NUEVO = c('src/app/dashboard/quotes/new/page.tsx');
const EDITAR = c('src/app/dashboard/quotes/[id]/edit/page.tsx');
const LISTA = c('src/app/dashboard/quotes/page.tsx');

const MONEDA = "toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })";

/** Clases de control que se salen del alto o del padding de la casa. */
function controlesFuera(src: string): string[] {
  const fuera = /\b(py-3|py-2\.5|h-9|h-10|h-11|p-5|p-6|p-8)\b/;
  const malos: string[] = [];
  const re = /className=\{?(?:clsx\(\s*)?["`]([^"`]+)["`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const cls = m[1];
    // `w-10 h-10` y compañia son tamaños de icono, no de control.
    if (fuera.test(cls) && !/\bw-\d+ h-\d+\b/.test(cls)) malos.push(cls.slice(0, 60));
  }
  return malos;
}

const veces = (s: string, t: string): number => s.split(t).length - 1;

// ─── alta de cotizacion ─────────────────────────────────────────────────
{
  ok('alta: no quedan controles ni tarjetas fuera de medida',
    controlesFuera(NUEVO).length === 0);

  ok('alta: los tres campos de linea llevan el alto de control',
    veces(NUEVO, 'w-full h-8 rounded-lg border px-3 py-1.5') === 3);

  ok('alta: cantidad y descuento alinean la cifra a la derecha',
    veces(NUEVO, 'font-mono-data text-right') === 2);

  ok('alta: los totales usan la tipografia tabular',
    veces(NUEVO, 'font-mono-data') >= 5);
}

// ─── edicion de cotizacion ──────────────────────────────────────────────
{
  ok('editar: no quedan controles ni tarjetas fuera de medida',
    controlesFuera(EDITAR).length === 0);

  // La de fondo: `toFixed` no separa los miles. Que no vuelva ninguno.
  ok('editar: ningun importe se pinta ya con toFixed',
    !EDITAR.includes('toFixed'));

  ok('editar: el resumen financiero separa los miles',
    veces(EDITAR, MONEDA) >= 5);

  ok('editar: los tres campos numericos alinean a la derecha',
    veces(EDITAR, 'font-semibold font-mono-data text-right') === 3);

  // El boton de guardar vivia arriba a la derecha, en la cabecera. Se guarda al
  // TERMINAR de editar, y terminar de editar es estar abajo. Va con el conteo
  // pegado: mover copiando y pegando deja dos botones que guardan.
  const iContenido = EDITAR.indexOf('{/* Content */}');
  const iGuardar = EDITAR.indexOf('Guardar Cambios');
  ok('editar: el boton de guardar baja al pie, y sigue siendo uno solo',
    iContenido !== -1 && iGuardar > iContenido && veces(EDITAR, 'Guardar Cambios') === 1);

  // Al pie, un desplegable que abre hacia abajo se sale de la pantalla. Es lo
  // mismo que ya hace el alta, que tiene su boton abajo desde siempre.
  ok('editar: su desplegable abre hacia ARRIBA',
    EDITAR.includes('absolute bottom-full right-0 mb-2')
    && !EDITAR.includes('absolute top-full right-0 mt-2'));
}

// ─── edicion: las lineas pasan de tarjetas a tabla ──────────────────────
{
  const TARJETA = 'flex flex-wrap items-start gap-4 p-4 bg-slate-50 rounded-xl';

  ok('editar: las lineas van en tabla y ya no en tarjeta por producto',
    EDITAR.includes('<table') && !EDITAR.includes(TARJETA));

  ok('editar: la cabecera se escribe UNA vez, no una por fila',
    veces(EDITAR, '<th ') === 6 && veces(EDITAR, 'Solo admin') === 1);

  // Si el total de fila se calculara con otra formula, la suma de las filas no
  // cuadraria con el total de abajo y no habria forma de saber cual miente.
  ok('editar: el total de fila sale de la misma cuenta que el resumen',
    EDITAR.includes('(lSub - lDisc) * (1 + line.taxRate)'));

  const iTabla = EDITAR.indexOf('</table>');
  const iAgregar = EDITAR.indexOf('Agregar Producto');
  ok('editar: el boton de agregar queda FUERA del desplazamiento horizontal',
    EDITAR.includes('overflow-x-auto') && iTabla !== -1 && iAgregar > iTabla);
}

// ─── edicion: cancelar ──────────────────────────────────────────────────
{
  const CANCELAR = "onClick={() => router.push('/dashboard/quotes')}\n              disabled={submitting}";

  ok('editar: hay un Cancelar al pie que vuelve al listado',
    EDITAR.includes(CANCELAR) && veces(EDITAR, '>\n              Cancelar\n') === 1);

  // Lo que no puede hacer es guardar de paso.
  const iCancelar = EDITAR.indexOf(CANCELAR);
  ok('editar: cancelar NO llama a saveQuote',
    iCancelar !== -1
    && !EDITAR.slice(iCancelar, EDITAR.indexOf('Cancelar', iCancelar)).includes('saveQuote'));
}

// ─── listado ────────────────────────────────────────────────────────────
{
  ok('lista: pestañas y botones de accion con alto de control',
    veces(LISTA, 'h-8 px-3 py-1.5 rounded-lg text-xs font-bold') === 2
    && veces(LISTA, 'h-8 w-8 inline-flex items-center justify-center') === 3);

  ok('lista: no queda ningun boton de accion con el radio viejo',
    !LISTA.includes('p-2 bg-slate-100 rounded text-'));

  ok('lista: los importes usan la tipografia tabular',
    veces(LISTA, 'font-mono-data') === 4);

  ok('lista: los codigos y fechas NO se convierten en cifras',
    (LISTA.match(/font-mono[^-]/g) || []).length === 3);
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
