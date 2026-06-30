import { db } from '@/db';
import { financialMovements, invoices, expenses, customerReceipts, apPayments, customers, suppliers } from '@/db/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface RegisterMovementInput {
  companyId: string;
  entityType: 'customer' | 'supplier';
  customerId?: string | null;
  supplierId?: string | null;
  date: string | Date; // YYYY-MM-DD
  movementType: 'invoice' | 'receipt' | 'payment' | 'credit_note' | 'debit_note' | 'retention' | 'advance' | 'void';
  documentId: string;
  documentNumber: string;
  originModule: 'invoicing' | 'purchases' | 'cash' | 'bank' | 'accounting';
  debit: number;
  credit: number;
  userId?: string | null;
  notes?: string | null;
}

export class FinancialMovementService {
  /**
   * Registers a financial movement inside a Drizzle transaction.
   * Automatically calculates/rebuilds progressive running balances.
   */
  static async registerMovement(
    tx: any,
    input: RegisterMovementInput
  ) {
    const dbClient = tx || db;

    const dateStr = typeof input.date === 'string' 
      ? input.date 
      : input.date.toISOString().split('T')[0];
    
    // Format current local time HH:MM:SS
    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join(':');

    // 1. Insert the movement with a temp balance of 0.00
    const [movement] = await dbClient
      .insert(financialMovements)
      .values({
        id: uuidv4(),
        companyId: input.companyId,
        entityType: input.entityType,
        customerId: input.customerId || null,
        supplierId: input.supplierId || null,
        date: dateStr,
        time: timeStr,
        movementType: input.movementType,
        documentId: input.documentId,
        documentNumber: input.documentNumber,
        originModule: input.originModule,
        debit: input.debit.toFixed(2),
        credit: input.credit.toFixed(2),
        balance: '0.00',
        currency: 'DOP',
        userId: input.userId || null,
        notes: input.notes || null,
        status: 'active',
      })
      .returning();

    // 2. Rebuild balances chronologically for this customer/supplier to ensure correctness
    const entityId = input.entityType === 'customer' 
      ? input.customerId! 
      : input.supplierId!;

    await this.rebuildBalances(dbClient, input.companyId, input.entityType, entityId);

    return movement;
  }

  /**
   * Recalculates progressive balances for a customer or supplier in chronological order.
   */
  static async rebuildBalances(
    tx: any,
    companyId: string,
    entityType: 'customer' | 'supplier',
    entityId: string
  ) {
    const dbClient = tx || db;

    // Fetch all active movements for the customer/supplier sorted chronologically
    const movementsList = await dbClient
      .select()
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.companyId, companyId),
          eq(financialMovements.entityType, entityType),
          entityType === 'customer'
            ? eq(financialMovements.customerId, entityId)
            : eq(financialMovements.supplierId, entityId),
          eq(financialMovements.status, 'active')
        )
      )
      .orderBy(asc(financialMovements.date), asc(financialMovements.time), asc(financialMovements.createdAt));

    let runningBalance = 0;

    for (const mov of movementsList) {
      const debit = parseFloat(mov.debit);
      const credit = parseFloat(mov.credit);

      if (entityType === 'customer') {
        // Customer balance increases with Debit (invoice) and decreases with Credit (receipt)
        runningBalance = runningBalance + debit - credit;
      } else {
        // Supplier balance increases with Credit (purchase) and decreases with Debit (payment)
        runningBalance = runningBalance - debit + credit;
      }

      await dbClient
        .update(financialMovements)
        .set({
          balance: runningBalance.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(financialMovements.id, mov.id));
    }
  }

  /**
   * Performs an auto-seeding process if no financial movements exist for a company.
   * Reads existing invoices, receipts, expenses, payments and recreates movements chronologically.
   */
  static async autoSeedMovements(companyId: string) {
    return await db.transaction(async (tx) => {
      // Check if movements already exist
      const [existing] = await tx
        .select({ id: financialMovements.id })
        .from(financialMovements)
        .where(eq(financialMovements.companyId, companyId))
        .limit(1);

      if (existing) {
        // Already seeded
        return { success: true, message: 'La base de datos ya contiene movimientos financieros.' };
      }

      console.log(`[Auto-Seeding] Starting financial movements reconstruction for company: ${companyId}`);

      interface SeedEvent {
        date: string;
        createdAt: Date;
        entityType: 'customer' | 'supplier';
        customerId?: string | null;
        supplierId?: string | null;
        movementType: 'invoice' | 'receipt' | 'payment' | 'credit_note' | 'debit_note' | 'retention' | 'advance';
        documentId: string;
        documentNumber: string;
        originModule: 'invoicing' | 'purchases' | 'cash' | 'bank' | 'accounting';
        debit: number;
        credit: number;
        userId?: string | null;
        notes?: string | null;
      }

      const events: SeedEvent[] = [];

      // 1. Fetch Invoices & Credit/Debit Notes (exclude drafts/rejected)
      const companyInvoices = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            isNull(invoices.deletedAt),
            sql`${invoices.status} NOT IN ('draft', 'rejected')`
          )
        );

      for (const inv of companyInvoices) {
        const total = parseFloat(inv.totalNet || inv.total);
        const dateStr = inv.createdAt.toISOString().split('T')[0];
        
        let type: 'invoice' | 'credit_note' | 'debit_note' = 'invoice';
        let debit = 0;
        let credit = 0;

        if (inv.ecfType === '34') {
          type = 'credit_note';
          credit = total; // Credit note reduces debt
        } else if (inv.ecfType === '33') {
          type = 'debit_note';
          debit = total; // Debit note increases debt
        } else {
          debit = total; // Standard invoice increases debt
        }

        events.push({
          date: dateStr,
          createdAt: inv.createdAt,
          entityType: 'customer',
          customerId: inv.customerId,
          movementType: type,
          documentId: inv.id,
          documentNumber: inv.ncf || inv.codigoFactura || 'Sin NCF',
          originModule: 'invoicing',
          debit,
          credit,
          userId: inv.userId,
          notes: inv.notes || `Reconstrucción de factura/ajuste NCF: ${inv.ncf}`,
        });

        // Rule: If cash sale, generate the matching immediate payment receipt movement
        const isCash = inv.paymentType === 'cash' || inv.paymentType === 'bank_transfer';
        if (isCash && inv.ecfType !== '34' && inv.customerId) {
          events.push({
            date: dateStr,
            createdAt: new Date(inv.createdAt.getTime() + 1000), // 1 second later
            entityType: 'customer',
            customerId: inv.customerId,
            movementType: 'receipt',
            documentId: inv.id,
            documentNumber: `REC-CASH-${inv.ncf}`,
            originModule: 'cash',
            debit: 0,
            credit: total,
            userId: inv.userId,
            notes: `Cobro inmediato en venta al contado NCF: ${inv.ncf}`,
          });
        }
      }

      // 2. Fetch Customer Receipts
      const receipts = await tx
        .select()
        .from(customerReceipts)
        .where(
          and(
            eq(customerReceipts.companyId, companyId),
            isNull(customerReceipts.deletedAt)
          )
        );

      for (const rec of receipts) {
        const amount = parseFloat(rec.amount);
        events.push({
          date: rec.date,
          createdAt: rec.createdAt,
          entityType: 'customer',
          customerId: rec.customerId,
          movementType: 'receipt',
          documentId: rec.id,
          documentNumber: rec.reference || `REC-${rec.id.slice(0, 8)}`,
          originModule: rec.paymentMethod === 'cash' ? 'cash' : 'bank',
          debit: 0,
          credit: amount,
          notes: rec.notes || `Cobro registrado. Ref: ${rec.reference || 'N/A'}`,
        });
      }

      // 3. Fetch Expenses / Purchases
      const companyExpenses = await tx
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.companyId, companyId),
            isNull(expenses.deletedAt)
          )
        );

      for (const exp of companyExpenses) {
        const amount = parseFloat(exp.amount);
        const dateStr = exp.issueDate;
        
        events.push({
          date: dateStr,
          createdAt: exp.createdAt,
          entityType: 'supplier',
          supplierId: exp.supplierId,
          movementType: 'invoice',
          documentId: exp.id,
          documentNumber: exp.ncf || 'Sin NCF',
          originModule: 'purchases',
          debit: 0,
          credit: amount, // purchase increases accounts payable (credit)
          notes: exp.description || `Reconstrucción de gasto/compra NCF: ${exp.ncf || 'N/A'}`,
        });

        // Rule: If paid immediately (method is NOT '04' credit)
        const isCredit = exp.paymentMethod === '04';
        if (!isCredit && exp.supplierId) {
          events.push({
            date: dateStr,
            createdAt: new Date(exp.createdAt.getTime() + 1000), // 1 second later
            entityType: 'supplier',
            supplierId: exp.supplierId,
            movementType: 'payment',
            documentId: exp.id,
            documentNumber: `PAG-CASH-${exp.ncf || exp.id.slice(0,8)}`,
            originModule: exp.paymentMethod === '01' ? 'cash' : 'bank',
            debit: amount, // reduces AP balance (debit)
            credit: 0,
            notes: `Pago inmediato al contado. NCF: ${exp.ncf || 'N/A'}`,
          });
        }
      }

      // 4. Fetch Supplier Payments (AP Payments)
      const apPaymentsList = await tx
        .select({
          payment: apPayments,
          supplierId: sql<string>`accounts_payable.supplier_id`
        })
        .from(apPayments)
        .innerJoin(
          sql`accounts_payable`, 
          sql`ap_payments.ap_id = accounts_payable.id`
        )
        .where(
          and(
            eq(apPayments.companyId, companyId),
            eq(apPayments.status, 'applied')
          )
        );

      for (const pay of apPaymentsList) {
        const amount = parseFloat(pay.payment.amount);
        events.push({
          date: pay.payment.paymentDate,
          createdAt: pay.payment.createdAt,
          entityType: 'supplier',
          supplierId: pay.supplierId,
          movementType: 'payment',
          documentId: pay.payment.id,
          documentNumber: `PAG-${pay.payment.id.slice(0, 8)}`,
          originModule: 'purchases',
          debit: amount,
          credit: 0,
          notes: `Pago aplicado a cuenta por pagar. Método: ${pay.payment.paymentMethod}`,
        });
      }

      // Sort all events chronologically: date asc, createdAt asc
      events.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      console.log(`[Auto-Seeding] Found ${events.length} financial events to seed.`);

      // Insert all events
      const inserts = events.map((e) => {
        const timeStr = [
          String(e.createdAt.getHours()).padStart(2, '0'),
          String(e.createdAt.getMinutes()).padStart(2, '0'),
          String(e.createdAt.getSeconds()).padStart(2, '0'),
        ].join(':');

        return {
          id: uuidv4(),
          companyId,
          entityType: e.entityType,
          customerId: e.customerId || null,
          supplierId: e.supplierId || null,
          date: e.date,
          time: timeStr,
          movementType: e.movementType,
          documentId: e.documentId,
          documentNumber: e.documentNumber,
          originModule: e.originModule,
          debit: e.debit.toFixed(2),
          credit: e.credit.toFixed(2),
          balance: '0.00',
          currency: 'DOP',
          userId: e.userId || null,
          notes: e.notes || null,
          status: 'active',
          createdAt: e.createdAt,
          updatedAt: e.createdAt,
        };
      });

      if (inserts.length > 0) {
        // Drizzle batch insert in chunks of 500 to avoid query parameter limit in postgres
        const chunkSize = 500;
        for (let i = 0; i < inserts.length; i += chunkSize) {
          const chunk = inserts.slice(i, i + chunkSize);
          await tx.insert(financialMovements).values(chunk);
        }
      }

      // Rebuild balances for all affected customers
      const companyCustomers = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.companyId, companyId));
      
      console.log(`[Auto-Seeding] Rebuilding balances for ${companyCustomers.length} customers...`);
      for (const cust of companyCustomers) {
        await this.rebuildBalances(tx, companyId, 'customer', cust.id);
      }

      // Rebuild balances for all affected suppliers
      const companySuppliers = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.companyId, companyId));

      console.log(`[Auto-Seeding] Rebuilding balances for ${companySuppliers.length} suppliers...`);
      for (const supp of companySuppliers) {
        await this.rebuildBalances(tx, companyId, 'supplier', supp.id);
      }

      console.log(`[Auto-Seeding] Completed successfully! Reconstructed ${inserts.length} movements.`);
      return { success: true, count: inserts.length };
    });
  }
}

function isNull(col: any) {
  return sql`${col} IS NULL`;
}
