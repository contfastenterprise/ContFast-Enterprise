/**
 * Lote 205 -- el correo de avisos es un INFORME en PDF, con los datos de la empresa, todos
 * los avisos en un solo documento y un grafico de compras y ventas.
 *
 * Pedido del dueño el 2026-09-26, en dos mensajes: "el correo lo quiero como un reporte, en
 * un pdf con los datos de la empresa y el formato que tenemos en los demas pdf. todos los
 * aviso debe de estar en un solo archivo pdf, me gustaria graficos de compras y ventas del
 * dia" y "el grafico debe tener leyenda y toda la representacion de cada cosa debe ser
 * profecional".
 *
 * LA MEDICION CAMBIO EL GRAFICO, y es la parte de este lote que mas importa. En PRODUCCION
 * el 2026-09-26 (solo lectura): de los catorce dias del periodo, TRES estan enteramente a
 * cero -- incluido el propio dia del informe -- y solo SEIS tienen ventas. Un grafico "del
 * dia" serian hoy dos barras en cero. Con la medicion delante, el dueño eligio catorce
 * dias con el dia del informe destacado; las cifras del dia van igual, en numeros, arriba.
 *
 * CORRECCION, Y QUEDA ESCRITA PORQUE ES LA LECCION: la primera medicion dijo "6 facturas
 * en 7 dias, ultima venta el 14 de septiembre" y era FALSA. El guion imprimia las fechas
 * como `Date` y el terminal las mostraba en hora local (UTC-4), o sea UN DIA ANTES. La
 * ultima venta fue el 25, por RD$309.695,21. La conclusion no cambio -- hoy sigue habiendo
 * dos ceros --, pero el dato si, y se corrigio CUADRANDO la serie contra la base por dos
 * caminos independientes (`scratch/_to_delete/cuadrar_serie.ts`). Al medir, imprimir un
 * `date` de Postgres como `Date` de JavaScript lo corre un dia.
 *
 * SE EJECUTAN LAS REGLAS, no se leen: el esqueleto de dias, el cruce con las filas, el
 * techo del eje, el SVG entero y el HTML del informe corren de verdad, con los datos
 * medidos en produccion. Lo unico que se lee del codigo es lo que no se puede ejecutar sin
 * base de datos ni navegador (la asimetria de la consulta, el plazo de la ruta, y que un
 * fallo del PDF no cueste el aviso).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let contadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  contadas++;
  if (!c) fallos++;
};

/**
 * Las comprobaciones que EJECUTAN el codigo del lote, en orden.
 *
 * Existe por la contraprueba: con los modulos revertidos, la primera llamada a una
 * funcion que todavia no existe LANZA, y el banco se pararia ahi dejando el resto sin
 * reportar -- que se lee igual que "no fallaron". Cada una que no llegue a correr se
 * reporta FALLA por su etiqueta, para que la contraprueba pueda decir cien por cien
 * FALLA de verdad.
 */
const ETIQUETAS_EJECUTADAS: readonly string[] = [
  'catorce dias, y el ultimo es EXACTAMENTE el que se pidio',
  '  en orden y sin saltarse ninguno',
  '  y cruza el cambio de mes sin repetir ni perder un dia',
  '  incluido el 29 de febrero de un año bisiesto',
  '  y una fecha que no es una fecha no devuelve dias inventados',
  'la serie tiene los catorce dias, aunque solo once tengan filas',
  '  y los dias sin nada estan, a cero',
  '  cada dia con lo suyo',
  '  y un importe que llega como TEXTO se convierte, no se tira',
  '  lo que no sea un numero cuenta como cero, sin contaminar la serie',
  '  y un dia fuera del periodo se descarta',
  '  y dos filas del mismo dia se SUMAN, no se pisan',
  'los totales del dia son los del ULTIMO dia del periodo, el del informe',
  'el techo del eje es el mayor de las DOS series, no uno por serie',
  '  y un valor que no es finito no contamina el techo',
  '  sin datos, el techo es 0 y no -Infinity',
  'el SVG sale bien formado',
  '  y NI UN NaN, Infinity o undefined en ningun atributo',
  '  con una barra por cada dia que tiene movimiento, de cada serie',
  '  y ninguna se sale del lienzo por abajo',
  '  el rotulo de la unidad no se monta sobre la primera cifra del eje',
  '  ni el nombre del mes sobre la leyenda',
  'un importe pequeño se sigue viendo, no se queda en nada',
  'con todo a cero NO se divide por cero: el SVG sigue limpio',
  '  y se dice que no hubo movimiento, en vez de dejar el hueco',
  '  sin dibujar ninguna barra de dato',
  'la leyenda nombra las dos series',
  '  y tambien el dia destacado, que si no seria una marca sin explicar',
  '  y no lo nombra cuando no se destaca nada',
  '  el eje dice su unidad',
  '  y el mes se nombra, o "30 31 01" no situa la serie',
  'los importes del eje se abrevian y no se inventan',
  'al informe van los graves y las advertencias, no los informativos',
  '  y nunca lo que ya salio: es lo que impide mandarlo dos veces',
  '  sin direccion configurada no sale nada',
  'el asunto lleva la empresa y cuantos avisos hay',
  '  y cuenta los graves aparte cuando hay',
  '  con el singular bien puesto',
  'el cuerpo repite TODOS los avisos, aunque vayan en el PDF',
  '  con el grave primero, el mismo orden que el informe',
  '  y el enlace para atenderlo, que es lo que lo hace accionable',
  '  dice que va el adjunto solo cuando va',
  'el adjunto se llama de forma que ningun cliente lo estropee',
  '  sin tildes, sin barras y con una fecha de verdad',
  'el informe lleva los datos de la empresa en la cabecera',
  '  y el CSS de casa, no una copia',
  '  con los TRES avisos en el mismo documento',
  '  ordenados por gravedad, el grave primero',
  '  y cada uno con su gravedad en palabras, no solo en color',
  'el grafico va incrustado en el documento',
  '  y las cifras del dia van en numeros, con su moneda',
  '  el periodo del grafico queda dicho',
  '  y las fechas en el formato de la aplicacion, no en otro',
  '  y un informe de PRUEBA lo dice',
  '  sin avisos, se dice, en vez de una tabla vacia',
];

/** Las que quedaron sin correr porque algo lanzo antes. */
function fallarLasQueQuedan(motivo: string): void {
  for (const t of ETIQUETAS_EJECUTADAS.slice(contadas)) ok(t, false, motivo);
}

const GRAFICO = 'src/services/avisos/graficoDeBarras.ts';
const SERIE = 'src/services/avisos/movimientoDeLosDias.ts';
const CONSULTA = 'src/services/avisos/consultaDeMovimiento.ts';
const INFORME = 'src/services/avisos/informeDeAvisos.ts';
const ENVIO = 'src/services/avisos/enviarAvisosPorCorreo.ts';
const REGLA = 'src/services/avisos/avisoPorCorreo.ts';
const PANEL = 'src/app/api/v1/dashboard/route.ts';
const PLANTILLAS = 'src/utils/templates/documentTemplates.ts';

/**
 * Los dias reales de PRODUCCION, medidos el 2026-09-26 y CUADRADOS contra la base por dos
 * caminos independientes. Se usan tal cual porque un dato inventado no habria enseñado lo
 * que enseño este: que hay dias enteros a cero, que las dos series no coinciden en los
 * mismos dias, y que el dia del informe es uno de los vacios.
 */
const MEDIDO = [
  { dia: '2026-09-14', compras: 22294.92, ventas: 28015.19 },
  { dia: '2026-09-15', compras: 43482.67, ventas: 2170.21 },
  { dia: '2026-09-16', compras: 6120.60 },
  { dia: '2026-09-17', compras: 79710.90, ventas: 121599.95 },
  { dia: '2026-09-18', compras: 2351.25 },
  { dia: '2026-09-19', ventas: 99952.20 },
  { dia: '2026-09-20', compras: 4480.40 },
  { dia: '2026-09-21', compras: 41267.62 },
  { dia: '2026-09-22', compras: 159384.08, ventas: 83122.91 },
  { dia: '2026-09-23', compras: 197793.03 },
  { dia: '2026-09-25', compras: 115482.57, ventas: 309695.21 },
];

/**
 * Carga perezosa, y FALLA POR ETIQUETA si el modulo no esta.
 *
 * NO es una comodidad. Los modulos de este lote son NUEVOS, asi que en la contraprueba
 * --con los ficheros revertidos-- un `import` estatico reventaria el banco entero con
 * "Cannot find module" en vez de fallar comprobacion a comprobacion, y un banco que
 * revienta no distingue "no cumple" de "no se puede concluir". Es la trampa que la
 * seccion 3 del documento de traspaso tiene escrita palabra por palabra.
 */
async function cargar(ruta: string, etiquetas: readonly string[]): Promise<Record<string, unknown> | null> {
  try {
    return (await import(ruta)) as Record<string, unknown>;
  } catch {
    for (const t of etiquetas) ok(t, false, `no existe ${ruta}`);
    return null;
  }
}

async function main() {
  //  PRECONDICION QUE VALE EN LOS DOS ESTADOS, que es la unica que sirve: el canal de
  //  correo existe desde el lote 200, antes y despues de este lote. Si alguien lo retira,
  //  este banco no debe dar FALLA -- debe negarse a correr.
  //
  //  Lo que NO se pone aqui: que existan los modulos del lote. Eso seria codificar el
  //  estado POSTERIOR, y entonces la contraprueba no falla: revienta.
  if (!/enviarAvisosPorCorreo/.test(leer(PANEL))) {
    throw new Error('Precondicion: el panel ya no manda los avisos por correo');
  }
  console.log('  pre   el canal de correo del panel sigue en pie');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) El esqueleto de dias -- el hueco es el dato\n');
  // ───────────────────────────────────────────────────────────────────────────

  //  TODO LO QUE EJECUTA VA DENTRO DE UN `try`. Con los modulos revertidos, la primera
  //  llamada a una funcion que todavia no existe LANZA, y sin esto el banco se pararia
  //  ahi: las demas comprobaciones no se reportarian, y en una contraprueba eso se lee
  //  igual que "no fallaron". Es la trampa de la seccion 3 del documento de traspaso.
  try {
  const S = await import('../src/services/avisos/movimientoDeLosDias');

  const dias = S.diasDelPeriodo('2026-09-26', 14);
  ok('catorce dias, y el ultimo es EXACTAMENTE el que se pidio',
    dias.length === 14 && dias[13] === '2026-09-26', `ultimo=${dias[13]}`);
  ok('  en orden y sin saltarse ninguno',
    dias[0] === '2026-09-13' && dias.join(',') === Array.from({ length: 14 },
      (_, i) => `2026-09-${String(13 + i).padStart(2, '0')}`).join(','));
  //  EL CAMBIO DE MES es donde una resta de dias a mano se equivoca. `diaRDMas` trabaja
  //  sobre el mediodia UTC justamente para esto.
  const cruzando = S.diasDelPeriodo('2026-10-02', 5);
  ok('  y cruza el cambio de mes sin repetir ni perder un dia',
    cruzando.join(',') === '2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02',
    cruzando.join(','));
  const bisiesto = S.diasDelPeriodo('2028-03-01', 3);
  ok('  incluido el 29 de febrero de un año bisiesto',
    bisiesto.join(',') === '2028-02-28,2028-02-29,2028-03-01', bisiesto.join(','));
  ok('  y una fecha que no es una fecha no devuelve dias inventados',
    S.diasDelPeriodo('no es un dia', 14).length === 0
    && S.diasDelPeriodo('2026-09-26', 0).length === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) El cruce: los dias sin movimiento salen a CERO, no se saltan\n');
  // ───────────────────────────────────────────────────────────────────────────
  const serie = S.serieConTodosLosDias(dias, MEDIDO);
  ok('la serie tiene los catorce dias, aunque solo once tengan filas',
    serie.length === 14, `${serie.length}`);
  //  SI ESTO FALLARA, el grafico dibujaria once barras seguidas y pareceria que hubo
  //  movimiento once dias consecutivos, cuando la verdad es que hay tres dias vacios --
  //  uno de ellos el propio dia del informe. El hueco es el dato.
  const vacios = serie.filter(d => d.compras === 0 && d.ventas === 0).map(d => d.dia);
  ok('  y los dias sin nada estan, a cero',
    vacios.includes('2026-09-13') && vacios.includes('2026-09-24')
    && vacios.includes('2026-09-26'), vacios.join(','));
  ok('  cada dia con lo suyo',
    serie[1]?.dia === '2026-09-14' && serie[1]?.compras === 22294.92 && serie[1]?.ventas === 28015.19);
  //  Los importes llegan como TEXTO de Postgres (las columnas `decimal`): fue el defecto
  //  del lote 167, que tumbaba la pantalla del 606 con "toFixed is not a function".
  const conTexto = S.serieConTodosLosDias(['2026-09-26'],
    [{ dia: '2026-09-26', ventas: '1500.50' as unknown as number }]);
  ok('  y un importe que llega como TEXTO se convierte, no se tira',
    conTexto[0]?.ventas === 1500.5, String(conTexto[0]?.ventas));
  ok('  lo que no sea un numero cuenta como cero, sin contaminar la serie',
    S.serieConTodosLosDias(['2026-09-26'],
      [{ dia: '2026-09-26', ventas: 'ochenta' as unknown as number }])[0]?.ventas === 0);
  //  UN DIA FUERA DEL PERIODO NO PUEDE COLARSE: el grafico dibujaria una barra en un dia
  //  que su eje no tiene.
  ok('  y un dia fuera del periodo se descarta',
    S.serieConTodosLosDias(['2026-09-26'], [{ dia: '2026-01-01', ventas: 999 }])[0]?.ventas === 0);
  //  Dos filas del mismo dia (una de ventas y otra de compras, que es como llegan) se
  //  SUMAN. Si se sobreescribieran, la segunda borraria la primera y el dia saldria con
  //  una de las dos series en cero.
  const sumadas = S.serieConTodosLosDias(['2026-09-26'],
    [{ dia: '2026-09-26', ventas: 100 }, { dia: '2026-09-26', compras: 200 }]);
  ok('  y dos filas del mismo dia se SUMAN, no se pisan',
    sumadas[0]?.ventas === 100 && sumadas[0]?.compras === 200);

  const totales = S.totalesDelDia(serie);
  ok('los totales del dia son los del ULTIMO dia del periodo, el del informe',
    totales.compras === 0 && totales.ventas === 0, `${totales.compras}/${totales.ventas}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) El grafico: ni un NaN, y el cero se dice\n');
  // ───────────────────────────────────────────────────────────────────────────
  const G = await import('../src/services/avisos/graficoDeBarras');

  ok('el techo del eje es el mayor de las DOS series, no uno por serie',
    G.techoDelEje(serie) === 309695.21, String(G.techoDelEje(serie)));
  //  Un NaN en el maximo contaminaria TODAS las barras.
  ok('  y un valor que no es finito no contamina el techo',
    G.techoDelEje([{ dia: '2026-09-26', compras: NaN, ventas: 50 }]) === 50
    && G.techoDelEje([{ dia: '2026-09-26', compras: Infinity, ventas: 50 }]) === 50);
  ok('  sin datos, el techo es 0 y no -Infinity',
    G.techoDelEje([]) === 0);

  const svg = G.graficoDeBarrasSvg(serie, { destacado: '2026-09-26' });
  ok('el SVG sale bien formado',
    svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  //  LA COMPROBACION QUE MAS VALE: un `NaN` en un atributo de SVG NO da error -- Chromium
  //  dibuja la barra en un sitio imposible o no la dibuja, y el PDF sale mal sin que nada
  //  lo diga.
  ok('  y NI UN NaN, Infinity o undefined en ningun atributo',
    !/NaN|Infinity|undefined|null/.test(svg));
  ok('  con una barra por cada dia que tiene movimiento, de cada serie',
    (svg.match(/<rect /g) || []).length >= 10);
  //  TODAS LAS BARRAS DENTRO DEL LIENZO: una altura mal calculada las saca por arriba y en
  //  el PDF se ven cortadas contra el borde.
  const alturas = [...svg.matchAll(/<rect [^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)]
    .map(m => Number(m[1]) + Number(m[2]));
  //  CONTRA EL ALTO QUE DECLARA EL PROPIO SVG, no contra un 220 escrito aqui: el alto
  //  cambio al separar las etiquetas, y un numero copiado habria puesto el banco en rojo
  //  sin que faltara nada. Es la trampa de anclar la FORMA (seccion 7 del traspaso), que
  //  aqui llego a pasar de verdad.
  const altoDeclarado = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 0);
  ok('  y ninguna se sale del lienzo por abajo',
    altoDeclarado > 0 && alturas.length > 0 && alturas.every(v => v <= altoDeclarado + 0.01),
    `max=${Math.max(...alturas)} de ${altoDeclarado}`);

  //  LAS ETIQUETAS NO SE MONTAN UNAS SOBRE OTRAS, y esto solo se vio FOTOGRAFIANDO el
  //  informe: el rotulo de la unidad caia encima de la primera cifra del eje y el nombre
  //  del mes encima de la leyenda. Las dos ilegibles, y ninguna comprobacion de "el SVG
  //  esta bien formado" se entera -- un solapamiento es SVG perfectamente valido.
  const ys = (re: RegExp) => [...svg.matchAll(re)].map(m => Number(m[1]));
  const yUnidad = ys(/<text [^>]*y="([\d.]+)"[^>]*>RD\$<\/text>/g)[0] ?? -1;
  const cifrasDelEje = ys(/<text x="[\d.]+" y="([\d.]+)" text-anchor="end" font-size="8"/g);
  ok('  el rotulo de la unidad no se monta sobre la primera cifra del eje',
    yUnidad > 0 && cifrasDelEje.length > 0 && Math.min(...cifrasDelEje) - yUnidad >= 6,
    `unidad=${yUnidad} cifra=${Math.min(...cifrasDelEje)}`);
  const yMes = ys(/<text [^>]*y="([\d.]+)"[^>]*>sep<\/text>/g)[0] ?? -1;
  const yLeyenda = ys(/<text x="[\d.]+" y="([\d.]+)" font-size="8" fill="#52525b">Compras<\/text>/g)[0] ?? -1;
  ok('  ni el nombre del mes sobre la leyenda',
    yMes > 0 && yLeyenda > 0 && yLeyenda - yMes >= 8, `mes=${yMes} leyenda=${yLeyenda}`);

  //  UN IMPORTE PEQUEÑO NO DESAPARECE. Al lado de uno de 300.000, una venta de 800 da una
  //  altura por debajo de medio punto y no se dibuja: el dia parece VACIO teniendo
  //  movimiento, que es peor que una barra desproporcionada. Con los datos reales esto no
  //  se ejercita --el menor es 2.170 sobre 309.695, que si llega a un punto--, asi que
  //  hizo falta un caso propio: sin el, quitar el minimo sobrevivia a todos los mutantes.
  const conMigaja = G.graficoDeBarrasSvg([
    { dia: '2026-09-25', compras: 0, ventas: 309695.21 },
    { dia: '2026-09-26', compras: 800, ventas: 0 },
  ]);
  //  ACOTADO A LA ZONA DE DATOS: el cuadradito de la leyenda es tambien un `<rect>` del
  //  mismo color, y sin acotar se colaba como si fuera una barra (salian dos alturas, 1 y
  //  8). Es la misma trampa de siempre -- buscar en todo el fichero lo que vive en un
  //  trozo -- solo que dentro de un SVG.
  //  Se corta por la LINEA DE BASE, que se dibuja despues de las barras y antes de la
  //  leyenda. Cortar por el texto ">Compras<" no valia: el cuadradito de la leyenda es un
  //  `<rect>` que va ANTES de su propio texto, asi que seguia colandose -- y con la
  //  comprobacion siempre en rojo, la tanda de mutantes los daba TODOS por muertos. Un
  //  banco roto no mata mutantes: los tapa.
  const zonaDeDatos = conMigaja.slice(0, conMigaja.indexOf('stroke-width="1"/>'));
  const barritas = [...zonaDeDatos.matchAll(/<rect [^>]*height="([\d.]+)"[^>]*fill="#003366"/g)]
    .map(m => Number(m[1]));
  ok('un importe pequeño se sigue viendo, no se queda en nada',
    barritas.length === 1 && barritas[0]! >= 1, `alturas=${barritas.join(',')}`);

  //  EL CASO "TODO A CERO" ES EL NORMAL AQUI, no un caso raro: medido, la mayoria de los
  //  dias no tienen movimiento. Dividir por un techo de 0 da Infinity.
  const enCero = G.graficoDeBarrasSvg(
    dias.map(dia => ({ dia, compras: 0, ventas: 0 })), { destacado: '2026-09-26' });
  ok('con todo a cero NO se divide por cero: el SVG sigue limpio',
    enCero.startsWith('<svg') && !/NaN|Infinity/.test(enCero));
  //  Y SE DICE. Un grafico vacio sin explicacion se lee como un grafico que no cargo.
  ok('  y se dice que no hubo movimiento, en vez de dejar el hueco',
    /Sin compras ni ventas registradas/.test(enCero));
  ok('  sin dibujar ninguna barra de dato',
    !/fill="#003366"\/>/.test(enCero.replace(/<rect x="[\d.]+" y="10" width="[\d.]+" height="180" fill="#f4f4f5"\/>/g, '')));

  //  LA LEYENDA, pedida por el dueño: explica TODO lo que se dibuja, no solo los colores.
  console.log('');
  ok('la leyenda nombra las dos series',
    svg.includes('>Compras<') && svg.includes('>Ventas<'));
  //  El dia destacado se pinta con un fondo, y un fondo sin explicar obliga a adivinar.
  ok('  y tambien el dia destacado, que si no seria una marca sin explicar',
    svg.includes('>Día del informe<'));
  ok('  y no lo nombra cuando no se destaca nada',
    !G.graficoDeBarrasSvg(serie).includes('Día del informe'));
  //  La unidad, dicha una vez: "150k" no dice si son pesos o documentos.
  ok('  el eje dice su unidad',
    svg.includes('>RD$<'));
  ok('  y el mes se nombra, o "30 31 01" no situa la serie',
    svg.includes('>sep<'));
  ok('los importes del eje se abrevian y no se inventan',
    G.rotuloDeImporte(1_500_000) === '1.5M' && G.rotuloDeImporte(150_000) === '150k'
    && G.rotuloDeImporte(0) === '0' && G.rotuloDeImporte(NaN) === '0'
    && G.rotuloDeImporte(-5) === '0');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) El correo: UNO con todos, y el asunto dice cuantos\n');
  // ───────────────────────────────────────────────────────────────────────────
  const R = await import('../src/services/avisos/avisoPorCorreo');
  //  UNA DE CADA SEVERIDAD, y hubo que corregirlo: `caja_con_diferencia` tambien es
  //  `error` (lote 176, un descuadre no es un recordatorio), asi que con ella y
  //  `invoice_rejected` los dos avisos eran graves y el ORDEN no se podia comprobar --
  //  cualquier orden habria pasado. `check_due` es la advertencia.
  //
  //  LAS CLASES SON LAS DE VERDAD, y hace falta que lo sean: `type` no es la severidad,
  //  es la CLASE del aviso, y `severidadDeAviso` la traduce. Con clases inventadas
  //  ('warning', 'error') el filtro las manda todas a `info` y el banco daba 0 pendientes
  //  -- que es justo como se descubrio el defecto de este lote.
  const AVISOS = [
    { id: 'cheque-por-cobrar-1', type: 'check_due', title: 'Cheque en garantía por cobrar', description: 'Se cobra en 3 días: RD$ 144.092,15.', actionText: 'Ver', actionLink: '/dashboard/ap' },
    { id: 'ecf-rechazado-2', type: 'invoice_rejected', title: 'Comprobante rechazado', description: 'E320000000059 fue rechazado.', actionText: 'Ver', actionLink: '/dashboard/ecf' },
    { id: 'padron-viejo', type: 'padron_viejo', title: 'Padrón de RNC', description: 'Cargado hace 40 días.', actionText: '', actionLink: '' },
  ];

  //  SOLO LOS GRAVES Y LAS ADVERTENCIAS (regla del lote 178, heredada por el 200): un
  //  recordatorio de mantenimiento no despierta a nadie.
  const pendientes = R.avisosParaElInforme(AVISOS, 'avisos@latindoors.com', new Set());
  ok('al informe van los graves y las advertencias, no los informativos',
    pendientes.length === 2 && !pendientes.some(a => a.id === 'padron-viejo'));
  ok('  y nunca lo que ya salio: es lo que impide mandarlo dos veces',
    R.avisosParaElInforme(AVISOS, 'avisos@latindoors.com', new Set(['ecf-rechazado-2'])).length === 1);
  //  SIN DIRECCION NO SE MANDA NADA: el estado de las seis empresas hasta que alguien la
  //  ponga.
  ok('  sin direccion configurada no sale nada',
    R.avisosParaElInforme(AVISOS, '', new Set()).length === 0
    && R.avisosParaElInforme(AVISOS, null, new Set()).length === 0
    && R.avisosParaElInforme(AVISOS, 'no es un correo', new Set()).length === 0);

  const asunto = R.asuntoDelInforme(pendientes, 'LATIN DOORS S.R.L.');
  //  LA EMPRESA EN EL ASUNTO: quien administra varias las recibe todas en la misma bandeja.
  ok('el asunto lleva la empresa y cuantos avisos hay',
    asunto.startsWith('[LATIN DOORS S.R.L.]') && asunto.includes('2 avisos pendientes'), asunto);
  //  Los graves aparte: "8 avisos" y "8 avisos (3 graves)" piden atencion distinta, y el
  //  asunto es lo unico que se ve sin abrir.
  ok('  y cuenta los graves aparte cuando hay',
    asunto.includes('(1 grave)') && !R.asuntoDelInforme(
      [AVISOS[0]!], 'X').includes('grave'), asunto);
  ok('  con el singular bien puesto',
    R.asuntoDelInforme([AVISOS[0]!], 'X') === '[X] 1 aviso pendiente');

  const cuerpo = R.cuerpoDelInforme(pendientes, 'LATIN DOORS S.R.L.', true);
  //  EL CUERPO SE SOSTIENE SOLO. Un adjunto puede no abrirse -- en el movil, o si el PDF
  //  no se pudo dibujar --, y si el texto dijera "ver el adjunto" no diria nada.
  ok('el cuerpo repite TODOS los avisos, aunque vayan en el PDF',
    cuerpo.includes('Comprobante rechazado') && cuerpo.includes('Cheque en garantía por cobrar')
    && cuerpo.includes('E320000000059'));
  ok('  con el grave primero, el mismo orden que el informe',
    cuerpo.indexOf('Comprobante rechazado') < cuerpo.indexOf('Cheque en garantía por cobrar'));
  ok('  y el enlace para atenderlo, que es lo que lo hace accionable',
    cuerpo.includes('/dashboard/ecf'));
  ok('  dice que va el adjunto solo cuando va',
    cuerpo.includes('adjunta el informe')
    && !R.cuerpoDelInforme(pendientes, 'X', false).includes('adjunta el informe'));

  //  El nombre del fichero: los nombres reales traen puntos y apostrofos y algunos
  //  clientes de correo los tratan mal.
  ok('el adjunto se llama de forma que ningun cliente lo estropee',
    R.nombreDelInforme("LATIN DOORS S.R.L.", '2026-09-26') === 'avisos-LATIN-DOORS-S-R-L-2026-09-26.pdf',
    R.nombreDelInforme('LATIN DOORS S.R.L.', '2026-09-26'));
  ok('  sin tildes, sin barras y con una fecha de verdad',
    R.nombreDelInforme('Construcción/Diseño', '2026-09-26') === 'avisos-Construccion-Diseno-2026-09-26.pdf'
    && R.nombreDelInforme('X', 'ayer') === 'avisos-X-sin-fecha.pdf'
    && R.nombreDelInforme('', '2026-09-26') === 'avisos-empresa-2026-09-26.pdf');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5) El informe: datos de la empresa, formato de casa, todo en uno\n');
  // ───────────────────────────────────────────────────────────────────────────
  const SEV = await import('../src/services/avisos/avisoDelPanel');
  const { DocumentTemplates } = await import('../src/utils/templates/documentTemplates');
  const html = DocumentTemplates.renderAlertsReport({
    company: { name: 'LATIN DOORS S.R.L.', rnc: '132109157', address: 'Av. Principal 1', phone: '809-555-1234', logoUrl: null },
    dia: '2026-09-26',
    avisos: AVISOS.map(a => ({ titulo: a.title, descripcion: a.description, severidad: SEV.severidadDeAviso(a.type), desdeCuando: '2026-09-20T12:00:00.000Z' })),
    grafico: svg,
    totalesDelDia: { compras: 0, ventas: 0 },
    periodo: { desde: '2026-09-13', hasta: '2026-09-26' },
  });

  //  LOS DATOS DE LA EMPRESA, que es lo primero que pidio el dueño.
  ok('el informe lleva los datos de la empresa en la cabecera',
    html.includes('LATIN DOORS S.R.L.') && html.includes('132109157')
    && html.includes('Av. Principal 1') && html.includes('809-555-1234'));
  //  EL FORMATO DE CASA: `getBaseCss('carta')` es privado de la clase, asi que el informe
  //  vive dentro y lo hereda. Si se copiara, la copia se separaria del original.
  ok('  y el CSS de casa, no una copia',
    html.includes('.header { display: flex') && html.includes("font-family: 'Inter'"));
  //  TODOS LOS AVISOS EN UN SOLO DOCUMENTO.
  ok('  con los TRES avisos en el mismo documento',
    html.includes('Cheque en garantía por cobrar') && html.includes('Comprobante rechazado')
    && html.includes('Padrón de RNC'));
  //  ORDENADOS POR GRAVEDAD: arriba lo que no puede esperar.
  ok('  ordenados por gravedad, el grave primero',
    html.indexOf('Comprobante rechazado') < html.indexOf('Cheque en garantía por cobrar')
    && html.indexOf('Cheque en garantía por cobrar') < html.indexOf('Padrón de RNC'));
  ok('  y cada uno con su gravedad en palabras, no solo en color',
    html.includes('>GRAVE<') && html.includes('>ADVERTENCIA<'));
  //  EL GRAFICO VA DENTRO del documento, no enlazado: un <img> a una URL no se ve en un
  //  PDF generado en el servidor si la red falla.
  ok('el grafico va incrustado en el documento',
    html.includes('<svg') && html.includes('>Compras<') && html.includes('>Día del informe<'));
  //  LAS CIFRAS DEL DIA, en numeros: es donde se leen exactas, y el grafico de catorce
  //  dias no las da.
  ok('  y las cifras del dia van en numeros, con su moneda',
    /Ventas del d[ií]a/.test(html) && /Compras del d[ií]a/.test(html) && /RD\$/.test(html));
  ok('  el periodo del grafico queda dicho',
    /13-09-2026/.test(html) && /26-09-2026/.test(html));
  //  Las fechas con el formateador de casa (trinquete del lote 202): dd-MM-aaaa.
  ok('  y las fechas en el formato de la aplicacion, no en otro',
    /20-09-2026/.test(html) && !/2026-09-20</.test(html));
  //  UN INFORME DE PRUEBA SE DISTINGUE: cifras de practicas en un documento con el nombre
  //  de la empresa son indistinguibles de las reales si no lo lleva escrito.
  const enPruebas = DocumentTemplates.renderAlertsReport({
    company: { name: 'X', rnc: '1', logoUrl: null }, dia: '2026-09-26', entorno: 'PRUEBA',
    avisos: [], grafico: '<svg></svg>', totalesDelDia: { compras: 0, ventas: 0 },
    periodo: { desde: '2026-09-13', hasta: '2026-09-26' },
  });
  ok('  y un informe de PRUEBA lo dice',
    enPruebas.includes('PRUEBA') && !html.includes('Entorno:'));
  ok('  sin avisos, se dice, en vez de una tabla vacia',
    enPruebas.includes('No hay avisos pendientes'));

  // ───────────────────────────────────────────────────────────────────────────
  } catch (e: unknown) {
    //  SI LANZA, ES QUE FALLA. Las que no llegaron a correr se reportan por etiqueta, en
    //  vez de quedarse mudas.
    fallarLasQueQuedan(`lanzo: ${(e as Error)?.message?.slice(0, 70) ?? 'sin motivo'}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6) Lo que no se puede ejecutar aqui: la consulta, el plazo y el respaldo\n');
  // ───────────────────────────────────────────────────────────────────────────
  const consulta = sinComentarios(leer(CONSULTA));

  //  LA ASIMETRIA, que es la trampa de este lote. `invoices.created_at` es un INSTANTE en
  //  UTC y hay que convertirlo al dia de RD (defecto del lote 174, que vaciaba "Ventas de
  //  hoy" cada noche a las 20:00). `expenses.issue_date` es una columna `date`, un DIA:
  //  convertirla correria las compras un dia hacia atras.
  ok('las ventas se agrupan por el dia de RD, convirtiendo el instante',
    /diaRDdeColumna\(invoices\.createdAt\)/.test(consulta));
  ok('  con la conversion COMPARTIDA, no una copia de la regla de zona',
    /from '@\/repositories\/biRepository'/.test(leer(CONSULTA))
    && !/America\/Santo_Domingo/.test(consulta));
  //  ATADO AL POSITIVO: sin la consulta, "no convierte issue_date" seria cierto de balde.
  ok('  y las compras NO se convierten, porque issue_date ya es un dia',
    /expenses\.issueDate/.test(consulta)
    && !/diaRDdeColumna\(expenses/.test(consulta));
  //  Los mismos estados que el panel: si contaran distinto, las dos cifras se
  //  contradecirian sin poder saber cual miente.
  ok('  y cuentan las mismas facturas que el panel',
    /'accepted', 'signed', 'submitted'/.test(consulta)
    && /'accepted', 'signed', 'submitted'/.test(sinComentarios(leer('src/repositories/biRepository.ts'))));

  const envio = sinComentarios(leer(ENVIO));
  //  UN SOLO CORREO. Hasta el lote 204 habia un `sendMail` dentro de un bucle.
  ok('se manda UN correo, no uno por aviso',
    (envio.match(/sendMail\(/g) || []).length === 1
    && !/for \([^)]*of pendientes/.test(envio));
  ok('  con todos los avisos dentro y el PDF adjunto',
    /attachments: \[/.test(envio) && /contentType: 'application\/pdf'/.test(envio));
  //  EL PDF NO PUEDE COSTAR UN AVISO: es la decision de diseño de este lote.
  //  EL PDF NO PUEDE COSTAR UN AVISO. El dibujo va en su propio `try`, y el adjunto se
  //  añade solo si existe: si Chromium no arranca, el correo sale con el texto -- que ya
  //  lleva todos los avisos.
  ok('  y si el informe no se puede dibujar, el correo sale IGUAL',
    /let adjunto: Buffer \| null = null;/.test(envio)
    && /\.\.\.\(adjunto/.test(envio)
    && /se manda sin adjunto/.test(leer(ENVIO)));
  //  MARCA DESPUES DE QUE SALGA, nunca antes. Si se marcara antes, un fallo de SMTP
  //  perderia los avisos para siempre: el panel no los volveria a mandar.
  ok('  marcando solo lo que salio: si el correo falla, no se marca nada',
    //  CON EL PARENTESIS, o `indexOf` encuentra el IMPORT -- que esta arriba del todo, o
    //  sea ANTES del `sendMail`, y la comprobacion fallaba sin que faltara nada. Es la
    //  trampa del `indexOf` que este repositorio lleva anotada cuatro veces.
    envio.indexOf('marcarMandadasPorCorreo(') > envio.lastIndexOf('sendMail(')
    && /no salio el informe[\s\S]{0,400}return 0;/.test(envio));
  //  "NUNCA LANZA" y "sigue en after()" eran comprobaciones y SOBREVIVIERON a la
  //  contraprueba, con razon: las dos son ciertas ANTES de este lote (vienen de los lotes
  //  178 y 199). Una comprobacion que vale en los dos estados regala un OK. Pasan a
  //  PRECONDICION: este lote no puede romperlas, y si alguien se las lleva, el banco no
  //  debe dar FALLA -- debe negarse a correr.
  if (!/catch \(err: unknown\) \{[\s\S]*Logger\.warn\('\[avisos-correo\] fallo el envio/.test(envio)) {
    throw new Error('Precondicion: el envio de avisos ya no atrapa sus errores; podria tumbar el panel');
  }
  if (!/after\(\(\) => enviarAvisosPorCorreo\(/.test(sinComentarios(leer(PANEL)))) {
    throw new Error('Precondicion: el envio ya no va en after(); no sobreviviria a la respuesta');
  }
  console.log('  pre   el envio sigue atrapando sus errores y sigue en after()');

  //  EL PLAZO DE LA FUNCION. `after()` mantiene la funcion viva despues de responder pero
  //  NO la libera del plazo: sin margen, el dibujo del PDF se cortaria a media faena y el
  //  aviso se quedaria sin salir sin dejar una linea -- el fallo mudo de los lotes 196-199.
  const panel = sinComentarios(leer(PANEL));
  ok('la ruta del panel declara plazo, porque ahora dibuja un PDF',
    /export const maxDuration = \d+/.test(panel));

  //  LO QUE DECIDE NO ARRASTRA `@/db` (leccion del lote 178): si lo hiciera, no se podria
  //  ejecutar en este banco, que corre sin `DATABASE_URL`.
  //
  //  SIN COMENTARIOS, Y ESTO YA VA POR LA QUINTA VEZ EN EL PROYECTO: las tres
  //  comprobaciones de aqui abajo fallaron a la primera **leyendo mi propia prosa**. El
  //  docstring de `graficoDeBarras.ts` explica por que NO se usa recharts, por que no se
  //  arrastra `@/db` y por que el mes va a mano en vez de con `toLocaleDateString` -- o sea
  //  que las tres palabras prohibidas estaban escritas ahi, en un comentario. Se mide el
  //  CODIGO, no el texto.
  const grafico = sinComentarios(leer(GRAFICO));
  const serieFuente = sinComentarios(leer(SERIE));
  //  ATADAS A UNA MARCA POSITIVA, y la contraprueba enseño por que: con los ficheros sin
  //  crear, `leer()` devuelve cadena vacia y las tres negaciones son ciertas DE BALDE --
  //  "no importa @/db" se cumple porque no hay fichero. Las tres sobrevivieron a la
  //  contraprueba hasta que se les exigio ademas que la funcion EXISTA. Es la segunda
  //  trampa de la seccion 3 del documento de traspaso, entera.
  const hayGrafico = /export function graficoDeBarrasSvg\(/.test(grafico);
  const haySerie = /export function serieConTodosLosDias\(/.test(serieFuente);
  ok('las dos reglas con aritmetica se prueban sin base de datos',
    hayGrafico && haySerie && !/@\/db/.test(grafico) && !/@\/db/.test(serieFuente));
  ok('  y el grafico no arrastra recharts, que es de navegador',
    hayGrafico && !/recharts/.test(grafico));
  //  El barrido de fechas del lote 202 no admite un `toLocale*` de fecha en `src/`.
  ok('  ni un toLocaleDateString para nombrar el mes',
    hayGrafico && !/toLocale(Date|Time)?String/.test(grafico));
  //  LA SEVERIDAD SE DERIVA, no es `type`. `type` vale 'invoice_rejected',
  //  'caja_con_diferencia'... y `severidadDeAviso` lo traduce. Compararlo con 'error' a
  //  pelo da SIEMPRE falso: el asunto no habria contado ni un grave y el informe habria
  //  rotulado todo como "AVISO". Lo cazo este banco al ejecutar las reglas con avisos de
  //  verdad, y por eso la comprobacion se queda.
  const reglaFuente = sinComentarios(leer(REGLA));
  ok('la severidad se DERIVA de la clase del aviso, no se lee de `type`',
    /severidadDeAviso\(a\.type\)/.test(reglaFuente)
    && !/a\.type === 'error'/.test(reglaFuente)
    && /severidadDeAviso\(a\.type\)/.test(sinComentarios(leer(INFORME))));
  //  El informe no puede reimplementar la cabecera: tiene que ser la de casa.
  ok('el informe usa la plantilla de casa y no monta su propio HTML',
    /DocumentTemplates\.renderAlertsReport\(/.test(sinComentarios(leer(INFORME)))
    && /getBaseCss\('carta'\)/.test(leer(PLANTILLAS)));
  ok('  y los datos de la empresa salen de donde los saca cualquier informe',
    /ReportRepository\.getCompanyInfo\(/.test(sinComentarios(leer(INFORME))));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
