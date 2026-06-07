import { db, companies, companySettings, ecfSequences } from '@/db';
import { eq, and, isNull, sql } from 'drizzle-orm';

export class CompanyRepository {
  /**
   * Fetches settings for a company.
   */
  static async getSettings(companyId: string) {
    const [settings] = await db
      .select()
      .from(companySettings)
      .where(and(eq(companySettings.companyId, companyId), isNull(companySettings.deletedAt)))
      .limit(1);
    return settings;
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
   */
  static async getSequence(companyId: string, ecfType: string) {
    const [sequence] = await db
      .select()
      .from(ecfSequences)
      .where(
        and(
          eq(ecfSequences.companyId, companyId),
          eq(ecfSequences.ecfType, ecfType),
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
  static async allocateNextNcf(tx: any, companyId: string, ecfType: string): Promise<string> {
    const [seq] = await tx
      .select()
      .from(ecfSequences)
      .where(
        and(
          eq(ecfSequences.companyId, companyId),
          eq(ecfSequences.ecfType, ecfType),
          eq(ecfSequences.status, 'active'),
          isNull(ecfSequences.deletedAt)
        )
      )
      .limit(1)
      .for('update'); // Row locking for thread safety!

    if (!seq) {
      throw new Error(`No existe una secuencia e-CF activa y autorizada para el tipo ${ecfType}.`);
    }

    if (seq.currentSequence >= seq.maxSequence) {
      throw new Error(`La secuencia de comprobantes e-CF tipo ${ecfType} ha llegado a su límite máximo.`);
    }

    const nextVal = seq.currentSequence + 1;

    // Update sequence
    await tx
      .update(ecfSequences)
      .set({ currentSequence: nextVal, updatedAt: new Date() })
      .where(eq(ecfSequences.id, seq.id));

    // Pad sequence number to 8 digits
    const sequenceStr = nextVal.toString().padStart(8, '0');
    return `${seq.prefix}${ecfType}${sequenceStr}`; // E.g. E3100000001
  }
}
