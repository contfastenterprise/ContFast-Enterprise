import { db, bankAccounts, bankAccountBalances, bankTransactions, chartOfAccounts } from '@/db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { AccountRepository } from '@/repositories/accountRepository';

export interface CreateBankAccountInput {
  companyId: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  type: string;
  initialBalance: number;
  color?: string;
  /** Cuenta del plan contable contra la que se asientan sus movimientos. */
  chartAccountId?: string;
}

export interface RegisterBankTransactionInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  bankAccountId: string;
  date: string;
  type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'fee';
  amount: number;
  reference?: string;
  description?: string;
  contraAccountId?: string; // The chart of account ID to offset the transaction
  /** Usuario que registra el movimiento. Auditoria JRN-16. */
  createdBy?: string;
}

export class BankRepository {
  // Get all bank accounts with balances
  static async getBankAccounts(companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    // El saldo sale de bank_account_balances, no del campo del catalogo: es el
    // de ESTE entorno. Se usa leftJoin y no innerJoin a proposito -- una cuenta
    // creada antes de la migracion 0036, o por un camino que no siembre sus
    // saldos, tiene que seguir apareciendo en la lista aunque salga en cero,
    // no desaparecer de la pantalla del usuario.
    const filas = await db.select({
      cuenta: bankAccounts,
      saldoEntorno: bankAccountBalances.balance,
    })
      .from(bankAccounts)
      .leftJoin(
        bankAccountBalances,
        and(
          eq(bankAccountBalances.bankAccountId, bankAccounts.id),
          eq(bankAccountBalances.modo, modo)
        )
      )
      .where(and(
        eq(bankAccounts.companyId, companyId),
        sql`${bankAccounts.deletedAt} IS NULL`
      ))
      .orderBy(bankAccounts.bankName);

    return filas.map((f) => ({ ...f.cuenta, balance: f.saldoEntorno ?? f.cuenta.balance }));
  }

  /**
   * El saldo de una cuenta en un entorno. Crea la fila si no existe todavia
   * (cuenta creada antes de la 0036), copiando el saldo del catalogo.
   */
  static async saldo(
    bankAccountId: string,
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    tx: any = db
  ): Promise<number> {
    const [fila] = await tx.select({ balance: bankAccountBalances.balance })
      .from(bankAccountBalances)
      .where(and(
        eq(bankAccountBalances.bankAccountId, bankAccountId),
        eq(bankAccountBalances.companyId, companyId),
        eq(bankAccountBalances.modo, modo)
      ));
    if (fila) return parseFloat(fila.balance);

    const [cuenta] = await tx.select({ balance: bankAccounts.balance })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)));
    return cuenta ? parseFloat(cuenta.balance as any) : 0;
  }

  /**
   * Mueve el saldo de una cuenta en UN entorno y devuelve el nuevo.
   *
   * El bloqueo importa: dos cobros simultaneos sobre la misma cuenta leerian
   * el mismo saldo de partida y el segundo pisaria al primero. Se hace en la
   * base -- `balance = balance + delta` con la fila tomada -- en vez de leer,
   * sumar en TypeScript y escribir.
   */
  static async ajustarSaldo(
    bankAccountId: string,
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    delta: number,
    tx: any = db
  ): Promise<number> {
    // Asegurar la fila del entorno, partiendo del saldo del catalogo si es la
    // primera vez que se toca esta cuenta en este entorno.
    const [cuenta] = await tx.select({ balance: bankAccounts.balance })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)));
    if (!cuenta) throw new Error('Cuenta bancaria no encontrada');

    await tx.execute(sql`
      INSERT INTO bank_account_balances (company_id, bank_account_id, modo, balance)
      VALUES (${companyId}::uuid, ${bankAccountId}::uuid, ${modo}::environment_mode, ${cuenta.balance})
      ON CONFLICT (bank_account_id, modo) DO NOTHING`);

    const filas = (await tx.execute(sql`
      UPDATE bank_account_balances
         SET balance = balance + ${delta.toString()}::numeric, updated_at = now()
       WHERE bank_account_id = ${bankAccountId}::uuid
         AND company_id = ${companyId}::uuid
         AND modo = ${modo}::environment_mode
      RETURNING balance`)) as unknown as { balance: string }[];

    const nuevo = parseFloat(filas[0].balance);

    // Espejo de compatibilidad: el campo viejo solo refleja PRODUCCION, para
    // que cualquier lectura sin migrar muestre la cifra real y nunca una de
    // practicas. Ver la cabecera de la migracion 0036.
    if (modo === 'PRODUCCION') {
      await tx.update(bankAccounts)
        .set({ balance: nuevo.toString(), updatedAt: new Date() })
        .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)));
    }

    return nuevo;
  }

  // Create a new bank account
  static async createBankAccount(data: CreateBankAccountInput) {
    return await db.transaction(async (tx) => {
      const [account] = await tx.insert(bankAccounts).values({
        id: uuidv4(),
        companyId: data.companyId,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        currency: data.currency,
        type: data.type,
        color: data.color || '#003366',
        chartAccountId: data.chartAccountId || null,
        balance: data.initialBalance.toString()
      }).returning();

      return account;
    });
  }

  // Get transactions for a specific account (or all accounts if 'all' is passed)
  static async getBankTransactions(
    companyId: string,
    bankAccountId: string,
    modo: 'PRODUCCION' | 'PRUEBA'
  ) {
    // El libro de banco es lo que se cuadra contra el estado de cuenta que
    // manda el banco. Sin el filtro, los movimientos de practicas salian
    // mezclados con los reales y la conciliacion no podia cuadrar nunca.
    if (bankAccountId === 'all') {
      return await db.select()
        .from(bankTransactions)
        .where(and(
          eq(bankTransactions.companyId, companyId),
          eq(bankTransactions.modo, modo)
        ))
        .orderBy(desc(bankTransactions.date), desc(bankTransactions.createdAt));
    }

    return await db.select()
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.modo, modo),
        eq(bankTransactions.bankAccountId, bankAccountId)
      ))
      .orderBy(desc(bankTransactions.date), desc(bankTransactions.createdAt));
  }

  // Register a new transaction (and auto journal entry)
  static async registerTransaction(data: RegisterBankTransactionInput) {
    return await db.transaction(async (tx) => {
      // 1. Get the account to verify it exists and get its current balance
      // El bankAccountId llega del cuerpo de la peticion. Sin el filtro por
      // empresa se podia mover el saldo de la cuenta de otra empresa, y encima
      // la transaccion y el asiento quedaban con el companyId propio, asi que la
      // victima no veia el movimiento por ninguna parte.
      const [account] = await tx
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, data.bankAccountId), eq(bankAccounts.companyId, data.companyId)));
      if (!account) throw new Error('Cuenta bancaria no encontrada');

      const isIncoming = ['deposit', 'transfer_in'].includes(data.type);
      const isOutgoing = ['withdrawal', 'transfer_out', 'fee'].includes(data.type);

      // El signo del movimiento. El saldo se ajusta mas abajo, sobre la fila
      // del entorno, no sobre el campo del catalogo.
      const delta = isIncoming ? data.amount : -data.amount;

      // 2. Create the transaction record
      const txId = uuidv4();
      const [transaction] = await tx.insert(bankTransactions).values({
        id: txId,
        companyId: data.companyId,
        modo: data.modo,
        bankAccountId: data.bankAccountId,
        date: data.date,
        type: data.type,
        amount: data.amount.toString(),
        reference: data.reference,
        description: data.description,
        // Auditoria ARP-25 (segunda parte): nacia 'reconciled'. Conciliar es
        // cotejar un movimiento contra el estado de cuenta que manda el banco, y
        // eso no lo puede hacer el propio codigo que lo acaba de crear. Con el
        // estado cableado, la conciliacion bancaria no podia detectar NUNCA un
        // movimiento que el banco no tuviera.
        //
        // Verificado en produccion: los dos "ajustes" del 29/08/2026, de
        // 352.460,96 y 1.015.727,93, figuran conciliados sin que nadie los
        // hubiera cotejado con nada.
        status: 'pending'
      }).returning();

      // 3. Update account balance -- SOLO el de este entorno.
      // Antes esto era `UPDATE bank_accounts SET balance = ... WHERE id = ?`,
      // sin empresa y sin entorno: un retiro registrado en PRUEBA bajaba el
      // saldo REAL de la cuenta.
      const newBalance = await BankRepository.ajustarSaldo(
        data.bankAccountId, data.companyId, data.modo, delta, tx
      );
      void newBalance;

      // 4. Asiento contable del movimiento.
      //
      // Auditoria JRN-04, JRN-05 y JRN-12. Este bloque tenia cuatro defectos, y
      // los cuatro se materializaron en produccion el 29/08/2026:
      //
      //   a) La cuenta contable del banco se ADIVINABA por el nombre:
      //      `assetAccounts.find(a => a.name.toLowerCase().includes('banco'))`.
      //      "Efectivo en Caja y Bancos" contiene "banco" y es una cuenta de
      //      AGRUPACION, asi que ganaba el sorteo. Con varias cuentas
      //      bancarias, todas se contabilizaban contra la misma.
      //   b) Si no encontraba ninguna, el `if` se saltaba el asiento EN
      //      SILENCIO: el saldo del banco ya se habia movido en el paso 3 y el
      //      mayor no se enteraba.
      //   c) Nada impedia que la contrapartida fuera la MISMA cuenta que la del
      //      banco. Un ajuste de 1.015.727,93 quedo con el debe y el haber
      //      contra 1.1.01: cuadra y no significa nada.
      //   d) El asiento se insertaba a mano, saltandose la validacion de cuadre
      //      y la de periodo abierto, con la referencia truncada a 8 caracteres.
      //
      // Ahora: la cuenta sale del enlace explicito `bank_accounts.chart_account_id`
      // (migracion 0039), se valida la contrapartida, y el asiento pasa por el
      // motor central.
      if (data.contraAccountId) {
        if (!account.chartAccountId) {
          throw new Error(
            `La cuenta bancaria "${account.bankName} ${account.accountNumber}" no tiene cuenta contable asignada, ` +
            `así que el movimiento no se puede contabilizar. Configúrela antes de registrar movimientos.`
          );
        }

        if (account.chartAccountId === data.contraAccountId) {
          throw new Error(
            'La cuenta de contrapartida no puede ser la misma cuenta contable del banco: ' +
            'el asiento no tendria ningun efecto.'
          );
        }

        // Las dos cuentas tienen que ser de la empresa, estar activas y ser
        // transaccionales. Postear contra una cuenta de agrupacion duplica
        // saldos entre padre e hijo y deja el arbol del catalogo sin sentido.
        const cuentas = await tx
          .select({
            id: chartOfAccounts.id,
            code: chartOfAccounts.code,
            name: chartOfAccounts.name,
            isTransactional: chartOfAccounts.isTransactional,
            status: chartOfAccounts.status,
            deletedAt: chartOfAccounts.deletedAt,
          })
          .from(chartOfAccounts)
          .where(and(
            inArray(chartOfAccounts.id, [account.chartAccountId, data.contraAccountId]),
            eq(chartOfAccounts.companyId, data.companyId)
          ));

        for (const id of [account.chartAccountId, data.contraAccountId]) {
          const cuenta = cuentas.find(c => c.id === id);
          if (!cuenta) {
            throw new Error('Una de las cuentas contables indicadas no existe o no pertenece a la empresa.');
          }
          if (cuenta.deletedAt || cuenta.status !== 'active') {
            throw new Error(`La cuenta ${cuenta.code} ${cuenta.name} no está activa.`);
          }
          if (!cuenta.isTransactional) {
            throw new Error(
              `La cuenta ${cuenta.code} ${cuenta.name} es una cuenta de agrupación y no admite movimientos. ` +
              `Elija una cuenta transaccional.`
            );
          }
        }

        await AccountRepository.createJournalEntry(tx, {
          companyId: data.companyId,
          modo: data.modo,
          // Referencia completa: antes se truncaba a 8 caracteres y el
          // movimiento no se podia rastrear de forma fiable (JRN-22).
          reference: txId,
          date: data.date,
          description: `Movimiento Bancario: ${data.description || data.type}`,
          // Auditoria JRN-16: quien registra el asiento.
          createdBy: data.createdBy || null,
          lines: [
            {
              accountId: account.chartAccountId,
              debit: isIncoming ? data.amount : 0,
              credit: isOutgoing ? data.amount : 0,
            },
            {
              accountId: data.contraAccountId,
              debit: isOutgoing ? data.amount : 0,
              credit: isIncoming ? data.amount : 0,
            },
          ],
        });
      }

      return transaction;
    });
  }
}
