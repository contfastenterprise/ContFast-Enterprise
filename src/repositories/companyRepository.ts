import { db, companies, companySettings, ecfSequences, type DbTransaction } from '@/db';
import { eq, and, isNull, sql, desc } from 'drizzle-orm';
import { getCache, setCache, delCache } from '@/infrastructure/redis';
import { Logger } from '@/utils/logger';
import { registrarFalloSilencioso } from '@/services/auditoria/rastroDeFallo';
import { exigeVencimientoSecuencia } from '@/services/dgii/tiposComprobante';

export class CompanyRepository {
  /** La clave de la copia en cache. En un sitio: la usan la lectura y el borrado. */
  private static claveDeCache(companyId: string): string {
    return `company_settings:${companyId}`;
  }

  /**
   * Tira la copia cacheada de la configuracion. Devuelve si de verdad se tiro.
   *
   * Vive AQUI y no en cada ruta a proposito: la copia dura 24 horas y dentro
   * van el ambiente DGII y las credenciales de mSeller, asi que quien actualice
   * la configuracion y se olvide de borrarla deja a la empresa emitiendo con la
   * de antes. `updateLogoUrl` se olvidaba.
   *
   * NUNCA lanza -- se llama despues de que el guardado ya salio bien, y tumbarlo
   * por esto seria peor --, pero tampoco se lo calla: deja traza durable y
   * devuelve `false` para que quien llame pueda avisar a quien esta delante.
   */
  static async invalidarCacheDeConfiguracion(companyId: string): Promise<boolean> {
    try {
      await delCache(this.claveDeCache(companyId));
      return true;
    } catch (e) {
      await registrarFalloSilencioso({
        companyId,
        paso: 'invalidar_cache_configuracion',
        entityType: 'company_settings',
        entityId: companyId,
        contexto: { clave: this.claveDeCache(companyId), duracionCacheHoras: 24 },
        err: e,
      });
      return false;
    }
  }

  /**
   * Fetches settings for a company (with Redis caching).
   */
  static async getSettings(companyId: string): Promise<typeof companySettings.$inferSelect | undefined> {
    const cacheKey = this.claveDeCache(companyId);
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        return JSON.parse(cached) as typeof companySettings.$inferSelect;
      }
    } catch (e) {
      // No relanza a proposito: si la cache no se puede leer, se cae a la base,
      // que es la fuente de verdad. Lo unico que faltaba era decir de que
      // empresa se hablaba.
      Logger.warn('[CompanyRepository] no se pudo leer la cache de configuracion; se lee de la base', {
        companyId, motivo: (e as Error)?.message,
      });
    }

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(and(eq(companySettings.companyId, companyId), isNull(companySettings.deletedAt)))
      .limit(1);

    if (settings) {
      try {
        await setCache(cacheKey, JSON.stringify(settings), 86400); // Cache for 24 hours
      } catch (e) {
        // Quedarse sin cachear no rompe nada: se vuelve a leer de la base.
        Logger.warn('[CompanyRepository] no se pudo cachear la configuracion', {
          companyId, motivo: (e as Error)?.message,
        });
      }
    }
    return settings;
  }

  /**
   * Updates the logo URL for a company's settings.
   */
  static async updateLogoUrl(companyId: string, logoUrl: string) {
    const [updated] = await db
      .update(companySettings)
      .set({ logoUrl, updatedAt: new Date() })
      .where(and(eq(companySettings.companyId, companyId), isNull(companySettings.deletedAt)))
      .returning();
    // Esto NO estaba, y no habia ni catch que se lo tragara: sencillamente no se
    // borraba la copia. El logo nuevo no salia en los comprobantes hasta que
    // caducara, hasta 24 horas despues.
    await this.invalidarCacheDeConfiguracion(companyId);
    return updated;
  }


  /**
   * Gets company profile details.
   */
  static async getProfile(companyId: string) {
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
      .limit(1);
    return company;
  }

  /**
   * Fetches the active e-CF sequence for a given type, e.g. '31' (Fiscal).
   *
   * SOLO LECTURA INFORMATIVA. No la uses para emitir: no bloquea la fila, de
   * modo que dos emisiones simultaneas leen el mismo numero. Ese fue el
   * hallazgo DB-04 de la auditoria -- el NCF se leia aqui, se enviaba a la DGII
   * y se reservaba despues. Para emitir, `allocateNextNcf`, que si bloquea.
   */
  static async getSequence(companyId: string, ecfType: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION') {
    const [sequence] = await db
      .select()
      .from(ecfSequences)
      .where(
        and(
          eq(ecfSequences.companyId, companyId),
          eq(ecfSequences.ecfType, ecfType),
          eq(ecfSequences.modo, modo),
          eq(ecfSequences.status, 'active'),
          isNull(ecfSequences.deletedAt)
        )
      )
      .limit(1);
    return sequence;
  }

  /**
   * Increments the active sequence, returning the new sequence number.
   * Runs in a transaction.
   */
  static async incrementSequence(sequenceId: string, companyId: string) {
    const [updated] = await db
      .update(ecfSequences)
      .set({
        currentSequence: sql`current_sequence + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(ecfSequences.id, sequenceId), eq(ecfSequences.companyId, companyId)))
      .returning();
    return updated;
  }

  /**
   * Programmatic transaction-safe sequence allocator.
   */
  static async allocateNextNcf(tx: DbTransaction, companyId: string, ecfType: string, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'): Promise<string> {
    const [seq] = await tx
      .select()
      .from(ecfSequences)
      .where(
        and(
          eq(ecfSequences.companyId, companyId),
          eq(ecfSequences.ecfType, ecfType),
          eq(ecfSequences.modo, modo),
          eq(ecfSequences.status, 'active'),
          isNull(ecfSequences.deletedAt)
        )
      )
      .orderBy(desc(ecfSequences.createdAt))
      .limit(1)
      .for('update'); // Row locking for thread safety!

    if (!seq) {
      throw new Error(`No existe una secuencia e-CF activa y autorizada para el tipo ${ecfType} en ambiente ${modo}.`);
    }

    if (seq.currentSequence >= seq.maxSequence) {
      throw new Error(`La secuencia de comprobantes e-CF tipo ${ecfType} ha llegado a su límite máximo (${seq.maxSequence}) en ambiente ${modo}. Solicite una nueva autorización SACF.`);
    }

    // Vencimiento — solo en los tipos que lo llevan (la DGII lo marca No Aplica
    // en el e-32, el e-34 y el e-47) y solo si la fecha consta. Comprobarlo sin
    // mirar el tipo convertia una fecha que no describe ninguna autorizacion en
    // un bloqueo de la emision: el e-32 de produccion tenia `31-12-2026` puesto
    // a mano y habria dejado de facturar el 1 de enero de 2027.
    if (exigeVencimientoSecuencia(ecfType) && seq.sequenceExpiry) {
      const [dd, mm, yyyy] = (seq.sequenceExpiry as string).split('-').map(Number);
      const expiryDate = new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);
      if (new Date() > expiryDate) {
        throw new Error(
          `La secuencia e-CF tipo ${ecfType} venció el ${seq.sequenceExpiry} en ambiente ${modo}. Renueve la autorización SACF antes de emitir comprobantes.`
        );
      }
    }

    const nextVal = seq.currentSequence + 1;

    // Update sequence
    await tx
      .update(ecfSequences)
      .set({ currentSequence: nextVal, updatedAt: new Date() })
      .where(eq(ecfSequences.id, seq.id));

    // Electronic (e-CF) starts with 'E' and requires 13 characters total
    // (1 char prefix + 2 chars type + 10 chars sequence).
    // Traditional starts with 'B' (or other) and requires 11 characters total
    // (1 char prefix + 2 chars type + 8 chars sequence).
    const isElectronic = seq.prefix.toUpperCase().startsWith('E');
    const padLength = isElectronic ? 10 : 8;
    const expectedLength = isElectronic ? 13 : 11;
    
    const sequenceStr = nextVal.toString().padStart(padLength, '0');
    const ncf = `${seq.prefix}${ecfType}${sequenceStr}`;

    if (ncf.length !== expectedLength) {
      throw new Error(
        `Error de validación NCF: El comprobante generado ${ncf} tiene una longitud de ${ncf.length} caracteres, pero se esperaba ${expectedLength} caracteres para comprobantes ${isElectronic ? 'electrónicos' : 'tradicionales'} en ambiente ${modo}.`
      );
    }

    return ncf;
  }
}
