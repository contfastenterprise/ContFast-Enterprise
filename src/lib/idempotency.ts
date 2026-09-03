import { db, idempotencyKeys } from '@/db';
import { and, eq } from 'drizzle-orm';

/**
 * Envuelve una ruta POST critica con proteccion de idempotencia.
 *
 * Auditoria P1-11 (2026-09-03), migracion 0051. Un reintento de red o un
 * doble clic en una ruta POST critica (pago, cobro, emision de factura)
 * puede generar dos veces el mismo efecto. El indice unico de
 * financial_movements (migracion 0050) solo protege el caso donde el
 * reintento reutiliza un documentId YA EXISTENTE -- no protege el caso,
 * mas comun, de que cada intento cree una fila (y por lo tanto un
 * documentId) NUEVA.
 *
 * Uso: el cliente (frontend) envia un header `Idempotency-Key` unico por
 * intento de usuario (el MISMO valor en un reintento automatico o un
 * doble clic, uno distinto por cada accion real del usuario). Si el
 * header no viene, la ruta funciona igual que antes de este cambio --
 * proteccion opcional, no rompe clientes existentes que todavia no lo
 * envian.
 *
 * Semantica:
 *   - Primera vez que se ve una clave: se reserva (INSERT unico por
 *     companyId+modo+route+key), se ejecuta el handler, y se guarda su
 *     respuesta.
 *   - Repetido mientras la primera sigue en curso: 409, sin re-ejecutar
 *     ni esperar.
 *   - Repetido despues de que la primera termino con exito: se devuelve
 *     la MISMA respuesta guardada, sin re-ejecutar el handler.
 *   - Si el handler lanza un error: se libera la clave (DELETE) para que
 *     un reintento legitimo despues de un fallo real pueda proceder.
 */
export interface IdempotencyResult {
  status: number;
  body: unknown;
}

export async function withIdempotency(
  opts: {
    companyId: string;
    modo: 'PRODUCCION' | 'PRUEBA';
    route: string;
    idempotencyKey: string | null | undefined;
  },
  handler: () => Promise<IdempotencyResult>
): Promise<IdempotencyResult & { deDuplicado: boolean }> {
  const key = opts.idempotencyKey?.trim();
  if (!key) {
    // Sin header: sin proteccion (comportamiento igual al de antes de este cambio).
    const resultado = await handler();
    return { ...resultado, deDuplicado: false };
  }

  const filtro = and(
    eq(idempotencyKeys.companyId, opts.companyId),
    eq(idempotencyKeys.modo, opts.modo),
    eq(idempotencyKeys.route, opts.route),
    eq(idempotencyKeys.idempotencyKey, key)
  );

  let reservado = false;
  try {
    await db.insert(idempotencyKeys).values({
      companyId: opts.companyId,
      modo: opts.modo,
      route: opts.route,
      idempotencyKey: key,
      status: 'processing',
    });
    reservado = true;
  } catch (err: any) {
    // 23505 = unique_violation. Cualquier otro error es real, no de idempotencia.
    if (err?.code !== '23505') throw err;
  }

  if (!reservado) {
    const [existente] = await db.select().from(idempotencyKeys).where(filtro).limit(1);

    if (existente?.status === 'completed') {
      return { status: existente.responseStatus ?? 200, body: existente.responseBody, deDuplicado: true };
    }
    return {
      status: 409,
      body: {
        success: false,
        error: {
          code: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'Ya hay una solicitud identica en curso. Espere a que termine antes de reintentar.',
        },
      },
      deDuplicado: true,
    };
  }

  try {
    const resultado = await handler();
    await db
      .update(idempotencyKeys)
      .set({ status: 'completed', responseStatus: resultado.status, responseBody: resultado.body as any, completedAt: new Date() })
      .where(filtro);
    return { ...resultado, deDuplicado: false };
  } catch (err) {
    await db.delete(idempotencyKeys).where(filtro);
    throw err;
  }
}
