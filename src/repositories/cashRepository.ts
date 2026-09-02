import { db, cashRegisters, cashSessions, cashMovements, cashSessionSummary } from '@/db';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

export interface OpenSessionInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
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
  static async getActiveSession(userId: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const [session] = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.userId, userId),
          eq(cashSessions.companyId, companyId),
          eq(cashSessions.modo, modo),
          eq(cashSessions.status, 'open')
        )
      )
      .limit(1);
    return session || null;
  }

  /**
   * Gets any active open session in the company (not user-specific).
   */
  static async getAnyActiveSession(companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const [session] = await db
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.companyId, companyId),
          eq(cashSessions.modo, modo),
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
      // Double check active session.
      // El entorno forma parte de la busqueda a proposito: PRODUCCION y PRUEBA
      // son cajas independientes. Sin el filtro, tener la caja real abierta
      // impedia abrir una de practicas -- y al reves, cerrar la de practicas
      // dejaba creer que la real tambien estaba cerrada.
      const [existing] = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.userId, data.userId),
            eq(cashSessions.companyId, data.companyId),
            eq(cashSessions.modo, data.modo),
            eq(cashSessions.status, 'open')
          )
        )
        .limit(1);

      if (existing) {
        throw new Error(
          data.modo === 'PRUEBA'
            ? 'Ya tiene una sesión de caja de PRUEBAS activa en esta empresa.'
            : 'Ya tiene una sesión de caja activa en esta empresa.'
        );
      }

      const [session] = await tx
        .insert(cashSessions)
        .values({
          companyId: data.companyId,
          modo: data.modo,
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
  static async closeSession(
    sessionId: string,
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    data: CloseSessionInput
  ) {
    // `modo` acota la sesion que se cierra (abajo, en el UPDATE). No se propaga
    // a la suma de movimientos: ver el comentario del paso 2.
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
        .where(and(
          eq(cashSessions.id, sessionId),
          eq(cashSessions.companyId, companyId),
          eq(cashSessions.modo, modo)
        ))
        .returning();

      if (!session) {
        throw new Error('No se encontró la sesión de caja a cerrar.');
      }

      // 2. Fetch cash movements summary.
      // Aqui NO se filtra por modo, y es deliberado. La sesion ya se localizo
      // arriba por id + empresa + entorno: su id es clave primaria, asi que
      // estos movimientos son suyos y de nadie mas. Anadir el filtro tendria
      // un efecto malo: un movimiento heredado con el sello equivocado -- los
      // que dejo el viejo `modo || 'PRODUCCION'` dentro de sesiones de
      // practicas -- desapareceria del arqueo mientras sigue contando en el
      // saldo esperado, y el cuadre se volveria imposible de explicar.
      const movements = await tx
        .select()
        .from(cashMovements)
        .where(and(
          eq(cashMovements.cashSessionId, sessionId),
          eq(cashMovements.companyId, companyId)
        ));

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
          // El resumen pertenece al mismo entorno que la sesion que resume.
          modo: session.modo,
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
  }) {
    // 1. Localizar la sesion ANTES de insertar nada.
    // cashSessionId puede venir del cuerpo de la peticion (al facturar con
    // paymentType distinto de 'cash' no se sustituye por la sesion propia), asi
    // que sin filtrar por empresa se alteraba el saldo esperado de la caja de
    // otra empresa.
    const alcanceSesion = and(
      eq(cashSessions.id, data.cashSessionId),
      eq(cashSessions.companyId, data.companyId)
    );

    const session = await tx
      .select({ expectedBalance: cashSessions.expectedBalance, modo: cashSessions.modo })
      .from(cashSessions)
      .where(alcanceSesion)
      .limit(1);

    if (!session[0]) throw new Error('Sesión de caja no encontrada para esta empresa.');

    // 2. El entorno del movimiento NO es un parametro: se toma de la sesion a
    // la que se apunta. Antes era `data.modo || 'PRODUCCION'`, y quien no lo
    // pasaba -- arRepository al cobrar en efectivo -- sellaba como real un
    // cobro de practicas. Un movimiento no puede estar en un entorno distinto
    // al de su propia caja, y asi ya no hay forma de que ocurra.
    const modo = session[0].modo as 'PRODUCCION' | 'PRUEBA';

    // 3. Insert Cash Movement
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
        modo,
      })
      .returning();

    // 4. Update Cash Session Expected Balance
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
      .where(alcanceSesion);

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
  /**
   * Por la misma razon que el arqueo: el entorno lo fija quien localiza la
   * sesion (la ruta, con auth.modo), no esta consulta. La sesion es la unidad
   * de alcance; su id ya la determina por completo.
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
  static async listSessions(companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
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
      // El historial de cierres de caja es el que se revisa cuando falta
      // dinero. Mezclar las sesiones de practicas con las reales lo inutiliza.
      .where(and(eq(cashSessions.companyId, companyId), eq(cashSessions.modo, modo)))
      .orderBy(desc(cashSessions.createdAt))
      .limit(100);

    return sessions;
  }
}

