/**
 * EcfValidator — Pre-emission validations for Dominican e-CF documents.
 *
 * Order of checks (all must pass before issuing):
 *  1. Contributor status  — RNC must be active in DGII.
 *  2. Authorized sequence — An active sequence record must exist for the ecfType.
 *  3. Available range     — currentSequence < maxSequence.
 *  4. Sequence expiry     — Validated ONLY when sequenceExpiry was supplied by DGII (non-null).
 */

import { db, ecfSequences } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { DGIIService } from '@/services/dgii/rncLookup';

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface EcfValidationResult {
  valid: boolean;
  errors: EcfValidationError[];
}

export interface EcfValidationError {
  code: 'CONTRIBUTOR_INACTIVE' | 'NO_ACTIVE_SEQUENCE' | 'SEQUENCE_EXHAUSTED' | 'SEQUENCE_EXPIRED' | 'DGII_LOOKUP_FAILED';
  message: string;
}

// ─── Helper: parse dd-MM-yyyy → Date (end of day) ────────────────────────────

function parseExpiryDate(ddmmyyyy: string): Date {
  const [dd, mm, yyyy] = ddmmyyyy.split('-').map(Number);
  // End of the expiry day: 23:59:59 local
  return new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);
}

// ─── EcfValidator ─────────────────────────────────────────────────────────────

export class EcfValidator {
  /**
   * 1. Verify the emitter's RNC is active in DGII.
   *    If the DGII lookup service is unavailable, we log a warning but do NOT block
   *    the emission — this avoids a hard dependency on a third-party service.
   *    Set `strict = true` to treat lookup failures as blocking errors.
   */
  static async validateContributorStatus(
    rnc: string,
    strict = false
  ): Promise<EcfValidationError | null> {
    try {
      const result = await DGIIService.lookupRNC(rnc);

      if (!result.success) {
        // Could not look up the RNC (network error, etc.)
        if (strict) {
          return {
            code: 'DGII_LOOKUP_FAILED',
            message: `No se pudo verificar el estado del contribuyente (RNC ${rnc}): ${result.message}`,
          };
        }
        // Non-strict: log and allow
        console.warn(`[EcfValidator] DGII lookup unavailable for RNC ${rnc}: ${result.message}. Proceeding.`);
        return null;
      }

      const statusLower = (result.status || '').toLowerCase();
      const isActive =
        statusLower === 'activo' ||
        statusLower === 'active' ||
        statusLower === '1';

      if (!isActive) {
        return {
          code: 'CONTRIBUTOR_INACTIVE',
          message: `El contribuyente con RNC ${rnc} no está activo en la DGII (estado: "${result.status}"). No se puede emitir un e-CF.`,
        };
      }

      return null; // OK
    } catch (err: any) {
      if (strict) {
        return {
          code: 'DGII_LOOKUP_FAILED',
          message: `Error al consultar el estado del contribuyente (RNC ${rnc}): ${err.message}`,
        };
      }
      console.warn(`[EcfValidator] DGII lookup threw for RNC ${rnc}: ${err.message}. Proceeding.`);
      return null;
    }
  }

  /**
   * 2–4. Validate the active e-CF sequence:
   *   - Sequence exists and is active.
   *   - Range: currentSequence < maxSequence.
   *   - Expiry: only checked when sequenceExpiry is NOT null (DGII supplied it).
   */
  static async validateSequence(
    companyId: string,
    ecfType: string
  ): Promise<EcfValidationError[]> {
    const errors: EcfValidationError[] = [];

    const [seq] = await db
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
      .orderBy(desc(ecfSequences.createdAt))
      .limit(1);

    // Check 2: sequence must exist
    if (!seq) {
      errors.push({
        code: 'NO_ACTIVE_SEQUENCE',
        message: `No existe una secuencia e-CF activa y autorizada para el tipo ${ecfType}. Registre la autorización SACF antes de facturar.`,
      });
      return errors; // no point checking further
    }

    // Check 3: range available
    if (seq.currentSequence >= seq.maxSequence) {
      errors.push({
        code: 'SEQUENCE_EXHAUSTED',
        message: `La secuencia e-CF tipo ${ecfType} ha alcanzado su límite máximo (${seq.maxSequence}). Solicite una nueva autorización SACF a la DGII.`,
      });
    }

    // Check 4: expiry — ONLY if DGII supplied the date
    if (seq.sequenceExpiry) {
      const expiryDate = parseExpiryDate(seq.sequenceExpiry);
      if (new Date() > expiryDate) {
        errors.push({
          code: 'SEQUENCE_EXPIRED',
          message: `La secuencia e-CF tipo ${ecfType} venció el ${seq.sequenceExpiry}. Renueve la autorización SACF antes de emitir comprobantes.`,
        });
      }
    }
    // If sequenceExpiry is null → no expiry constraint was set by DGII → skip check entirely.

    return errors;
  }

  /**
   * Master validation: runs all checks in order and returns a consolidated result.
   * Call this BEFORE opening the DB transaction in invoiceService.
   *
   * @param companyId - UUID of the issuing company.
   * @param ecfType   - e-CF type code (e.g. '31', '32').
   * @param companyRnc - RNC of the emitter (for DGII status check).
   * @param strictRncLookup - If true, a failed DGII lookup blocks the emission.
   */
  static async runAll(
    companyId: string,
    ecfType: string,
    companyRnc: string,
    strictRncLookup = false
  ): Promise<EcfValidationResult> {
    const errors: EcfValidationError[] = [];

    // 1. Contributor status
    const rncError = await EcfValidator.validateContributorStatus(companyRnc, strictRncLookup);
    if (rncError) errors.push(rncError);

    // 2–4. Sequence checks (run even if RNC check failed so we surface all errors at once)
    const seqErrors = await EcfValidator.validateSequence(companyId, ecfType);
    errors.push(...seqErrors);

    return { valid: errors.length === 0, errors };
  }
}
