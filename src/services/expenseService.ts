// src/services/expenseService.ts
import { eq, and, between } from 'drizzle-orm';
import { db } from '../db';
import { expenses } from '../db/schema';
import { accountsPayable } from '../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { addStock } from './inventoryService';
import { AccountRepository } from '../repositories/accountRepository';
import { resolverCuentaPorMapeo } from './accounting/resolverCuentas';
import { FinancialMovementService } from '@/services/financialMovementService';

// Auditoria P0-05 (2026-09-03): `getOrCreateAccount` vivia aqui -- eliminado.
// Creaba cuentas sobre la marcha sin `nature`/`level` correctos, y no
// distinguia una cuenta de agrupacion ('2.1.01', '1.1.01') de su hija
// transaccional. Las cuentas de este modulo se resuelven ahora con
// `resolverCuentaPorMapeo` (services/accounting/resolverCuentas.ts), que
// nunca crea y siempre valida.

/**
 * Creates a new expense record and automatically creates a corresponding
 * entry in `accounts_payable`.
 */
export async function createExpense(expenseData: {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  warehouseId?: string;
  supplierId: string;
  expenseType: string; // '01'..'11'
  ncf: string;
  ncfModified?: string;
  issueDate: string; // YYYY-MM-DD
  paymentDate?: string;
  amount: number;
  itbis?: number;
  itbisRetained?: number;
  itbisProportionality?: number;
  isrRetained?: number;
  isc?: number;
  otherTaxes?: number;
  tip?: number;
  paymentMethod: string; // '01' cash, '02' cheque, etc.
  userId?: string; // Required if updating inventory
  lines?: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
  debitAccountId?: string;
}) {
  return await db.transaction(async (tx) => {
    // Insert expense
    const [expense] = await tx
      .insert(expenses)
      .values({
        id: uuidv4(),
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        warehouseId: expenseData.warehouseId,
        supplierId: expenseData.supplierId,
        expenseType: expenseData.expenseType,
        ncf: expenseData.ncf,
        ncfModified: expenseData.ncfModified,
        issueDate: expenseData.issueDate,
        paymentDate: expenseData.paymentDate,
        amount: expenseData.amount.toString(),
        itbis: (expenseData.itbis ?? 0).toString(),
        itbisRetained: (expenseData.itbisRetained ?? 0).toString(),
        itbisProportionality: (expenseData.itbisProportionality ?? 0).toString(),
        isrRetained: (expenseData.isrRetained ?? 0).toString(),
        isc: (expenseData.isc ?? 0).toString(),
        otherTaxes: (expenseData.otherTaxes ?? 0).toString(),
        tip: (expenseData.tip ?? 0).toString(),
        paymentMethod: expenseData.paymentMethod,
      })
      .returning();

    // Automatic CXP entry
    const isCredit = expenseData.paymentMethod === '04';
    await tx
      .insert(accountsPayable)
      .values({
        id: uuidv4(),
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        supplierId: expenseData.supplierId,
        amount: expenseData.amount.toString(),
        balance: isCredit ? expenseData.amount.toString() : '0.00',
        dueDate: expenseData.paymentDate ?? expenseData.issueDate,
        status: isCredit ? 'pending' : 'paid',
        expenseId: expense.id,
      });

    // Financial movements registration (Suplidores)
    if (expenseData.supplierId) {
      await FinancialMovementService.registerMovement(tx, {
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        entityType: 'supplier',
        supplierId: expenseData.supplierId,
        date: expenseData.issueDate,
        movementType: 'invoice',
        documentId: expense.id,
        documentNumber: expenseData.ncf || 'Sin NCF',
        originModule: 'purchases',
        debit: 0,
        credit: expenseData.amount,
        userId: expenseData.userId,
        notes: `Compra de bienes/servicios registrada. NCF: ${expenseData.ncf || 'Sin NCF'}`,
      });

      // Rule: If cash purchase, generate matching immediate payment movement
      if (!isCredit) {
        await FinancialMovementService.registerMovement(tx, {
          companyId: expenseData.companyId,
          modo: expenseData.modo,
          entityType: 'supplier',
          supplierId: expenseData.supplierId,
          date: expenseData.issueDate,
          movementType: 'payment',
          documentId: expense.id,
          documentNumber: `PAG-CASH-${expenseData.ncf || expense.id.slice(0, 8)}`,
          originModule: expenseData.paymentMethod === '01' ? 'cash' : 'bank',
          debit: expenseData.amount,
          credit: 0,
          userId: expenseData.userId,
          notes: `Pago inmediato al contado. NCF: ${expenseData.ncf || 'Sin NCF'}`,
        });
      }
    }

    // --- Journal Entry Generation (Asiento Contable) ---
    const subtotal = expenseData.amount;
    const itbisAmount = expenseData.itbis ?? 0;
    const otherTaxesAmount = expenseData.otherTaxes ?? 0;
    const isrRet = expenseData.isrRetained ?? 0;
    const itbisRet = expenseData.itbisRetained ?? 0;

    // Total net: subtotal + itbis + otherTaxes - isrRet - itbisRet
    const netAmount = subtotal + itbisAmount + otherTaxesAmount - isrRet - itbisRet;

    if (netAmount > 0) {
      // 1. Get/create accounts
      // Auditoria P0-05 (2026-09-03): mismo arreglo que expenses/route.ts --
      // `resolverCuentaPorMapeo` nunca crea y siempre valida que la cuenta
      // sea transaccional, activa y de esta empresa. El override manual
      // (`expenseData.debitAccountId`) se conserva tal cual: sigue sin
      // validar aqui que pertenezca a la empresa, igual que antes -- eso
      // queda fuera del alcance de este arreglo.
      const hasInventory = !!(expenseData.warehouseId && expenseData.lines && expenseData.lines.length > 0);
      const accDebit = expenseData.debitAccountId
        ? { id: expenseData.debitAccountId }
        : (hasInventory 
          ? await resolverCuentaPorMapeo(tx, expenseData.companyId, 'purchase_inventory', '1.1.06', 'Compra - Inventario de Mercancía')
          : await resolverCuentaPorMapeo(tx, expenseData.companyId, 'cost_of_goods_sold', '5.1.01', 'Compra - Costo de Ventas'));

      const accCredit = isCredit
        ? await resolverCuentaPorMapeo(tx, expenseData.companyId, 'supplier_payable', '2.1.01.01', 'Compra - Cuentas por Pagar')
        : await resolverCuentaPorMapeo(tx, expenseData.companyId, 'cash', '1.1.01.01', 'Compra - Efectivo');

      const journalLines = [
        // Debit the subtotal/cost
        { accountId: accDebit.id, debit: subtotal, credit: 0 },
      ];

      // Debit the ITBIS Pagado if any
      if (itbisAmount > 0) {
        const accItbisPagado = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'purchase_itbis_paid', '1.1.08', 'Compra - ITBIS Pagado');
        journalLines.push({ accountId: accItbisPagado.id, debit: itbisAmount, credit: 0 });
      }

      // Debit other taxes if any
      if (otherTaxesAmount > 0) {
        const accOtrosImp = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'purchase_other_taxes', '5.1.02', 'Compra - Otros Impuestos y Tasas');
        journalLines.push({ accountId: accOtrosImp.id, debit: otherTaxesAmount, credit: 0 });
      }

      // Credit the net paid/payable
      journalLines.push({ accountId: accCredit.id, debit: 0, credit: netAmount });

      // Credit the Retained ISR if any
      if (isrRet > 0) {
        const accIsrRet = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'isr_withholding_payable', '2.1.04', 'Compra - ISR Retenido por Pagar');
        journalLines.push({ accountId: accIsrRet.id, debit: 0, credit: isrRet });
      }

      // Credit the Retained ITBIS if any
      if (itbisRet > 0) {
        const accItbisRet = await resolverCuentaPorMapeo(tx, expenseData.companyId, 'itbis_withholding_payable', '2.1.05', 'Compra - ITBIS Retenido por Pagar');
        journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: itbisRet });
      }

      // Create the journal entry
      await AccountRepository.createJournalEntry(tx, {
        companyId: expenseData.companyId,
        modo: expenseData.modo,
        reference: expense.id,
        date: expenseData.issueDate,
        description: `Asiento Automático de Compra NCF: ${expenseData.ncf || 'N/A'} - ${isCredit ? 'A Crédito' : 'Al Contado'}`,
        lines: journalLines,
        // Auditoria JRN-16: quien registra el asiento.
        createdBy: expenseData.userId || null,
      });
    }

    // Update inventory if goods purchase
    if (expenseData.warehouseId && expenseData.lines && expenseData.userId) {
      // For expenseType '09' (Compras y Gastos que formarán parte del costo de venta) or similar
      for (const line of expenseData.lines) {
        await addStock(
          expenseData.companyId,
          expenseData.modo,
          line.productId,
          expenseData.warehouseId,
          line.quantity,
          expenseData.userId,
          'purchase',
          expense.id,
          `Compra según NCF ${expenseData.ncf}`,
          tx
        );
      }
    }

    return expense;
  });
}

/** Fetch expenses for a company within a month (YYYY-MM) */
export async function getExpenses(companyId: string, period: string, modo: 'PRODUCCION' | 'PRUEBA') {
  const [year, month] = period.split('-');
  const start = `${year}-${month}-01`;
  const end = `${year}-${month}-31`;
  return await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        // `modo` tiene DEFAULT 'PRODUCCION': sin este filtro el 606 y el TXT que
        // se remite a la DGII incluian las compras registradas en PRUEBA, con su
        // NCF y su monto, indistinguibles de las reales. Es parametro
        // obligatorio para que ninguna llamada nueva pueda olvidarlo.
        eq(expenses.modo, modo),
        between(expenses.issueDate, start, end)
      )
    );
}

/** Generate the 606 TXT file content */
export async function generate606Txt(companyId: string, period: string, modo: 'PRODUCCION' | 'PRUEBA') {
  const rows = await getExpenses(companyId, period, modo);
  const lines = rows.map((e) => {
    const fields = [
      (e.ncf || '').padEnd(19, ' '),
      e.issueDate.replace(/-/g, ''),
      e.paymentMethod.padStart(2, '0'),
      Number(e.amount).toFixed(2).replace('.', ''),
      Number(e.itbis).toFixed(2).replace('.', ''),
      Number(e.itbisRetained).toFixed(2).replace('.', ''),
      Number(e.isrRetained).toFixed(2).replace('.', ''),
    ];
    return fields.join('');
  });
  const header = `606|${companyId}|${period}\n`;
  return header + lines.join('\n') + '\n';
}

