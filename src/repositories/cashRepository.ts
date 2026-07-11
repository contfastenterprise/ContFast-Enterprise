import { db, cashRegisters, cashSessions, cashMovements, cashSessionSummary } from '@/db';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

export interface OpenSessionInput {
  companyId: string;
  cashRegisterId: string;
  userId: string;
  initialBalance: number;
}

export interface CloseSessionInput {
  actualBalance: number;
  expectedBalance: number;
  difference: number;
  justification?: string;
}

export class CashRepository {
  /**
   * Lists active registers in the company.
   */
  static async listRegisters(companyId: string) {
    return await db
      .select()
      .from(cashRegisters)
      .where(and(eq(cashRegisters.companyId, companyId), eq(cashRegisters.status, 'active'), isNull(cashRegisters.deletedAt)));
  }

  /**
   * Gets the active session for a specific cashier.
   */
  static async getActiveSession(userId: string, companyId: string) {
    const [session] = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.userId, userId),
          eq(cashSessions.companyId, companyId),
          eq(cashSessions.status, 'open')
        )
      )
      .limit(1);
    return session || null;
  }

  /**
   * Gets any active open session in the company (not user-specific).
   */
  static async getAnyActiveSession(companyId: string) {
    const [session] = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.companyId, companyId),
          eq(cashSessions.status, 'open')
        )
      )
      .limit(1);
    return session || null;
  }

  /**
   * Opens a new session. Enforces single active session check in transaction.
   */
  static async openSession(data: OpenSessionInput) {
    return await db.transaction(async (tx) => {
      // Double check active session
      const [existing] = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.userId, data.userId),
            eq(cashSessions.companyId, data.companyId),
            eq(cashSessions.status, 'open')
          )
        )
        .limit(1);

      if (existing) {
        throw new Error('Ya tiene una sesión de caja activa en esta empresa.');
      }

      const [session] = await tx
        .insert(cashSessions)
        .values({
          companyId: data.companyId,
          cashRegisterId: data.cashRegisterId,
          userId: data.userId,
          initialBalance: data.initialBalance.toString(),
          expectedBalance: data.initialBalance.toString(), // Initially matches initial balance
          status: 'open',
        })
        .returning();

      return session;
    });
  }

  /**
   * Closes a session, writing the summary table.
   */
  static async closeSession(sessionId: string, companyId: string, data: CloseSessionInput) {
    return await db.transaction(async (tx) => {
      // 1. Update session status
      const [session] = await tx
        .update(cashSessions)
        .set({
          status: 'closed',
          closedAt: new Date(),
          actualBalance: data.actualBalance.toString(),
          difference: data.difference.toString(),
          justification: data.justification,
          updatedAt: new Date(),
        })
        .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.companyId, companyId)))
        .returning();

      if (!session) {
        throw new Error('No se encontró la sesión de caja a cerrar.');
      }

      // 2. Fetch cash movements summary
      const movements = await tx
        .select()
        .from(cashMovements)
        .where(eq(cashMovements.cashSessionId, sessionId));

      let totalCashIn = 0;
      let totalCashOut = 0;

      movements.forEach((mv) => {
        const amt = parseFloat(mv.amount);
        if (mv.type === 'sale' || mv.type === 'cash_in') {
          totalCashIn += amt;
        } else if (mv.type === 'refund' || mv.type === 'cash_out') {
          totalCashOut += amt;
        }
      });

      // 3. Create cash session summary entry
      const [summary] = await tx
        .insert(cashSessionSummary)
        .values({
          companyId,
          cashSessionId: sessionId,
          initialBalance: session.initialBalance,
          totalCashIn: totalCashIn.toString(),
          totalCashOut: totalCashOut.toString(),
          expectedBalance: data.expectedBalance.toString(),
          actualBalance: data.actualBalance.toString(),
          difference: data.difference.toString(),
          justification: data.justification,
        })
        .returning();

      return { session, summary };
    });
  }

  /**
   * Adds a movement to the active session.
   */
  static async addMovement(tx: any, data: {
    companyId: string;
    cashSessionId: string;
    invoiceId?: string;
    type: 'sale' | 'refund' | 'cash_in' | 'cash_out';
    amount: number;
    description?: string;
    reference?: string;
    modo?: 'PRODUCCION' | 'PRUEBA';
  }) {
    // 1. Insert Cash Movement
    const [movement] = await tx
      .insert(cashMovements)
      .values({
        companyId: data.companyId,
        cashSessionId: data.cashSessionId,
        invoiceId: data.invoiceId,
        type: data.type,
        amount: data.amount.toString(),
        description: data.description,
        reference: data.reference,
        modo: data.modo || 'PRODUCCION',
      })
      .returning();

    // 2. Update Cash Session Expected Balance
    // In Drizzle, we can do direct update:
    const session = await tx
      .select({ expectedBalance: cashSessions.expectedBalance })
      .from(cashSessions)
      .where(eq(cashSessions.id, data.cashSessionId))
      .limit(1);

    const currentExpected = parseFloat(session[0]?.expectedBalance || '0');
    const amt = data.amount;
    let newExpected = currentExpected;

    if (data.type === 'sale' || data.type === 'cash_in') {
      newExpected += amt;
    } else if (data.type === 'refund' || data.type === 'cash_out') {
      newExpected -= amt;
    }

    await tx
      .update(cashSessions)
      .set({ expectedBalance: newExpected.toString(), updatedAt: new Date() })
      .where(eq(cashSessions.id, data.cashSessionId));

    return movement;
  }

  /**
   * Approves a cash session closure or supervisor pending action.
   */
  static async approveSession(sessionId: string, companyId: string, approvedBy: string) {
    const [session] = await db
      .update(cashSessions)
      .set({
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.companyId, companyId)))
      .returning();
    return session;
  }

  /**
   * Fetches movements for a specific session.
   */
  static async getMovements(sessionId: string, companyId: string) {
    return await db
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.cashSessionId, sessionId), eq(cashMovements.companyId, companyId)))
      .orderBy(desc(cashMovements.createdAt));
  }

  /**
   * Lists all sessions for a company (for history/reporting), ordered by most recent first.
   */
  static async listSessions(companyId: string) {
    const sessions = await db
      .select({
        id: cashSessions.id,
        status: cashSessions.status,
        initialBalance: cashSessions.initialBalance,
        expectedBalance: cashSessions.expectedBalance,
        actualBalance: cashSessions.actualBalance,
        difference: cashSessions.difference,
        justification: cashSessions.justification,
        createdAt: cashSessions.createdAt,
        closedAt: cashSessions.closedAt,
        userId: cashSessions.userId,
        cashRegisterId: cashSessions.cashRegisterId,
        registerName: cashRegisters.name,
      })
      .from(cashSessions)
      .leftJoin(cashRegisters, eq(cashSessions.cashRegisterId, cashRegisters.id))
      .where(eq(cashSessions.companyId, companyId))
      .orderBy(desc(cashSessions.createdAt))
      .limit(100);

    return sessions;
  }
}

