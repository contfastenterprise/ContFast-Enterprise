/**
 * EcfValidator — Pre-emission validations for Dominican e-CF documents.
 *
 * Order of checks (all must pass before issuing):
 *  1. Contributor status  — RNC must be active in DGII.
 *  2. Authorized sequence — An active sequence record must exist for the ecfType.
 *  3. Available range     — currentSequence < maxSequence.
 *  4. Sequence expiry     — Solo en los tipos que la DGII marca con vencimiento
 *                          obligatorio, y solo si la fecha consta.
 *
 * SOBRE EL PUNTO 4
 * ----------------
 * `FechaVencimientoSecuencia` es **No Aplica** en el e-32, el e-34 y el e-47.
 * Esta comprobacion miraba la fecha sin mirar el tipo, y eso convertia un dato
 * que la DGII no usa para esos comprobantes en un bloqueo de la emision.
 *
 * No es teorico: el e-32 de produccion tenia cargado `31-12-2026` -- una fecha
 * puesta a mano, no una autorizacion real -- y el 1 de enero de 2027 habria
 * dejado de poder emitirse la factura de consumo, el tipo mas comun del
 * sistema, con un error que habla de renovar un SACF que no hacia falta.
 */

import { db, ecfSequences } from '@/db';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { bloqueoDeEmision } from '@/services/suscripcion/planRepositorio';
import { PlanNoPermiteError, type BloqueoDelPlan } from '@/services/suscripcion/planVigente';
import { DGIIService } from '@/services/dgii/rncLookup';
import { exigeVencimientoSecuencia } from '@/services/dgii/tiposComprobante';

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
    } catch (err: unknown) {
      if (strict) {
        return {
          code: 'DGII_LOOKUP_FAILED',
          message: `Error al consultar el estado del contribuyente (RNC ${rnc}): ${(err as Error).message}`,
        };
      }
      console.warn(`[EcfValidator] DGII lookup threw for RNC ${rnc}: ${(err as Error).message}. Proceeding.`);
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
    ecfType: string,
    modo: 'PRODUCCION' | 'PRUEBA'
  ): Promise<EcfValidationError[]> {
    const errors: EcfValidationError[] = [];

    const [seq] = await db
      .select()
      .from(ecfSequences)
      .where(
        and(
          eq(ecfSequences.companyId, companyId),
          // El indice unico de la tabla es (company_id, ecf_type, modo): hay DOS
          // secuencias por tipo, una por entorno, con autorizaciones SACF
          // distintas de la DGII. Sin este filtro la consulta elegia por fecha
          // de creacion, asi que una emision real podia validarse contra el
          // rango y el vencimiento de la secuencia de pruebas -- y al reves.
          eq(ecfSequences.modo, modo),
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

    // Check 4: vencimiento — solo en los tipos que lo llevan, y solo si consta.
    // En el e-32, el e-34 y el e-47 la fecha no va en el documento: una que
    // este cargada ahi no describe ninguna autorizacion que la DGII compruebe,
    // y no puede impedir facturar.
    if (exigeVencimientoSecuencia(ecfType) && seq.sequenceExpiry) {
      const expiryDate = parseExpiryDate(seq.sequenceExpiry);
      if (new Date() > expiryDate) {
        errors.push({
          code: 'SEQUENCE_EXPIRED',
          message: `La secuencia e-CF tipo ${ecfType} venció el ${seq.sequenceExpiry}. Renueve la autorización SACF antes de emitir comprobantes.`,
        });
      }
    }
    // Sin fecha, o en un tipo que no la lleva: no hay restriccion que comprobar.

    return errors;
  }

  /**
   * 5. El plan de la empresa. LOTE 299: ya no cuenta por su cuenta.
   *
   * Aqui habia un SEGUNDO contador de e-CF, distinto del de la ruta: contaba
   * PRODUCCION sobre el periodo entero de la suscripcion (no por mes), no miraba
   * si estaba vencida y no admitia `trialing`. Ahora pregunta a la regla unica
   * (`services/suscripcion/planVigente.ts`), la misma de todas las puertas. Las
   * rutas ya la han pasado; esto es la segunda barrera para quien llame a
   * `InvoiceService.issueInvoice` por otro camino.
   *
   * Quitar esta llamada es un MUTANTE EQUIVALENTE para los bancos: por las rutas
   * la guarda de la ruta para antes, y hoy no hay otro camino a la emision.
   */
  static async validateSubscription(companyId: string, modo: 'PRODUCCION' | 'PRUEBA'): Promise<BloqueoDelPlan | null> {
    return bloqueoDeEmision(companyId, modo);
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
    modo: 'PRODUCCION' | 'PRUEBA',
    strictRncLookup = false
  ): Promise<EcfValidationResult> {
    const errors: EcfValidationError[] = [];

    // 0. SaaS Subscription check
    // Lote 299: un bloqueo del plan se LANZA con su codigo y su estado (403/409), el
    // mismo que dan las rutas, en vez de mezclarse con los errores del comprobante
    // y salir como un 422 de validacion.
    const bloqueoDelPlan = await EcfValidator.validateSubscription(companyId, modo);
    if (bloqueoDelPlan) throw new PlanNoPermiteError(bloqueoDelPlan);

    // 1. Contributor status
    const rncError = await EcfValidator.validateContributorStatus(companyRnc, strictRncLookup);
    if (rncError) errors.push(rncError);

    // 2–4. Sequence checks (run even if RNC check failed so we surface all errors at once)
    const seqErrors = await EcfValidator.validateSequence(companyId, ecfType, modo);
    errors.push(...seqErrors);

    return { valid: errors.length === 0, errors };
  }
}
