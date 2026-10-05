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

// Lote 304: el freno ya no es un HAVING. Los documentos se traen en una consulta y quien quita al
// que no debe es `resumirPorEntidad` (reglasDeCartera.ts), con el centavo de `TOLERANCIA`. La
// propiedad que defendia este banco se comprueba EJECUTANDO esa regla, y que las dos carteras
// pasen por ella.
const reglas = fuente('src/services/cartera/reglasDeCartera.ts');
for (const [etiqueta, bl] of [['clientes', blClientes], ['suplidores', blSuplidores]] as const) {
  ok(`${etiqueta}: el resumen pasa por armar() y resumirPorEntidad`,
    bl.includes('return this.armar(docs, series,'));
}
ok('armar() resume con resumirPorEntidad y solo devuelve lo que este deja',
  src.includes('const resumen = resumirPorEntidad(') && src.includes('return [...resumen.entries()].map('));
ok('el freno usa la tolerancia comun (TOLERANCIA), no un numero suelto',
  reglas.includes('if (r.saldo <= TOLERANCIA) out.delete(id);'));

// El estado de cuenta y la lista tienen que dar por saldado lo mismo: los dos del estado de cuenta
// siguen en el repositorio; el de la lista es TOLERANCIA (0.01, la de `vencimiento.ts`).
ok('un solo centavo de tolerancia: dos en el estado de cuenta y TOLERANCIA en el resumen',
  veces(src, '0.01') === 2
  && src.includes('g.saldo > 0.01') && src.includes('p.saldo > 0.01')
  && fuente('src/services/cartera/vencimiento.ts').includes('export const TOLERANCIA = 0.01;'));

async function ejecutar(): Promise<void> {
  const { resumirPorEntidad } = await import('../src/services/cartera/reglasDeCartera');
  const hoy = '2026-10-05';
  const r = resumirPorEntidad([
    { entidadId: 'saldado', saldo: 0, vence: '2026-09-01', creado: null },
    { entidadId: 'centavo', saldo: 0.01, vence: '2026-09-01', creado: null },
    { entidadId: 'debe', saldo: 0.02, vence: '2026-09-01', creado: null },
    { entidadId: 'debe', saldo: 0, vence: '2026-08-01', creado: null },
  ], hoy);
  ok('quien lo tiene todo saldado NO sale', !r.has('saldado'));
  ok('quien debe exactamente RD$0.01 NO sale (el centavo del estado de cuenta)', !r.has('centavo'));
  ok('quien debe 0.02 sale, con UN documento pendiente', r.get('debe')?.documentosPendientes === 1);
}

// Un contrato que no se escribe se rompe sin que nadie lo note.
//  `cupoCredito` se busca DESPUES de FilaCartera: el lote 123 declaro arriba
//  otra interfaz con ese campo, el primer `indexOf` caia en ella y el tramo
//  salia vacio, con la nota intacta en su sitio.
{
  const desde = raw.indexOf('export interface FilaCartera');
  ok('FilaCartera.saldo documenta que el que no debe no sale',
    desde >= 0 && raw.slice(desde, raw.indexOf('cupoCredito', desde)).includes('no debe nada no es una fila'));
}

ejecutar().catch((e) => { ok(`la regla se ejecuta (${(e as Error).message})`, false); }).finally(() => {
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
  process.exit(fallos === 0 ? 0 : 1);
});
