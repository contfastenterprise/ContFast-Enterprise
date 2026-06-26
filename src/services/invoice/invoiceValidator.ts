import { EcfValidator } from '@/services/ecfValidator';

export class InvoiceValidator {
  /**
   * Helper to run pre-emission validation via EcfValidator.
   */
  static async validatePreEmission(companyId: string, ecfType: string, rnc: string) {
    const preCheck = await EcfValidator.runAll(companyId, ecfType, rnc);
    if (!preCheck.valid) {
      const messages = preCheck.errors.map((e) => e.message).join(' | ');
      const err: any = new Error(`No se puede emitir el e-CF: ${messages}`);
      err.status = 422;
      err.code = 'ECF_PRE_EMISSION_FAILED';
      err.validationErrors = preCheck.errors;
      throw err;
    }
  }
}
