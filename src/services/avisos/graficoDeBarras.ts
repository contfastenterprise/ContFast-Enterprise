/**
 * Lote 205 -- un grafico de barras dibujado a mano, en SVG, para meterlo en un PDF.
 *
 * POR QUE A MANO Y NO CON RECHARTS
 * --------------------------------
 * `recharts` es React de NAVEGADOR: necesita un DOM y se monta en un componente. Este
 * grafico se dibuja en el SERVIDOR, dentro del HTML que se le da a Chromium para hacer el
 * PDF, y ahi no hay React que montar. Ya habia precedente de construir SVG a mano en este
 * repositorio para un impreso: `DocumentTemplates.generateCode39Svg`, el codigo de
 * barras.
 *
 * POR QUE EL CASO "TODO A CERO" NO ES UN CASO RARO
 * -----------------------------------------------
 * Medido en PRODUCCION el 2026-09-26, y CUADRADO contra la base por dos caminos
 * independientes: de los catorce dias del periodo, **tres estan enteramente a cero** (el
 * 13, el 24 y el propio dia del informe) y solo **seis tienen ventas**. O sea que un
 * grafico "del dia" es, hoy mismo, dos barras en cero.
 *
 * (Correccion honesta: la primera medicion dijo "ultima venta el 14 de septiembre" y era
 * FALSA -- el guion imprimia las fechas como `Date` y el terminal las mostraba en hora
 * local, un dia antes. La ultima venta fue el 25, por RD$309.695,21. La conclusion no
 * cambia, pero el dato si, y un dato equivocado en un comentario sobrevive al que lo
 * escribio.)
 *
 * Con dias a cero, dividir por el
 * maximo cuando el maximo es 0 da `Infinity` o `NaN`, y un `NaN` en un atributo de SVG no
 * falla: dibuja una barra en un sitio imposible o no dibuja nada, sin un error. Por eso
 * el cero se resuelve ANTES de dividir, y el grafico sale con su eje y su leyenda
 * diciendo que no hubo movimiento -- que es informacion, no un hueco.
 *
 * Esta es la razon de que el grafico sea de CATORCE DIAS y no del dia: con este volumen,
 * "compras y ventas del dia" son dos barras y casi siempre las dos en cero. Decision del
 * dueño el 2026-09-26, tras ver la medicion.
 *
 * SIN DEPENDENCIAS Y SIN `@/db`: se prueba sin red, sin base de datos y sin navegador,
 * que es lo que permite que el banco ejecute la aritmetica de verdad (leccion del lote
 * 178, donde el modulo que decidia arrastraba la conexion).
 */

/** Un dia de la serie. Los importes en pesos, no en centavos. */
export interface DiaDelGrafico {
  /** El dia en 'AAAA-MM-DD'. Es el dia de RD, no el del servidor (lote 174). */
  dia: string;
  compras: number;
  ventas: number;
}

export interface OpcionesDelGrafico {
  /** Ancho y alto del lienzo, en puntos de usuario del SVG. */
  ancho?: number;
  alto?: number;
  /** El dia que se resalta, en 'AAAA-MM-DD'. Normalmente hoy. */
  destacado?: string;
}

const ANCHO = 680;
const ALTO = 250;
//  Sitio para las etiquetas: a la izquierda los importes, abajo los dias.
//
//  LOS MARGENES SALEN DE MIRAR EL PDF, no de calcularlos. Con 10 arriba y 30 abajo, el
//  rotulo "RD$" se montaba encima de la primera cifra del eje y el nombre del mes se
//  comia la leyenda -- las dos cosas ilegibles, y ninguna la ve un banco: solo se ven
//  dibujando el informe y abriendolo.
const MARGEN_IZQ = 62;
const MARGEN_DER = 8;
const MARGEN_SUP = 20;
const MARGEN_INF = 48;

const COLOR_COMPRAS = '#003366';
const COLOR_VENTAS = '#c5a059';
const COLOR_EJE = '#d4d4d8';
const COLOR_TEXTO = '#52525b';
const COLOR_DESTACADO = '#f4f4f5';

/**
 * Los meses abreviados, en español.
 *
 * A mano y no con `toLocaleDateString('es-DO', { month: 'short' })`: eso depende de los
 * datos de localizacion del proceso, que en un servidor de Node pueden no estar y darian
 * "Sep" en ingles -- y ademas el barrido del lote 202 no admite un `toLocale*` de fecha en
 * `src/` (`verificar_fechas_impresas.ts`), por buenas razones.
 */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/**
 * Escapa lo que se mete en un nodo de texto del SVG.
 *
 * Los dias vienen de la base y son 'AAAA-MM-DD', asi que hoy no pueden traer nada raro.
 * Se escapa igual porque un SVG mal formado NO se queja: Chromium lo dibuja a medias y el
 * PDF sale con el grafico cortado, que es de los fallos mas dificiles de atribuir.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Un importe para el eje, corto. 1.500.000 -> "1.5M", 150.000 -> "150k".
 *
 * En el eje no caben los separadores de miles de un importe completo, y el eje no es donde
 * se leen las cifras exactas: esas van en el cuerpo del informe, con todos sus decimales.
 */
export function rotuloDeImporte(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return '0';
  if (valor >= 1_000_000) {
    const m = valor / 1_000_000;
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
  }
  if (valor >= 1_000) return `${Math.round(valor / 1_000)}k`;
  return String(Math.round(valor));
}

/**
 * El techo del eje: el mayor de todos los valores, o 0 si no hay ninguno.
 *
 * Se mira TAMBIEN el de compras y el de ventas juntos, y no un eje por serie: dos ejes
 * distintos harian que una barra de 5.000 pareciera igual de alta que una de 500.000, que
 * es justo la comparacion que el grafico existe para hacer.
 *
 * Se descartan los valores que no son numeros finitos. Un `NaN` que llegara de una suma
 * de la base (una columna nula, un `CAST` que no cuadra) contaminaria el maximo y con el
 * TODAS las barras: se preferiria no dibujar esa a romper el grafico entero.
 */
export function techoDelEje(serie: readonly DiaDelGrafico[]): number {
  let techo = 0;
  for (const d of serie) {
    for (const v of [d.compras, d.ventas]) {
      if (Number.isFinite(v) && v > techo) techo = v;
    }
  }
  return techo;
}

/**
 * El SVG del grafico. Devuelve siempre una cadena con un `<svg>` valido, incluso sin
 * datos: un informe al que le falta el grafico se lee como un informe roto.
 */
export function graficoDeBarrasSvg(
  serie: readonly DiaDelGrafico[],
  opciones: OpcionesDelGrafico = {},
): string {
  const ancho = opciones.ancho ?? ANCHO;
  const alto = opciones.alto ?? ALTO;
  const anchoUtil = ancho - MARGEN_IZQ - MARGEN_DER;
  const altoUtil = alto - MARGEN_SUP - MARGEN_INF;
  const base = MARGEN_SUP + altoUtil;

  const techo = techoDelEje(serie);
  //  EL CERO SE RESUELVE ANTES DE DIVIDIR. Con `techo === 0` no se dibuja ninguna barra
  //  --no hay nada que dibujar-- y se dice por que; lo que NO se hace es dividir por cero
  //  y dejar que `NaN` acabe en un atributo del SVG, donde no daria error ninguno.
  const hayMovimiento = techo > 0;

  const partes: string[] = [];
  partes.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" `
    + `viewBox="0 0 ${ancho} ${alto}" font-family="Helvetica, Arial, sans-serif">`,
  );

  //  LA UNIDAD, DICHA UNA VEZ arriba del eje. Sin ella, "150k" no dice si son pesos,
  //  unidades o documentos -- y el informe lo lee alguien que no escribio el grafico.
  partes.push(
    `<text x="${MARGEN_IZQ - 6}" y="${MARGEN_SUP - 8}" text-anchor="end" font-size="7" `
    + `font-weight="bold" fill="${COLOR_TEXTO}" letter-spacing="0.5">RD$</text>`,
  );

  //  Rejilla horizontal y sus importes. Cuatro lineas: mas se lee como un rayado. A
  //  trazos y no continua, para que no compita con las barras -- la linea de base si es
  //  continua, porque esa SI es un dato (el cero).
  const LINEAS = 4;
  for (let i = 0; i <= LINEAS; i++) {
    const y = MARGEN_SUP + (altoUtil * i) / LINEAS;
    const esBase = i === LINEAS;
    partes.push(
      `<line x1="${MARGEN_IZQ}" y1="${y.toFixed(1)}" x2="${ancho - MARGEN_DER}" y2="${y.toFixed(1)}" `
      + `stroke="${esBase ? COLOR_TEXTO : COLOR_EJE}" stroke-width="${esBase ? 0.9 : 0.5}"`
      + `${esBase ? '' : ' stroke-dasharray="2 3"'}/>`,
    );
    const valor = hayMovimiento ? (techo * (LINEAS - i)) / LINEAS : 0;
    partes.push(
      `<text x="${MARGEN_IZQ - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" `
      + `font-size="8" fill="${COLOR_TEXTO}">${esc(rotuloDeImporte(valor))}</text>`,
    );
  }

  if (serie.length > 0) {
    //  Cada dia ocupa una franja; dentro van las dos barras, pegadas, con aire a los
    //  lados. `Math.max(1, ...)` en el ancho de la barra: con 30 dias el reparto puede
    //  bajar de un punto y una barra de ancho 0 no se ve -- seria un dia que "no existe".
    const franja = anchoUtil / serie.length;
    const anchoBarra = Math.max(1, (franja - 4) / 2);

    for (const [i, d] of serie.entries()) {
      const x0 = MARGEN_IZQ + franja * i;

      if (opciones.destacado && d.dia === opciones.destacado) {
        //  El dia de hoy se resalta con un fondo, no con otro color de barra: el color
        //  distingue compras de ventas y no puede significar dos cosas a la vez.
        partes.push(
          `<rect x="${x0.toFixed(1)}" y="${MARGEN_SUP}" width="${franja.toFixed(1)}" `
          + `height="${altoUtil}" fill="${COLOR_DESTACADO}"/>`,
        );
      }

      const dibujarBarra = (valor: number, desplazamiento: number, color: string): void => {
        if (!hayMovimiento || !Number.isFinite(valor) || valor <= 0) return;
        const h = (valor / techo) * altoUtil;
        //  ALTURA MINIMA DE 1: un importe pequeño al lado de uno de 300.000 da una altura
        //  por debajo de medio punto y desaparece -- el dia parece vacio teniendo
        //  movimiento, que es peor que una barra desproporcionada. Se redondea hacia
        //  arriba solo lo justo para que exista.
        const hVisible = Math.max(1, h);
        partes.push(
          `<rect x="${(x0 + 2 + desplazamiento).toFixed(1)}" y="${(base - hVisible).toFixed(1)}" `
          + `width="${anchoBarra.toFixed(1)}" height="${hVisible.toFixed(1)}" `
          + `fill="${color}" rx="1"/>`,
        );
      };
      dibujarBarra(d.compras, 0, COLOR_COMPRAS);
      dibujarBarra(d.ventas, anchoBarra, COLOR_VENTAS);

      //  La etiqueta es el DIA DEL MES, no la fecha entera: catorce fechas completas no
      //  caben y se solaparian. El MES se dice en el primer dia y cada vez que cambia, que
      //  es lo unico que hace falta para situar la serie -- sin eso, una serie que cruza
      //  de mes enseña "30 31 01 02" y no se sabe de cuando es.
      const mesCambia = i === 0 || d.dia.slice(0, 7) !== serie[i - 1]!.dia.slice(0, 7);
      partes.push(
        `<text x="${(x0 + franja / 2).toFixed(1)}" y="${base + 13}" text-anchor="middle" `
        + `font-size="8" fill="${COLOR_TEXTO}"${mesCambia ? ' font-weight="bold"' : ''}>`
        + `${esc(d.dia.slice(8, 10))}</text>`,
      );
      if (mesCambia) {
        partes.push(
          `<text x="${(x0 + franja / 2).toFixed(1)}" y="${base + 22}" text-anchor="middle" `
          + `font-size="6.5" fill="${COLOR_TEXTO}">${esc(MESES[Number(d.dia.slice(5, 7)) - 1] ?? '')}</text>`,
        );
      }
    }
  }

  //  Eje de abajo, encima de las barras para que su base quede limpia.
  partes.push(
    `<line x1="${MARGEN_IZQ}" y1="${base}" x2="${ancho - MARGEN_DER}" y2="${base}" `
    + `stroke="${COLOR_TEXTO}" stroke-width="1"/>`,
  );

  //  LA LEYENDA EXPLICA TODO LO QUE SE DIBUJA, no solo los dos colores (pedido del dueño,
  //  2026-09-26). Si el dia de hoy se resalta con un fondo, ese fondo es un elemento del
  //  grafico y tiene que estar en la leyenda: una marca sin explicar obliga a adivinar.
  //  Las entradas se colocan una tras otra midiendo el texto, en vez de con posiciones
  //  fijas -- con posiciones fijas, cambiar "Compras" por una palabra mas larga solapa la
  //  entrada siguiente y no se ve hasta abrir el PDF.
  const leyendaY = base + 39;
  const entradas: { color: string; texto: string; borde?: boolean }[] = [
    { color: COLOR_COMPRAS, texto: 'Compras' },
    { color: COLOR_VENTAS, texto: 'Ventas' },
  ];
  if (opciones.destacado && serie.some(d => d.dia === opciones.destacado)) {
    //  Con borde: un cuadro de color muy claro sin borde no se distingue del papel, y la
    //  leyenda quedaria con un hueco al lado de su texto.
    entradas.push({ color: COLOR_DESTACADO, texto: 'Día del informe', borde: true });
  }
  let x = MARGEN_IZQ;
  for (const e of entradas) {
    partes.push(
      `<rect x="${x.toFixed(1)}" y="${leyendaY - 7}" width="8" height="8" fill="${e.color}"`
      + `${e.borde ? ` stroke="${COLOR_EJE}" stroke-width="0.6"` : ''} rx="1"/>`
      + `<text x="${(x + 12).toFixed(1)}" y="${leyendaY}" font-size="8" fill="${COLOR_TEXTO}">`
      + `${esc(e.texto)}</text>`,
    );
    //  4,6 puntos por caracter a 8pt en Helvetica: no es exacto, pero se queda por encima
    //  del ancho real, asi que las entradas nunca se solapan.
    x += 12 + e.texto.length * 4.6 + 16;
  }
  if (!hayMovimiento) {
    //  UN GRAFICO VACIO SE EXPLICA. Sin esta linea se lee como un grafico que no cargo, y
    //  el cero es el estado normal aqui: medido, la mayoria de los dias no tienen
    //  movimiento.
    partes.push(
      `<text x="${x.toFixed(1)}" y="${leyendaY}" font-size="8" font-style="italic" `
      + `fill="${COLOR_TEXTO}">Sin compras ni ventas registradas en el período</text>`,
    );
  }

  partes.push('</svg>');
  return partes.join('');
}
