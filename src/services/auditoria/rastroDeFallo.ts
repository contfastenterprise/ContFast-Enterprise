import { db, auditLogs } from '@/db';
import { Logger } from '@/utils/logger';

/**
 * La traza de un fallo que NO puede tumbar la operacion que ya salio bien.
 *
 * POR QUE EXISTE
 * --------------
 * Auditoria P2-43 (2026-09-03): hay 122 `catch` que se tragan el error. Los
 * que importan no son los 122: son los que dejan un documento fiscal o un
 * registro de auditoria a medias y siguen adelante como si nada. El correo
 * salio pero no quedo anotado; el PDF se genero pero no se guardo; el NCF se
 * quemo pero el hueco no se registro. La operacion principal fue bien -- y por
 * eso NO se puede relanzar --, pero el rastro se perdio, y con el la unica
 * forma de encontrar el caso despues.
 *
 * `invoiceFileGenerator` ya tenia esto resuelto, en privado y solo para si
 * (P2-30). Esto es lo mismo, en un sitio, para que el siguiente que lo necesite
 * no haga la tercera copia.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN
 * -----------------------------
 * 1. NUNCA lanza. Se llama desde dentro de un `catch`, muchas veces mientras
 *    otro error se esta propagando: perder el error original porque fallo la
 *    escritura de la traza seria cambiar un problema por otro peor.
 *
 * 2. Si la fila no se puede escribir, el `Logger` se lleva TODO lo que se
 *    perdio -- no un "fallo al registrar", que no sirve para nada, sino los
 *    campos con los que un humano puede reconstruirla a mano.
 *
 * `audit_logs.company_id` es NOT NULL y con clave foranea: sin empresa no hay
 * fila que escribir. Ese caso no se disimula -- va al Logger y se dice.
 */
export interface FalloSilencioso {
  /** Sin empresa no hay fila en `audit_logs`: la traza va solo al Logger. */
  companyId: string | null | undefined;
  modo?: 'PRODUCCION' | 'PRUEBA' | null;
  userId?: string | null;
  /** Que se estaba haciendo cuando fallo: 'correo_cliente', 'guardar_pdf'... */
  paso: string;
  /** La tabla a la que pertenece el caso: 'invoices', 'system_email_logs'... */
  entityType: string;
  entityId?: string | null;
  /**
   * Lo que hace falta para ENCONTRAR el caso despues: NCF, destinatario, ruta.
   * Sin esto la traza dice que algo fallo pero no cual, que es casi lo mismo
   * que no tenerla.
   */
  contexto?: Record<string, unknown>;
  err: unknown;
}

const motivoDe = (err: unknown): string =>
  (err as Error)?.message || (typeof err === 'string' ? err : String(err));

export async function registrarFalloSilencioso(f: FalloSilencioso): Promise<void> {
  const motivo = motivoDe(f.err);
  const resumen = { paso: f.paso, entityType: f.entityType, entityId: f.entityId ?? null, motivo, ...f.contexto };

  if (!f.companyId) {
    Logger.error(
      `[rastroDeFallo] fallo en «${f.paso}» SIN empresa: no hay fila que escribir en audit_logs.`,
      resumen
    );
    return;
  }

  try {
    await db.insert(auditLogs).values({
      companyId: f.companyId,
      userId: f.userId ?? undefined,
      // Sin modo explicito se deja el valor por defecto de la columna en vez de
      // inventar uno: marcar como PRODUCCION un fallo de PRUEBA seria ensuciar
      // el rastro justo donde se va a leer.
      ...(f.modo ? { modo: f.modo } : {}),
      action: `fallo_${f.paso}`,
      entityType: f.entityType,
      entityId: f.entityId ?? undefined,
      newValues: { motivo, ...f.contexto },
      ipAddress: 'server',
    });
  } catch (trazaErr) {
    // La segunda regla: aqui va TODO, porque esto es lo ultimo que queda.
    Logger.error(
      `[rastroDeFallo] no se pudo escribir la traza de «${f.paso}». Se pierde esta fila:`,
      { ...resumen, companyId: f.companyId, userId: f.userId ?? null, modo: f.modo ?? null, errorAlEscribir: motivoDe(trazaErr) }
    );
  }
}
