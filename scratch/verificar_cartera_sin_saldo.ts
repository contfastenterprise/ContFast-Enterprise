/**
 * En la cartera solo sale quien debe.
 *
 * EL FALLO
 * --------
 * En /dashboard/antiguedad-saldos aparecian clientes sin nada pendiente. Los
 * agregados de `resumenClientes` ya filtraban con `CASE WHEN balance > 0`, pero
 * eso decide lo que SUMA, no lo que sale: un cliente con todas sus facturas
 * saldadas seguia teniendo filas en `accounts_receivable`, el `innerJoin` +
 * `groupBy` le daba su fila, y salia con saldo 0, 0 dias y 0 documentos.
 * `resumenSuplidores` tenia exactamente la misma forma, asi que la pestaña de
 * suplidores estaba igual de mal aunque nadie lo hubiera reportado todavia.
 *
 * POR QUE NO ERA SOLO UNA FILA DE MAS
 * -----------------------------------
 * La pantalla reparte la dona sobre `filas.length` y exporta `filas` al CSV. Con
 * los saldados dentro, el porcentaje de los que SI deben salia encogido -- una
 * cartera con 10 morosos y 90 saldados enseñaba "10% en riesgo" -- y el CSV que
 * se manda a cobrar llevaba 90 lineas que no hay que cobrar.
 *
 * EL ARREGLO
 * ----------
 * Un `HAVING` sobre la misma expresion del saldo, en las dos consultas. El
 * centavo de tolerancia es el que ya usa el estado de cuenta (`partidasCliente`
 * y `partidasSuplidor` filtran `saldo > 0.01`): con `> 0` a secas, un cliente
 * que debiera exactamente RD$0.01 saldria en la lista y su estado de cuenta
 * abriria vacio.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Que Postgres aplique bien el HAVING. Eso no es nuestro. Lo que se comprueba es
 * que el freno esta, que esta en la consulta correcta de cada bloque, que filtra
 * por la MISMA expresion que produce el saldo, y que no usa el alias de salida
 * -- `HAVING saldo > 0.01` compila en Drizzle y revienta en la base.
 */
import { fuente, crudo, bloque } from './_fuente';

const RUTA = 'src/repositories/carteraRepository.ts';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const veces = (s: string, t: string): number => s.split(t).length - 1;

const src = fuente(RUTA).replace(/\r\n/g, '\n');
const raw = crudo(RUTA).replace(/\r\n/g, '\n');

// OJO CON EL MARCADOR: anclar en la DECLARACION, no en el nombre suelto.
// `resumen()` llama a las dos unas lineas antes (`this.resumenSuplidores(...)`),
// y cortar por ahi mezclaba los dos bloques. Con los bloques mezclados este
// banco leia el codigo de clientes creyendo que era el de suplidores y daba
// verde por el fichero equivocado. Paso de verdad al escribirlo.
const blClientes = bloque(src, 'private static async resumenClientes(');
const blSuplidores = bloque(src, 'private static async resumenSuplidores(');

// Esto NO es una comprobacion, es la condicion para poder comprobar. Va como
// excepcion y no como `ok(...)` a proposito: una linea que sale OK tanto antes
// como despues del arreglo no verifica nada, y mezclada entre las demas solo
// sirve para inflar el marcador. Si los bloques salen mal cortados, el banco
// entero es basura y tiene que reventar, no dar 15 de 16.
if (!blClientes || !blSuplidores
    || blClientes.includes('accountsPayable') || blSuplidores.includes('accountsReceivable')) {
  throw new Error(
    'No se pudieron aislar los dos bloques de carteraRepository. ' +
    'Revisa los marcadores antes de creerte nada de lo que siga.'
  );
}

/** El primer `await db` del bloque son los agregados; lo que sigue a `const series`, la grafica. */
const agregados = (b: string): string => b.slice(b.indexOf('await db'), b.indexOf('const series'));
const serie = (b: string): string => b.slice(b.indexOf('const series'));

const CONSULTAS: [string, string, string][] = [
  ['clientes', blClientes, 'accountsReceivable'],
  ['suplidores', blSuplidores, 'accountsPayable'],
];

for (const [etiqueta, bl, tabla] of CONSULTAS) {
  const agg = agregados(bl);
  const ser = serie(bl);
  const hv = agg.includes('.having(') ? agg.slice(agg.indexOf('.having(')) : '';

  // Negar a secas ("la serie no lleva having") seria gratis: tambien era cierto
  // ANTES, cuando no habia ningun having en ninguna parte. La asercion util es
  // que hay UNO y esta donde tiene que estar.
  ok(`${etiqueta}: UN having, y en los agregados (no en la serie mensual)`,
    veces(bl, '.having(') === 1 && agg.includes('.having(') && !ser.includes('.having('));

  // Drizzle encadena where -> groupBy -> having. Al reves no compone el SQL.
  ok(`${etiqueta}: el having va despues del groupBy`,
    hv.length > 0 && agg.indexOf('.groupBy(') < agg.indexOf('.having('));

  // Si el freno filtrara por otra cosa -- por COUNT(*), por el balance crudo --
  // el saldo de la fila y el motivo por el que la fila existe dirian cosas
  // distintas, que es justo el fallo que se esta arreglando.
  ok(`${etiqueta}: el having suma el MISMO CASE WHEN que el saldo`,
    hv.includes(`SUM(CASE WHEN \${${tabla}.balance} > 0 THEN \${${tabla}.balance} ELSE 0 END)`));

  // Estas dos consultas son gemelas: el riesgo real aqui es copiar una sobre la
  // otra y dejar la tabla de la de al lado.
  ok(`${etiqueta}: el having mira SU tabla (${tabla})`,
    hv.includes(tabla) && !hv.includes(tabla === 'accountsReceivable' ? 'accountsPayable' : 'accountsReceivable'));

  ok(`${etiqueta}: corta en > 0.01, el mismo centavo del estado de cuenta`,
    hv.includes('> 0.01'));

  // En Postgres el HAVING no ve los alias del SELECT. `HAVING saldo > 0.01`
  // pasa el compilador de TypeScript y falla en tiempo de consulta, que es el
  // peor sitio para enterarse.
  ok(`${etiqueta}: el having no usa el alias de salida \`saldo\``,
    hv.length > 0 && !/`[^`]*\bsaldo\b[^`]*`/.test(hv));
}

ok('el fichero entero tiene exactamente DOS having', veces(src, '.having(') === 2);

// El estado de cuenta y la lista tienen que dar por saldado lo mismo. Si alguien
// cambia una tolerancia y no la otra, vuelve el sintoma: una fila en la lista
// cuyo detalle abre vacio.
//
// Comprobar solo que el estado de cuenta conserva su 0.01 ya pasaba ANTES del
// arreglo -- ese filtro lleva ahi desde siempre. Apretada: tienen que ser CUATRO
// sitios con el mismo umbral (los dos del estado de cuenta y los dos havings) y
// ningun otro numero de tolerancia suelto por el fichero.
ok('cuatro sitios, un solo centavo de tolerancia',
  veces(src, '0.01') === 4
  && src.includes('g.saldo > 0.01') && src.includes('p.saldo > 0.01'));

// Un contrato que no se escribe se rompe sin que nadie lo note.
ok('FilaCartera.saldo documenta que el que no debe no sale',
  raw.slice(raw.indexOf('export interface FilaCartera'), raw.indexOf('cupoCredito'))
    .includes('no debe nada no es una fila'));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
