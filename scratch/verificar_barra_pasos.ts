/**
 * La barra de pasos tiene nombre tambien en un movil.
 *
 * EL FALLO
 * --------
 * En las tres pantallas con asistente -- compras (lote 82), facturas (87) y
 * productos (89) -- el boton de cada paso pone el titulo dentro de un
 * `<span className="hidden sm:inline">`. Por debajo del corte `sm` ese span no
 * se pinta, asi que el boton se queda con dos cosas: el numero, y un icono de
 * visto que ya va marcado `aria-hidden`. Resultado: en un movil, un lector de
 * pantalla anuncia "1", "2", "3" y nada mas. La barra de navegacion del
 * formulario deja de decir a donde lleva cada boton.
 *
 * COMO LLEGO A LAS TRES
 * ---------------------
 * Copiada. La barra se escribio en compras y de ahi paso a facturas y a
 * productos tal cual. Es el mismo hueco tres veces, que es justo el patron que
 * esta auditoria lleva cerrando: se arregla en las tres a la vez o vuelve en la
 * cuarta.
 *
 * POR QUE EL `aria-label` DICE MAS QUE EL TITULO
 * ----------------------------------------------
 * En la version ancha, que un paso este hecho o sea el actual se VE: el color y
 * el visto lo dicen. Un `aria-label` con solo el titulo taparia el contenido del
 * boton y se llevaria por delante esa informacion. Por eso lleva tambien el
 * numero, el total y el estado.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Que un lector de pantalla lo lea. Eso no es nuestro. Lo que se comprueba es
 * que el nombre este puesto en las tres, que se construya con el titulo de
 * verdad (y no con un texto fijo que se quedaria desfasado al renombrar un
 * paso), y que las tres barras sigan siendo la misma.
 */
import { fuente, crudo } from './_fuente';

const PANTALLAS: [string, string][] = [
  ['compras',   'src/app/dashboard/purchases/page.tsx'],
  ['facturas',  'src/app/dashboard/invoices/page.tsx'],
  ['productos', 'src/app/dashboard/products/page.tsx'],
];

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

/** Lo que hay entre dos marcadores. */
function entre(src: string, desde: string, hasta: string): string {
  const a = src.indexOf(desde);
  if (a < 0) return '';
  const b = src.indexOf(hasta, a + desde.length);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);

const barras: Record<string, string> = {};
for (const [nombre, ruta] of PANTALLAS) {
  const src = fuente(ruta).replace(/\r\n/g, '\n');
  // Precondicion, no comprobacion: si la pantalla no se pudo leer o la barra no
  // se pudo aislar, todo lo que sigue son negaciones sobre una cadena vacia --
  // ciertas gratis -- y este banco daria verde sin haber mirado nada.
  if (src.length < 50000) {
    throw new Error(`No se pudo leer ${ruta}. Revisa las rutas antes de creerte nada.`);
  }
  const bl = entre(src, 'const barraPasos = () => (', 'const botonVista = () => (');
  if (bl.length < 800) {
    throw new Error(
      `No se pudo aislar la barra de pasos de ${nombre}. El marcador cambio, o ` +
      'la barra se movio: revisa esto antes de creerte el resto.'
    );
  }
  barras[nombre] = bl;
}

for (const [nombre] of PANTALLAS) {
  const bl = barras[nombre];

  ok(`${nombre}: el boton de cada paso tiene nombre accesible`,
    tiene(bl, 'aria-label={`Paso ${p.n} de ${PASOS.length}: ${p.titulo}'));

  // Un texto fijo ("Paso 1", "Paso 2") se quedaria desfasado el dia que se
  // renombre o se reordene un paso, y nadie lo notaria: el nombre accesible no
  // se ve. Tiene que salir de la MISMA tabla que pinta el boton.
  ok(`${nombre}: el nombre sale de la tabla de pasos, no de un texto fijo`,
    tiene(bl, '${p.titulo}') && tiene(bl, '${p.n}') && tiene(bl, '${PASOS.length}'));

  // En la version ancha el estado se ve (el color, el visto). Al tapar el
  // contenido con un `aria-label`, hay que devolverlo.
  ok(`${nombre}: y dice si el paso esta hecho o es el actual`,
    tiene(bl, "' (completado)'") && tiene(bl, "' (actual)'"));

  // Estas dos NO son comprobaciones: salian OK antes del arreglo tambien,
  // porque ya estaban bien. Van como excepcion porque son la CONDICION de que
  // lo de arriba signifique algo:
  //
  //  - sin el `hidden sm:inline` no hay fallo que arreglar (el titulo se veria
  //    siempre), asi que el `aria-label` dejaria de ser necesario y nadie se
  //    enteraria de que se puede quitar;
  //  - y si alguien "arregla" esto enseñando el texto en vez de nombrando el
  //    boton, la barra deja de caber en un movil.
  if (!tiene(bl, 'className="hidden sm:inline">{p.titulo}</span>')) {
    throw new Error(
      `En ${nombre} el titulo del paso ya no esta oculto en pantalla estrecha. ` +
      'Si eso fue a proposito, este banco entero sobra; si no, revisalo antes ' +
      'de creerte el resto.'
    );
  }
  if (!tiene(bl, "aria-current={p.n === paso ? 'step' : undefined}")
      || !tiene(bl, 'aria-hidden="true"')) {
    throw new Error(
      `En ${nombre} se perdio el aria-current o el separador decorativo al ` +
      'tocar la barra de pasos.'
    );
  }
}

// Las tres barras son la misma: si una se toca y las otras no, vuelve la copia
// desparejada que es como nacio este fallo.
// Facturas escribe el dorado en mayusculas (`#C5A059`) y compras y productos en
// minusculas, en TODO el fichero, no solo aqui. Es un estilo por fichero, no una
// divergencia de la barra: comparar distinguiendo mayusculas lo convertia en un
// fallo. El rotulo del <nav> si cambia a proposito ("del registro", "de la
// emision", "del producto").
const normal = (s: string) => s
  .replace(/\s+/g, ' ')
  .replace(/aria-label="Pasos[^"]*"/, 'X')
  .replace(/#[0-9a-fA-F]{6}/g, (h) => h.toLowerCase())
  .trim();
// "son la misma" a secas salia OK antes del arreglo: las tres carecian del
// nombre por igual. Lo que hace falta es que sean la misma Y que lo que
// comparten incluya el nombre accesible -- si no, el dia que se arregle una sola
// esto se pone rojo, que es justo para lo que sirve.
const iguales = new Set(PANTALLAS.map(([n]) => normal(barras[n])));
ok('las tres barras son la MISMA, y lo que comparten lleva el nombre accesible',
  iguales.size === 1 && [...iguales][0].includes('aria-label={`Paso ${p.n} de ${PASOS.length}'));

// Un contrato que no se escribe se rompe sin que nadie lo note -- y menos este,
// que no se ve en pantalla.
//
// OJO: la primera version buscaba `hidden sm:inline`, que esta en el className.
// O sea que pasaba con comentario y sin el: no comprobaba nada. Se ancla en una
// frase del docblock que no aparece en el codigo.
ok('queda escrito por que el nombre no es decorativo',
  PANTALLAS.every(([, ruta]) => {
    const aplanado = crudo(ruta).replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ');
    return aplanado.includes('un lector de pantalla en un movil oye');
  }));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
