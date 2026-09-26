/**
 * Lote 205 -- de donde salen las compras y las ventas de cada dia.
 *
 * Separado de `movimientoDeLosDias.ts` a proposito: aqui vive `@/db` y alli la decision,
 * que se prueba sin base de datos (leccion del lote 178).
 *
 * LA ASIMETRIA QUE HAY QUE RESPETAR, Y ES LA TRAMPA DE ESTE LOTE
 * -------------------------------------------------------------
 * Las dos series NO se agrupan igual, y no es un descuido:
 *
 *   · **Ventas**: `invoices.created_at` es `timestamp sin zona` y guarda UTC. Para saber
 *     a que dia dominicano pertenece hay que CONVERTIRLO -- `diaRDdeColumna`, la misma
 *     funcion que usa el panel. Sin eso, a partir de las 20:00 de RD las ventas se
 *     cuentan en el dia siguiente: es exactamente el defecto que cerro el lote 174, que
 *     vaciaba "Ventas de hoy" cada noche.
 *
 *   · **Compras**: `expenses.issue_date` es una columna `date`, o sea un DIA, no un
 *     instante. Convertirla de zona seria un error del signo contrario: le aplicaria un
 *     desfase a algo que no tiene hora y correria las compras un dia hacia atras. Se
 *     compara tal cual.
 *
 * La regla general que deja: se convierte lo que es un INSTANTE; un dia ya es un dia.
 *
 * ESTADOS DE VENTA: los mismos que el panel (`accepted`, `signed`, `submitted`), no todos.
 * Una factura en borrador o dada de baja no es una venta, y si el informe contara distinto
 * que el panel, las dos cifras se contradecirian sin que se pudiera saber cual miente.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, invoices, expenses } from '@/db';
import { diaRDdeColumna } from '@/repositories/biRepository';
import type { FilaDeMovimiento } from '@/services/avisos/movimientoDeLosDias';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

/**
 * Los estados de factura que cuentan como venta.
 *
 * Copiados del panel a proposito de forma explicita y no importados: `activeSalesStatuses`
 * es privado de `BIRepository`. Si algun dia se hacen publicos, este es el sitio a
 * enganchar -- y el banco vigila que las dos listas sigan diciendo lo mismo.
 */
const ESTADOS_DE_VENTA = ['accepted', 'signed', 'submitted'] as const;

/**
 * Compras y ventas por dia entre dos dias de RD, los dos incluidos.
 *
 * Devuelve SOLO los dias con movimiento: completar el periodo es de
 * `serieConTodosLosDias`, que es puro.
 */
export async function movimientoPorDia(
  companyId: string,
  //  CON EL ALIAS, no con la union escrita a mano: el trinquete del lote 118 cuenta las
  //  uniones sueltas y tiene techo, precisamente para que el modo se escriba en un solo
  //  sitio. Lo cazo el barrido completo, no yo.
  modo: ModoOperativo,
  desde: string,
  hasta: string,
): Promise<FilaDeMovimiento[]> {
  const diaDeVenta = diaRDdeColumna(invoices.createdAt);

  const [ventas, compras] = await Promise.all([
    db.select({
      dia: sql<string>`${diaDeVenta}::text`,
      total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)`,
    })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.modo, modo),
        inArray(invoices.status, [...ESTADOS_DE_VENTA]),
        isNull(invoices.deletedAt),
        gte(diaDeVenta, sql`${desde}::date`),
        lte(diaDeVenta, sql`${hasta}::date`),
      ))
      .groupBy(diaDeVenta),

    //  `issue_date` SIN convertir: ya es un dia (ver el encabezado del fichero).
    db.select({
      dia: sql<string>`${expenses.issueDate}::text`,
      total: sql<string>`COALESCE(SUM(CAST(${expenses.amount} AS numeric)), 0)`,
    })
      .from(expenses)
      .where(and(
        eq(expenses.companyId, companyId),
        eq(expenses.modo, modo),
        isNull(expenses.deletedAt),
        gte(expenses.issueDate, desde),
        lte(expenses.issueDate, hasta),
      ))
      .groupBy(expenses.issueDate),
  ]);

  //  Las dos listas se devuelven como filas del mismo tipo; cruzarlas contra el periodo es
  //  del modulo puro. Los importes van tal cual -- llegan como TEXTO, porque las columnas
  //  `decimal` de Postgres llegan asi (defecto del lote 167), y quien los convierte es
  //  `serieConTodosLosDias`, en un solo sitio.
  return [
    ...ventas.map(v => ({ dia: String(v.dia).slice(0, 10), ventas: Number(v.total) })),
    ...compras.map(c => ({ dia: String(c.dia).slice(0, 10), compras: Number(c.total) })),
  ];
}
