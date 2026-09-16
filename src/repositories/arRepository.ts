import { db, accountsReceivable, customers, invoices, customerReceipts, customerReceiptApplied, cashMovements, cashSessions, auditLogs, bankTransactions, type DbTransaction } from '@/db';
import { AccountRepository } from '@/repositories/accountRepository';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CashRepository } from '@/repositories/cashRepository';
import { BankRepository } from '@/repositories/bankRepository';
import { FinancialMovementService } from '@/services/financialMovementService';
import { resolverCuentaPorMapeo, resolverCuentaDeBanco } from '@/services/accounting/resolverCuentas';
import { entraPorBanco, motivoParaNoRegistrarCobro } from '@/services/cartera/cuentaDelCobro';

export interface RegisterReceiptInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  customerId: string;
  userId: string;
  date: string;
  paymentMethod: string;
  /** Lote 151: obligatoria si el metodo no es efectivo (ver cartera/cuentaDelCobro.ts). */
  bankAccountId?: string | null;
  amount: number;
  reference?: string;
  notes?: string;
  invoicesApplied: { arId: string; amountApplied: number }[];
}

export class ArRepository {
  // Get pending accounts receivable grouped by customer
  /**
   * Los `arId` que devuelve esta lista son los que luego se mandan a
   * `registerReceipt` para cobrar. Sin acotar el entorno, la lista mezclaba
   * las cuentas por cobrar de practicas con las reales.
   */
  static async getPendingAR(companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    // We want to fetch all pending AR, join with customers and invoices
    const arList = await db.select({
      id: accountsReceivable.id,
      customerId: accountsReceivable.customerId,
      customerName: customers.name,
      invoiceId: accountsReceivable.invoiceId,
      invoiceNumber: invoices.ncf,
      codigoFactura: invoices.codigoFactura,
      invoiceDate: invoices.createdAt,
      amount: accountsReceivable.amount,
      balance: accountsReceivable.balance,
      dueDate: accountsReceivable.dueDate,
      status: accountsReceivable.status
    })
    .from(accountsReceivable)
    .innerJoin(customers, eq(accountsReceivable.customerId, customers.id))
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(and(
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.modo, modo),
      sql`${accountsReceivable.balance} > 0`,
      sql`${accountsReceivable.deletedAt} IS NULL`
    ))
    .orderBy(accountsReceivable.dueDate);

    // Group by customer
    const grouped: Record<string, any> = {};
    for (const ar of arList) {
      if (!grouped[ar.customerId]) {
        grouped[ar.customerId] = {
          customerId: ar.customerId,
          customerName: ar.customerName,
          totalBalance: 0,
          invoices: []
        };
      }
      // `parseFloat(String(x))` y no `Number(x)` en este fichero (lote 124): era
      // `parseFloat(x as any)`, y con null daba NaN; `Number(null)` da 0. Se
      // quita el molde sin cambiar ni un resultado.
      grouped[ar.customerId].totalBalance += parseFloat(String(ar.balance));
      grouped[ar.customerId].invoices.push({
        arId: ar.id,
        invoiceId: ar.invoiceId,
        invoiceNumber: ar.invoiceNumber || 'Sin NCF',
        codigoFactura: ar.codigoFactura || '',
        invoiceDate: ar.invoiceDate,
        amount: parseFloat(String(ar.amount)),
        balance: parseFloat(String(ar.balance)),
        dueDate: ar.dueDate,
        status: ar.status
      });
    }

    return Object.values(grouped);
  }

  // Register a payment receipt
  static async registerReceipt(data: RegisterReceiptInput) {
    return await db.transaction(async (tx) => {
      const receiptId = uuidv4();

      // Auditoria ISO-06: `customerId` llega del cuerpo de la peticion y no se
      // comprobaba. El `arId` de las aplicaciones si se corrigio en su momento
      // (ver mas abajo), pero la cabecera del recibo no: se podia registrar un
      // cobro a nombre de un cliente de OTRA empresa. No saldaba deuda ajena,
      // pero dejaba el recibo y su movimiento financiero colgando de un cliente
      // irresoluble, y el arqueo de caja cuadraba en importe sin ser trazable.
      const [clientePropio] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.id, data.customerId),
          eq(customers.companyId, data.companyId)
        ))
        .limit(1);
      if (!clientePropio) {
        throw new Error('El cliente indicado no pertenece a la empresa.');
      }

      // Lote 151: un cobro por banco lleva su cuenta bancaria, uno en efectivo
      // no. Se comprueba aqui ademas de en la ruta porque este es el sitio que
      // escribe; y la cuenta (empresa, activa, con cuenta contable) se resuelve
      // ANTES de insertar nada, para que un banco mal configurado pare el cobro
      // entero en vez de dejar el recibo sin asiento.
      const motivoCuenta = motivoParaNoRegistrarCobro(data.paymentMethod, data.bankAccountId);
      if (motivoCuenta) throw new Error(motivoCuenta);
      const cuentaDelBanco = entraPorBanco(data.paymentMethod)
        ? await resolverCuentaDeBanco(tx, data.companyId, data.bankAccountId as string, 'Recibo de cobro')
        : null;

      // 1. Create Receipt
      const [receipt] = await tx.insert(customerReceipts).values({
        id: receiptId,
        companyId: data.companyId,
        modo: data.modo,
        customerId: data.customerId,
        date: data.date,
        paymentMethod: data.paymentMethod,
        bankAccountId: cuentaDelBanco ? data.bankAccountId : null,
        amount: data.amount.toString(),
        reference: data.reference || null,
        notes: data.notes || null,
        // Auditoria P1-13 (2026-09-03), migracion 0049. Antes no habia forma
        // de saber, consultando la fila, quien registro el cobro.
        createdBy: data.userId,
      }).returning();

      // Auditoria P1-13: el rastro de quien registro el cobro. (Cuando se
      // escribio, el asiento del cobro se insertaba a mano y no dejaba autor;
      // desde el lote 152 va por `AccountRepository.createJournalEntry`, mas
      // abajo, con `createdBy`. El audit_log sigue: guarda metodo y referencia.)
      await tx.insert(auditLogs).values({
        modo: data.modo,
        companyId: data.companyId,
        userId: data.userId,
        action: 'customer_receipt_created',
        entityType: 'customer_receipts',
        entityId: receipt.id,
        newValues: {
          customerId: data.customerId,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          bankAccountId: cuentaDelBanco ? data.bankAccountId : null,
          reference: data.reference || null,
        },
      });

      // Financial movements registration (Clientes - Recibo de Cobro)
      await FinancialMovementService.registerMovement(tx, {
        companyId: data.companyId,
        modo: data.modo,
        entityType: 'customer',
        customerId: data.customerId,
        date: data.date,
        movementType: 'receipt',
        documentId: receipt.id,
        documentNumber: data.reference || `REC-${receipt.id.slice(0, 8)}`,
        originModule: data.paymentMethod === 'cash' ? 'cash' : 'bank',
        debit: 0,
        credit: data.amount,
        userId: data.userId,
        notes: data.notes || `Cobro registrado. Método de pago: ${data.paymentMethod}`,
      });

      // 2. Apply payments to AR and update balance
      for (const applied of data.invoicesApplied) {
        if (applied.amountApplied <= 0) continue;

        // Auditoria ARP-04, ARP-05 y ARP-07. Aqui habia tres fallos encadenados:
        //
        //   a) la fila de aplicacion se INSERTABA antes de validar el `arId`.
        //      Si la cuenta por cobrar no superaba el filtro, la fila quedaba
        //      igualmente guardada, sin efecto sobre ningun saldo y apuntando a
        //      un documento de otra empresa. `customer_receipt_applied` no
        //      lleva company_id, asi que nada en la base lo impedia.
        //   b) se comprobaba la empresa pero NO el cliente: un cobro del
        //      cliente A podia saldar la factura del cliente B. El auxiliar de
        //      B bajaba, el estado de cuenta de A tambien: doble descargo.
        //   c) el saldo se leia sin bloqueo y se escribia calculado en
        //      JavaScript. Dos cajeros cobrando la misma factura a la vez leian
        //      el mismo saldo y la ultima escritura ganaba (lost update):
        //      entraban dos recibos y el auxiliar bajaba una sola vez.
        //
        // Ahora: primero se bloquea y valida (empresa, entorno y cliente),
        // despues se comprueba el tope, y solo entonces se inserta.
        const [ar] = await tx
          .select()
          .from(accountsReceivable)
          .where(and(
            eq(accountsReceivable.id, applied.arId),
            eq(accountsReceivable.companyId, data.companyId),
            eq(accountsReceivable.modo, data.modo),
            eq(accountsReceivable.customerId, data.customerId),
            isNull(accountsReceivable.deletedAt)
          ))
          .limit(1)
          .for('update');

        if (!ar) {
          throw new Error('La cuenta por cobrar indicada no existe, no pertenece a la empresa o es de otro cliente.');
        }

        // Auditoria ARP-05: no se validaba el tope contra el saldo. Un recibo de
        // 50,000 aplicado a una factura con 20,000 pendientes dejaba el saldo en
        // -30,000 con estado 'paid', y como los pendientes se listan con
        // balance > 0, el sobrepago se volvia invisible.
        const saldoActual = parseFloat(String(ar.balance));
        if (applied.amountApplied > saldoActual + 0.01) {
          throw new Error(
            `El importe aplicado (RD$ ${applied.amountApplied.toFixed(2)}) excede el saldo pendiente del documento (RD$ ${saldoActual.toFixed(2)}).`
          );
        }

        await tx.insert(customerReceiptApplied).values({
          id: uuidv4(),
          receiptId,
          arId: applied.arId,
          amountApplied: applied.amountApplied.toString(),
        });

        const newBalance = saldoActual - applied.amountApplied;
        await tx.update(accountsReceivable)
          .set({
            balance: newBalance.toString(),
            status: newBalance <= 0.01 ? 'paid' : 'pending'
          })
          .where(and(
            eq(accountsReceivable.id, applied.arId),
            eq(accountsReceivable.companyId, data.companyId),
            eq(accountsReceivable.modo, data.modo)
          ));
      }

      // 3. Rule: If payment is 'cash', it goes to Petty Cash (Caja Chica)
      if (data.paymentMethod === 'cash') {
        // Find active cash session for this user/company.
        // Sin el entorno, un cobro en efectivo hecho en PRUEBA encontraba la
        // sesion de caja REAL del cajero y le metia dentro un `cash_in` que
        // subia su saldo esperado. Al cerrar, el cajero contaba menos efectivo
        // del que el sistema decia y el descuadre no aparecia por ningun lado.
        const [session] = await tx.select()
          .from(cashSessions)
          .where(and(
            eq(cashSessions.companyId, data.companyId),
            eq(cashSessions.userId, data.userId),
            eq(cashSessions.modo, data.modo),
            eq(cashSessions.status, 'open')
          ))
          .limit(1);

        if (!session) {
          throw new Error('No hay una sesión de caja abierta para registrar el efectivo. Abra caja primero.');
        }

        await CashRepository.addMovement(tx, {
          companyId: data.companyId,
          cashSessionId: session.id,
          type: 'cash_in',
          amount: data.amount,
          description: `Cobro a factura(s). Ref: ${data.reference || receiptId.slice(0,8)}`,
          reference: receiptId
        });
      }

      // 3-bis. Lote 151: si entra por banco, el deposito va al libro de banco.
      //
      // Mismo camino que el cobro de un cheque en garantia (apService): saldo
      // del ENTORNO con `ajustarSaldo` (con la fila tomada) y el movimiento en
      // `pending`, porque conciliar es cotejarlo con el estado de cuenta y eso
      // no lo puede hacer el codigo que lo crea (ARP-25). Sin esto, el deposito
      // de un cliente solo aparecia en Bancos si alguien metia un "Ajuste".
      // El asiento lo hace el paso 4, no `registerTransaction`: ese crea el suyo
      // y el cobro quedaria contabilizado dos veces.
      if (cuentaDelBanco && data.bankAccountId) {
        await BankRepository.ajustarSaldo(data.bankAccountId, data.companyId, data.modo, data.amount, tx);
        await tx.insert(bankTransactions).values({
          id: uuidv4(),
          companyId: data.companyId,
          modo: data.modo,
          bankAccountId: data.bankAccountId,
          date: data.date,
          type: 'deposit',
          amount: data.amount.toString(),
          reference: (data.reference || `REC-${receiptId.slice(0, 8)}`).slice(0, 100),
          description: `Cobro a cliente, recibo REC-${receiptId.slice(0, 8)}`,
          status: 'pending',
        });
      }

      // 4. Create Journal Entry (Asiento Contable)
      // Este era el ultimo asiento que resolvia sus cuentas con una copia local
      // de `getOrCreateAccount`, y por eso caia en las DOS trampas que
      // `resolverCuentas.ts` existe para cerrar (JRN-01, JRN-02, JRN-12):
      //
      //   · 1.1.01 y 1.1.02 son cuentas de AGRUPACION en el plan que el
      //     sistema siembra. `createJournalEntry` rechaza moverlas -- "no
      //     admite movimientos directos, use una de sus subcuentas" -- pero
      //     este camino inserta el asiento a mano y se saltaba esa regla.
      //     Medido el 2026-09-15 en la empresa que opera: 108 renglones sobre
      //     1.1.01 y 66 sobre 1.1.02, mientras sus subcuentas transaccionales
      //     llevan movimiento por su cuenta. El balance no miente en los
      //     totales (suma cada cuenta por separado), pero en el arbol el padre
      //     enseña solo lo suyo y se lee como si fuera el total del grupo.
      //   · `getOrCreateAccount` CREA la cuenta si no la encuentra, con
      //     `nature` y `level` por defecto. Una cuenta nacida asi invierte
      //     signos en la balanza por jerarquia.
      //
      // Son las mismas dos claves y los mismos dos defectos que ya usa la
      // facturacion (`invoiceDbBooker`), asi que un cobro y la factura que
      // salda tocan por fin la misma cuenta. La empresa que quiera otra las
      // cambia en `accounting_mappings`, sin tocar codigo.
      //
      // Lote 151: cerrado lo que aqui quedaba pendiente. Un cobro por banco
      // debita la cuenta contable de SU banco (`bank_accounts.chart_account_id`,
      // resuelta arriba); solo el efectivo debita la caja.
      const accCaja = cuentaDelBanco
        ?? await resolverCuentaPorMapeo(tx, data.companyId, 'cash', '1.1.01.01', 'Recibo de Cobro - Efectivo');
      const accCxC = await resolverCuentaPorMapeo(tx, data.companyId, 'accounts_receivable', '1.1.02.01', 'Recibo de Cobro - Cuentas por Cobrar');

      // Lote 152: por el motor central, `createJournalEntry`, como el resto de
      // asientos. Este era el unico que se insertaba a mano, y con eso se
      // saltaba el cuadre, la validacion por linea y la de cuentas, y sobre
      // todo el PERIODO ABIERTO: medido el 2026-09-16, julio de Latin Doors
      // (PRODUCCION) esta cerrado desde el 01/08 y un cobro fechado en julio
      // se habria asentado dentro. Ninguno lo hizo todavia (los 8 de julio son
      // anteriores al cierre). Si falla, la transaccion entera se deshace:
      // ni recibo, ni saldos de CxC, ni caja, ni deposito.
      //
      // La referencia es el id COMPLETO del recibo, como en los demas asientos
      // (JRN-22); los 22 anteriores guardan solo los 8 primeros caracteres.
      await AccountRepository.createJournalEntry(tx, {
        companyId: data.companyId,
        modo: data.modo,
        date: data.date,
        reference: receiptId,
        description: `Recibo de Cobro - Cliente ID: ${data.customerId.slice(0,8)}`,
        // Auditoria JRN-16. La columna se añadio despues del asiento duplicado
        // de 545.724,30 de julio, y este camino era el UNICO que seguia sin
        // rellenarla: medido el 2026-09-15, desde que la columna se escribe,
        // 68 asientos llevan autor y los 7 que no son todos "Recibo de Cobro"
        // -- el ultimo, de hoy. El `userId` estaba aqui al lado: ya se usa
        // para el recibo, para el audit_log y para buscar la sesion de caja.
        createdBy: data.userId,
        lines: [
          { accountId: accCaja.id, debit: data.amount, credit: 0 },
          { accountId: accCxC.id, debit: 0, credit: data.amount },
        ],
      });

      return receipt;
    });
  }

  // Get historical receipts for a company with optional filters
  static async getReceiptsList(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    filters?: { startDate?: string; endDate?: string; search?: string }
  ) {
    const conditions = [
      eq(customerReceipts.companyId, companyId),
      // Auditoria ISO-09 / ARP-20: sin este filtro el historial de cobros
      // mezclaba PRUEBA y PRODUCCION. El registro si graba el `modo`, pero la
      // lectura lo ignoraba, de modo que los recibos de practicas aparecian
      // entre los reales y sumaban en los totales que se muestran e imprimen.
      eq(customerReceipts.modo, modo),
      sql`${customerReceipts.deletedAt} IS NULL`
    ];

    if (filters?.startDate) {
      conditions.push(sql`${customerReceipts.date} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${customerReceipts.date} <= ${filters.endDate}`);
    }
    if (filters?.search) {
      const searchPattern = `%${filters.search.toLowerCase()}%`;
      conditions.push(sql`(lower(${customers.name}) like ${searchPattern} or lower(${customerReceipts.reference}) like ${searchPattern} or lower(${customerReceipts.id}::text) like ${searchPattern})`);
    }

    return await db.select({
      id: customerReceipts.id,
      customerId: customerReceipts.customerId,
      customerName: customers.name,
      date: customerReceipts.date,
      paymentMethod: customerReceipts.paymentMethod,
      amount: customerReceipts.amount,
      reference: customerReceipts.reference,
      notes: customerReceipts.notes,
      createdAt: customerReceipts.createdAt
    })
    .from(customerReceipts)
    .innerJoin(customers, eq(customerReceipts.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(customerReceipts.createdAt));
  }

  // Get detailed information of a receipt and its applied invoices
  static async getReceiptDetails(companyId: string, modo: 'PRODUCCION' | 'PRUEBA', receiptId: string) {
    const [receipt] = await db.select({
      id: customerReceipts.id,
      companyId: customerReceipts.companyId,
      customerId: customerReceipts.customerId,
      customerName: customers.name,
      customerRnc: customers.rncCedula,
      date: customerReceipts.date,
      paymentMethod: customerReceipts.paymentMethod,
      amount: customerReceipts.amount,
      reference: customerReceipts.reference,
      notes: customerReceipts.notes,
      createdAt: customerReceipts.createdAt
    })
    .from(customerReceipts)
    .innerJoin(customers, eq(customerReceipts.customerId, customers.id))
    .where(and(
      eq(customerReceipts.id, receiptId),
      eq(customerReceipts.companyId, companyId),
      eq(customerReceipts.modo, modo),
      sql`${customerReceipts.deletedAt} IS NULL`
    ))
    .limit(1);

    if (!receipt) return null;

    const appliedInvoices = await db.select({
      appliedId: customerReceiptApplied.id,
      amountApplied: customerReceiptApplied.amountApplied,
      invoiceNumber: invoices.ncf,
      codigoFactura: invoices.codigoFactura,
      invoiceDate: invoices.createdAt,
      totalAmount: invoices.total,
      remainingBalance: accountsReceivable.balance
    })
    .from(customerReceiptApplied)
    .innerJoin(accountsReceivable, eq(customerReceiptApplied.arId, accountsReceivable.id))
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(eq(customerReceiptApplied.receiptId, receiptId));

    // Get customer's overall remaining pending balance
    const [balanceResult] = await db.select({
      totalPending: sql<string>`coalesce(sum(${accountsReceivable.balance}), 0)`
    })
    .from(accountsReceivable)
    .where(and(
      // Esta consulta no tenia NI empresa NI entorno: el "saldo pendiente
      // total del cliente" que se imprime en el recibo sumaba las filas de
      // los dos entornos y las de cualquier empresa que compartiera cliente.
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.modo, modo),
      eq(accountsReceivable.customerId, receipt.customerId),
      sql`${accountsReceivable.deletedAt} IS NULL`
    ));

    const customerTotalBalance = parseFloat(balanceResult?.totalPending || '0');

    return {
      ...receipt,
      appliedInvoices: appliedInvoices.map(ai => ({
        ...ai,
        amountApplied: parseFloat(String(ai.amountApplied)),
        totalAmount: parseFloat(String(ai.totalAmount)),
        remainingBalance: parseFloat(String(ai.remainingBalance)),
        codigoFactura: ai.codigoFactura || undefined
      })),
      amount: parseFloat(String(receipt.amount)),
      customerTotalBalance
    };
  }

  // Get detailed receipts breakdown for a customer (all payments applied to invoices)
  static async getCustomerReceiptsBreakdown(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    customerId: string
  ) {
    const applications = await db.select({
      receiptId: customerReceipts.id,
      receiptDate: customerReceipts.date,
      receiptAmount: customerReceipts.amount,
      paymentMethod: customerReceipts.paymentMethod,
      reference: customerReceipts.reference,
      appliedId: customerReceiptApplied.id,
      amountApplied: customerReceiptApplied.amountApplied,
      createdAt: customerReceiptApplied.createdAt,
      invoiceId: accountsReceivable.invoiceId,
      invoiceNumber: invoices.ncf,
      codigoFactura: invoices.codigoFactura,
      invoiceDate: invoices.createdAt,
      invoiceTotal: invoices.total,
      currentBalance: accountsReceivable.balance
    })
    .from(customerReceiptApplied)
    .innerJoin(customerReceipts, eq(customerReceiptApplied.receiptId, customerReceipts.id))
    .innerJoin(accountsReceivable, eq(customerReceiptApplied.arId, accountsReceivable.id))
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(and(
      eq(customerReceipts.companyId, companyId),
      // Auditoria ISO-09 / ARP-20: este desglose se imprime y se le entrega al
      // cliente. Sin el filtro de entorno se le reconocian pagos de practicas.
      eq(customerReceipts.modo, modo),
      // Auditoria ARP-04: `customer_receipt_applied` no lleva company_id, asi
      // que la cuenta por cobrar y su factura entraban a este JOIN sin acotar.
      // Una fila de aplicacion cruzada mostraba aqui el NCF y el total de una
      // factura de OTRA empresa.
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.modo, modo),
      eq(customerReceipts.customerId, customerId),
      sql`${customerReceipts.deletedAt} IS NULL`
    ))
    .orderBy(desc(customerReceipts.date), desc(customerReceiptApplied.createdAt));

    return applications.map(app => ({
      ...app,
      receiptAmount: parseFloat(String(app.receiptAmount)),
      amountApplied: parseFloat(String(app.amountApplied)),
      invoiceTotal: parseFloat(String(app.invoiceTotal)),
      currentBalance: parseFloat(String(app.currentBalance))
    }));
  }

  // Auditoria P0-05: la copia local de `getOrCreateAccount` vivia aqui --
  // eliminada en el lote 136. Era la ultima de un repositorio; buscaba por
  // codigo literal y creaba la cuenta si no la encontraba. Su unico uso, el
  // asiento del recibo de cobro, resuelve ahora por `resolverCuentaPorMapeo`.
}
