import { db, cashSessions, cashMovements, companySettings, creditDebitNotes } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { CashRepository } from '@/repositories/cashRepository';
import { CompanyRepository } from '@/repositories/companyRepository';

export class CashService {
  /**
   * Opens a new cash session. Enforces:
   * 1. Only one active session per cashier (user) at a time.
   * 2. The opening balance (initial fund) must be provided.
   */
  static async openSession(userId: string, companyId: string, cashRegisterId: string, initialBalance: number) {
    if (initialBalance < 0) {
      throw new Error('El fondo inicial de caja no puede ser negativo.');
    }

    // Checking active session
    const active = await CashRepository.getActiveSession(userId, companyId);
    if (active) {
      throw new Error('Ya tiene una sesión de caja activa. Debe cerrarla antes de abrir una nueva.');
    }

    return await CashRepository.openSession({
      companyId,
      cashRegisterId,
      userId,
      initialBalance,
    });
  }

  /**
   * Adds a cash movement (input, output, refund) to the session. Enforces:
   * 1. The movement can only be added if the session is currently active/open.
   * 2. The session must belong to the requesting cashier.
   * 3. Cash outflows (cash_out) > max_cash_out_approval_amount require supervisor approval.
   */
  static async addMovement(
    userId: string,
    companyId: string,
    sessionId: string,
    type: 'refund' | 'cash_in' | 'cash_out',
    amount: number,
    description: string,
    reference?: string
  ) {
    if (amount <= 0) {
      throw new Error('El monto de la transacción debe ser mayor a cero.');
    }

    return await db.transaction(async (tx) => {
      // 1. Fetch and validate session
      const [session] = await tx
        .select()
        .from(cashSessions)
        .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.companyId, companyId)))
        .limit(1);

      if (!session) {
        throw new Error('Sesión de caja no encontrada.');
      }

      if (session.status !== 'open') {
        throw new Error('La sesión de caja está cerrada. No se pueden registrar movimientos.');
      }

      if (session.userId !== userId) {
        throw new Error('No tiene permisos para registrar movimientos en la sesión de otro cajero.');
      }

      // 2. Load company settings for limit validation
      const settings = await CompanyRepository.getSettings(companyId);
      const maxCashOut = settings ? parseFloat(settings.maxCashOutApprovalAmount) : 5000.00;

      // 3. Check limit for cash outflows
      if (type === 'cash_out' && amount > maxCashOut) {
        // Cash outflow exceeds limit, insert as pending_approval in reference/description
        // In a real production system, this could block the transaction or log it as PENDING
        const movement = await CashRepository.addMovement(tx, {
          companyId,
          cashSessionId: sessionId,
          type: 'cash_out',
          amount,
          description: `[PENDING_APPROVAL] ${description} (Supera límite de $${maxCashOut.toFixed(2)})`,
          reference: 'pending_supervisor',
        });
        
        return {
          ...movement,
          requiresApproval: true,
          message: `La salida de efectivo por $${amount.toFixed(2)} supera el límite de $${maxCashOut.toFixed(2)} y ha quedado pendiente de aprobación.`,
        };
      }

      // 4. Register normal allowed movement
      return await CashRepository.addMovement(tx, {
        companyId,
        cashSessionId: sessionId,
        type,
        amount,
        description,
        reference,
      });
    });
  }

  /**
   * Closes a cash session.
   * Compares the expected balance (initial + inputs - outputs) with the actual counted balance.
   */
  static async closeSession(userId: string, companyId: string, sessionId: string, actualBalance: number, justification?: string) {
    const session = await db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.companyId, companyId)))
      .limit(1);

    if (session.length === 0) {
      throw new Error('Sesión de caja no encontrada.');
    }

    const activeSession = session[0];
    if (activeSession.status !== 'open') {
      throw new Error('La sesión de caja ya se encuentra cerrada.');
    }

    if (activeSession.userId !== userId) {
      throw new Error('Solo el cajero propietario de la sesión puede realizar el cierre.');
    }

    const expectedBalance = parseFloat(activeSession.expectedBalance);
    const difference = actualBalance - expectedBalance;

    if (difference !== 0 && !justification) {
      throw new Error(`Existe una diferencia de $${difference.toFixed(2)} entre el saldo esperado y el saldo contado. Debe proveer una justificación.`);
    }

    return await CashRepository.closeSession(sessionId, companyId, {
      actualBalance,
      expectedBalance,
      difference,
      justification,
    });
  }

  /**
   * Supervisor approval for a cashier session or special transaction.
   */
  static async approveSession(supervisorId: string, companyId: string, sessionId: string) {
    // In production, verify supervisor has 'administracion' or 'sistemas' permissions
    return await CashRepository.approveSession(sessionId, companyId, supervisorId);
  }
}
