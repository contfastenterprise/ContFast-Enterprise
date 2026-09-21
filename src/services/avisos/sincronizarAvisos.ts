/**
 * Los avisos del panel, guardados: una fila por aviso, y se cierra sola.
 *
 * POR QUE ESTE FICHERO (lote 160)
 * -------------------------------
 * El panel calcula sus avisos en cada carga y los enseña; ahi se acaban. Nadie
 * sabia desde cuando llevaba avisando algo, ni podia quitarse de encima uno ya
 * atendido, y si nadie abria el panel el aviso no existia para nadie. La tabla
 * `notifications` estaba desde el principio VACIA (0 filas el 2026-09-18; la
 * unica referencia en `src/` era su esquema).
 *
 * LA IDENTIDAD DEL AVISO ES SU CLAVE. Cada aviso del panel ya trae un `id`
 * estable -- `declaracion-606-202608`, `caja-<id de la sesion>`, el id del
 * cheque, el de la factura rechazada, `periodos-<modo>` --, asi que es esa la
 * que se guarda. Sin clave estable, cada carga del panel insertaria otra vez el
 * mismo aviso; con ella hay UNA fila por empresa, modo y clave, que se
 * actualiza.
 *
 * SE CIERRAN SOLOS. Lo que ya no aparece en el calculo del panel es que dejo de
 * aplicar -- el cheque se cobro, la caja se cerro, el 606 se marco presentado --
 * asi que se le pone `resolved_at`. No se borra: saber que el 606 de agosto
 * estuvo avisando tres semanas es informacion.
 *
 * NUNCA LANZA: guardar el aviso no puede tumbar el panel que lo produjo.
 */
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { db, notifications } from '@/db';
import { Logger } from '@/utils/logger';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

/** Lo que trae cada aviso del panel (ver repositories/dashboardRepository.ts). */
export interface AvisoDelPanel {
  id: string;
  type: string;
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
}

/**
 * Como de grave es cada aviso. Solo cambia el color y el orden con que se
 * enseñan: un comprobante rechazado no es lo mismo que un periodo que se acaba
 * dentro de un mes.
 */
export function severidadDeAviso(tipo: string): 'error' | 'warning' | 'info' {
  // Lote 176: una diferencia de arqueo es dinero que falta o que sobra y que
  // el mayor no refleja. No es un recordatorio: es un descuadre.
  if (tipo === 'invoice_rejected' || tipo === 'caja_con_diferencia') return 'error';
  if (tipo === 'check_due' || tipo === 'caja_sin_cerrar' || tipo === 'declaracion_pendiente') return 'warning';
  return 'info';
}

/**
 * Deja la tabla igual a lo que dice el panel AHORA: lo que hay se actualiza, lo
 * nuevo se inserta, y lo que ya no esta se cierra.
 *
 * Devuelve cuantos avisos quedaron vivos, para quien quiera registrarlo.
 */
export async function sincronizarAvisos(
  companyId: string,
  modo: ModoOperativo,
  avisos: readonly AvisoDelPanel[]
): Promise<number> {
  try {
    const claves = avisos.map((a) => a.id);

    if (avisos.length > 0) {
      await db
        .insert(notifications)
        .values(avisos.map((a) => ({
          companyId,
          modo,
          clave: a.id,
          title: a.title,
          message: a.description,
          type: severidadDeAviso(a.type),
          actionText: a.actionText,
          actionLink: a.actionLink,
          //  Si estaba cerrado y vuelve a aparecer, vuelve a estar vivo.
          resolvedAt: null,
        })))
        .onConflictDoUpdate({
          target: [notifications.companyId, notifications.modo, notifications.clave],
          set: {
            title: sql`excluded.title`,
            message: sql`excluded.message`,
            type: sql`excluded.type`,
            actionText: sql`excluded.action_text`,
            actionLink: sql`excluded.action_link`,
            resolvedAt: null,
            updatedAt: new Date(),
          },
        });
    }

    //  Lo que ya no aparece, se cierra. `notInArray` con lista vacia no es
    //  valido en SQL, asi que el caso "no queda ningun aviso" va aparte: ahi se
    //  cierran todos los vivos (`and` descarta el `undefined`).
    //  El filtro por modo va escrito DENTRO del where, no en una variable:
    //  `aislamientoModo.vitest.ts` lee la sentencia y no sigue variables.
    await db
      .update(notifications)
      .set({ resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(notifications.companyId, companyId),
        eq(notifications.modo, modo),
        isNull(notifications.resolvedAt),
        claves.length > 0 ? notInArray(notifications.clave, claves) : undefined
      ));

    return avisos.length;
  } catch (err: unknown) {
    Logger.warn('[avisos] no se pudieron guardar los avisos del panel', {
      companyId,
      modo,
      error: (err as Error)?.message,
    });
    return 0;
  }
}

/** Los avisos vivos de una empresa y modo, sin leer primero. */
export async function avisosVivos(companyId: string, modo: ModoOperativo) {
  return await db
    .select({
      id: notifications.id,
      clave: notifications.clave,
      title: notifications.title,
      message: notifications.message,
      type: notifications.type,
      actionText: notifications.actionText,
      actionLink: notifications.actionLink,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(
      eq(notifications.companyId, companyId),
      eq(notifications.modo, modo),
      isNull(notifications.resolvedAt)
    ))
    .orderBy(sql`${notifications.readAt} nulls first`, sql`${notifications.createdAt} desc`);
}

/** Marca como leidos unos avisos (o todos los vivos, si no se dice cuales). */
export async function marcarLeidos(companyId: string, modo: ModoOperativo, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(notifications.companyId, companyId),
      eq(notifications.modo, modo),
      isNull(notifications.readAt),
      ids && ids.length > 0 ? inArray(notifications.id, ids) : undefined
    ));
}
