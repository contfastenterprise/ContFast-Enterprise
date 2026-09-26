/**
 * Lote 205 -- la serie de compras y ventas por dia que va en el informe de avisos.
 *
 * ESTE MODULO ES PURO: arma el esqueleto de dias y cruza contra el las filas que traiga la
 * consulta. La consulta vive aparte (`consultaDeMovimiento.ts`), y la separacion no es
 * ornamental -- es la leccion del lote 178: lo que DECIDE no puede arrastrar `@/db`, o se
 * vuelve imposible de probar sin `DATABASE_URL` y el banco deja de poder ejecutarlo.
 *
 * POR QUE CATORCE DIAS Y NO EL DIA
 * -------------------------------
 * El dueño pidio "graficos de compras y ventas del dia".
 *
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
 * Con la medicion delante, el dueño eligio catorce dias con el dia del informe destacado,
 * y las cifras del dia aparte en numeros -- que es donde se leen exactas.
 *
 * POR QUE EL ESQUELETO SE ARMA AQUI Y NO SE USA LO QUE DEVUELVE LA BASE
 * -------------------------------------------------------------------
 * Un `GROUP BY` solo devuelve los dias que TIENEN filas. Si el grafico se dibujara con
 * eso, los seis dias con ventas del periodo medido saldrian como seis barras juntas y
 * equiespaciadas: parecerian seis dias seguidos vendiendo, cuando la verdad es que entre
 * medias hay dias sin una sola venta. El hueco es el dato.
 */
import { diaRD, diaRDMas } from '@/utils/fechasLocales';
import type { DiaDelGrafico } from '@/services/avisos/graficoDeBarras';

/**
 * Cuantos dias entran en el grafico del informe.
 *
 * Catorce y no treinta porque en el ancho de una hoja carta treinta pares de barras dejan
 * cada barra por debajo de los 8 puntos, y las etiquetas de los dias se solapan.
 */
export const DIAS_DEL_INFORME = 14;

/** Una fila tal como la devuelve el `GROUP BY`: solo los dias que tienen algo. */
export interface FilaDeMovimiento {
  dia: string;
  compras?: number;
  ventas?: number;
}

/**
 * Los dias del periodo, en orden, terminando en `hasta` (incluido).
 *
 * `hasta` en 'AAAA-MM-DD'. Se apoya en `diaRDMas`, que suma dias sobre el mediodia UTC:
 * eso es lo que hace que no se salte un dia ni lo repita en los cambios de mes.
 */
export function diasDelPeriodo(hasta: string, cuantos: number = DIAS_DEL_INFORME): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta) || cuantos < 1) return [];
  const dias: string[] = [];
  //  Se recorre hacia atras desde `hasta` y se invierte al final, en vez de calcular el
  //  primero y sumar: asi el ultimo dia es EXACTAMENTE el que se pidio, que es el que se
  //  destaca en el grafico y el que titula el informe.
  for (let i = 0; i < cuantos; i++) {
    const d = i === 0 ? hasta : diaRDMas(`${hasta}T12:00:00Z`, -i);
    if (!d) return [];
    dias.push(d);
  }
  return dias.reverse();
}

/**
 * Cruza las filas de la consulta contra el esqueleto de dias.
 *
 * Los dias sin fila salen con 0 y 0 -- que es el dato, no un hueco. Lo que la base
 * devuelva para un dia que no esta en el periodo se DESCARTA: si se colara, el grafico
 * dibujaria una barra en un dia que su eje no tiene.
 *
 * Un importe que no sea un numero finito se trata como 0. Las columnas `decimal` llegan
 * como TEXTO desde Postgres (fue el defecto del lote 167, que tumbaba la pantalla del 606
 * con "toFixed is not a function"), asi que aqui se convierte y se comprueba en vez de
 * confiar en el tipo.
 */
export function serieConTodosLosDias(
  dias: readonly string[],
  filas: readonly FilaDeMovimiento[],
): DiaDelGrafico[] {
  const porDia = new Map<string, { compras: number; ventas: number }>();
  for (const f of filas) {
    if (!f?.dia) continue;
    const previo = porDia.get(f.dia) ?? { compras: 0, ventas: 0 };
    porDia.set(f.dia, {
      compras: previo.compras + numero(f.compras),
      ventas: previo.ventas + numero(f.ventas),
    });
  }
  return dias.map(dia => {
    const v = porDia.get(dia);
    return { dia, compras: v?.compras ?? 0, ventas: v?.ventas ?? 0 };
  });
}

/** Un importe de la base, que puede venir como texto, como numero o como nada. */
function numero(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Los totales del dia del informe: el ultimo de la serie. */
export function totalesDelDia(serie: readonly DiaDelGrafico[]): { compras: number; ventas: number } {
  const ultimo = serie[serie.length - 1];
  return { compras: ultimo?.compras ?? 0, ventas: ultimo?.ventas ?? 0 };
}

/** El dia de RD de hoy, que es el que titula el informe y el que se destaca. */
export const diaDelInforme = (): string => diaRD();
