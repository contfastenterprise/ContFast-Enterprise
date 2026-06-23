import { db } from '@/db';
import { ApRepository } from '@/repositories/apRepository';
import { AccountRepository } from '@/repositories/accountRepository';
import { apPayments, checks, accountsPayable, bankAccounts, bankTransactions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface RegisterPaymentInput {
  companyId: string;
  apId: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'check';
  debitAccountId: string;
  creditAccountId: string;
  paymentDate: Date;
  // Check details if paymentMethod is check
  bankAccountId?: string;
  checkNumber?: string;
  payee?: string;
  dueDate?: Date;
  isGuarantee?: boolean;
}

export class ApService {
  /**
   * Registers a payment on an Accounts Payable.
   * If it is a guarantee check:
   *  - Creates check record with isGuarantee = true, status = 'pending'.
   *  - Creates ap_payments with status = 'pending_guarantee'.
   *  - Does NOT create general ledger entries or update AP balance yet.
   * If it is cash, transfer, or regular check:
   *  - Creates check record (if applicable) with status = 'cleared'.
   *  - Creates ap_payments with status = 'applied'.
   *  - Creates general ledger entries debiting debitAccountId and crediting creditAccountId.
   *  - Deducts paid amount from Accounts Payable balance.
   */
  static async registerPayment(input: RegisterPaymentInput) {
    if (input.amount <= 0) {
      throw new Error('El monto del pago debe ser mayor a cero.');
    }

    return await db.transaction(async (tx) => {
      // 1. Verify AP exists
      const ap = await ApRepository.findById(input.apId, input.companyId);
      if (!ap) {
        throw new Error('Cuenta por pagar no encontrada.');
      }

      const balanceNum = parseFloat(ap.balance);
      if (input.amount > balanceNum) {
        throw new Error(`El monto del pago ($${input.amount.toFixed(2)}) no puede exceder el balance pendiente ($${balanceNum.toFixed(2)}).`);
      }

      let checkId: string | undefined;

      // 2. Handle check payment method
      if (input.paymentMethod === 'check') {
        if (!input.bankAccountId || !input.checkNumber || !input.payee) {
          throw new Error('Faltan datos del cheque (Banco, número de cheque, o beneficiario).');
        }

        if (input.isGuarantee) {
          if (!input.dueDate) {
            throw new Error('Debe especificar la fecha de vencimiento para cheques en garantía.');
          }

          // Register guarantee check as pending
          const check = await ApRepository.createCheck(tx, {
            companyId: input.companyId,
            bankAccountId: input.bankAccountId,
            checkNumber: input.checkNumber,
            payee: input.payee,
            amount: input.amount,
            issueDate: input.paymentDate,
            dueDate: input.dueDate,
            isGuarantee: true,
            apId: input.apId,
            status: 'pending',
          });
          checkId = check.id;

          // Register payment as pending_guarantee
          const payment = await ApRepository.createPayment(tx, {
            companyId: input.companyId,
            apId: input.apId,
            amount: input.amount,
            paymentMethod: 'check',
            checkId,
            debitAccountId: input.debitAccountId,
            creditAccountId: input.creditAccountId,
            paymentDate: input.paymentDate,
            status: 'pending_guarantee',
          });

          return {
            payment,
            status: 'pending_guarantee',
            message: 'Cheque en garantía registrado con éxito. Se aplicará contablemente cuando venza y se procese manualmente.',
          };
        } else {
          // Regular check - cleared immediately
          const check = await ApRepository.createCheck(tx, {
            companyId: input.companyId,
            bankAccountId: input.bankAccountId,
            checkNumber: input.checkNumber,
            payee: input.payee,
            amount: input.amount,
            issueDate: input.paymentDate,
            isGuarantee: false,
            apId: input.apId,
            status: 'cleared',
          });
          checkId = check.id;
        }
      }

      // 3. Process immediate payment (Cash, Transfer or Regular Check)
      // Save payment record
      const payment = await ApRepository.createPayment(tx, {
        companyId: input.companyId,
        apId: input.apId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        checkId,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        paymentDate: input.paymentDate,
        status: 'applied',
      });

      // Update accounts payable balance
      const newBalance = balanceNum - input.amount;
      await ApRepository.updateApBalance(tx, input.apId, input.companyId, newBalance);

      // Create Ledger entry (Journal Entry)
      const description = `Pago CXP a proveedor ${ap.supplierName} - ${
        input.paymentMethod === 'check' 
          ? `Cheque #${input.checkNumber}` 
          : input.paymentMethod === 'transfer' 
          ? 'Transferencia' 
          : 'Efectivo'
      }`;

      await AccountRepository.createJournalEntry(tx, {
        companyId: input.companyId,
        reference: payment.id,
        date: input.paymentDate,
        description,
        lines: [
          {
            accountId: input.debitAccountId,
            debit: input.amount,
            credit: 0,
          },
          {
            accountId: input.creditAccountId,
            debit: 0,
            credit: input.amount,
          }
        ]
      });

      return {
        payment,
        status: 'applied',
        message: 'Pago registrado y aplicado a la contabilidad correctamente.',
      };
    });
  }

  /**
   * Scans and applies all due guarantee checks for a company.
   */
  static async applyDueGuaranteeChecks(companyId: string) {
    const today = new Date();

    return await db.transaction(async (tx) => {
      const pendingChecks = await ApRepository.findPendingGuaranteeChecks(companyId, today);
      
      let appliedCount = 0;
      let totalAppliedAmount = 0;

      for (const item of pendingChecks) {
        const check = item.check;
        const payment = item.payment;
        const ap = item.ap;

        const amountNum = parseFloat(payment.amount);
        const apBalance = parseFloat(ap.balance);

        // Calculate new balance
        const newBalance = Math.max(0, apBalance - amountNum);

        // 1. Update check status to cleared
        await tx.update(checks)
          .set({ status: 'cleared', updatedAt: new Date() })
          .where(eq(checks.id, check.id));

        // 2. Update payment status to applied
        await tx.update(apPayments)
          .set({ status: 'applied', updatedAt: new Date() })
          .where(eq(apPayments.id, payment.id));

        // 3. Update accounts payable balance
        await ApRepository.updateApBalance(tx, ap.id, companyId, newBalance);

        // 4. Update bank account balance and create bank transaction
        if (check.bankAccountId) {
          const [bankAcc] = await tx
            .select()
            .from(bankAccounts)
            .where(and(eq(bankAccounts.id, check.bankAccountId), eq(bankAccounts.companyId, companyId)));

          if (bankAcc) {
            const currentBankBalance = parseFloat(bankAcc.balance);
            const newBankBalance = currentBankBalance - amountNum;

            await tx.update(bankAccounts)
              .set({ balance: newBankBalance.toString(), updatedAt: new Date() })
              .where(eq(bankAccounts.id, check.bankAccountId));

            await tx.insert(bankTransactions).values({
              id: uuidv4(),
              companyId,
              bankAccountId: check.bankAccountId,
              date: today.toISOString().split('T')[0],
              type: 'withdrawal',
              amount: amountNum.toString(),
              reference: check.checkNumber,
              description: `Aplicación Automática de Cheque en Garantía #${check.checkNumber} - Beneficiario: ${check.payee}`,
              status: 'reconciled',
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }

        // 5. Create Ledger entry
        const description = `Aplicación de Cheque en Garantía Vencido #${check.checkNumber} - Proveedor ${item.supplierName}`;
        
        await AccountRepository.createJournalEntry(tx, {
          companyId,
          reference: payment.id,
          date: today,
          description,
          lines: [
            {
              accountId: payment.debitAccountId,
              debit: amountNum,
              credit: 0,
            },
            {
              accountId: payment.creditAccountId,
              debit: 0,
              credit: amountNum,
            }
          ]
        });

        appliedCount++;
        totalAppliedAmount += amountNum;
      }

      return {
        appliedCount,
        totalAppliedAmount,
      };
    });
  }

  /**
   * Applies/Clears a single guarantee check.
   */
  static async applySingleGuaranteeCheck(companyId: string, checkId: string) {
    const today = new Date();

    return await db.transaction(async (tx) => {
      // 1. Get the check
      const [check] = await tx
        .select()
        .from(checks)
        .where(and(eq(checks.id, checkId), eq(checks.companyId, companyId)));

      if (!check) {
        throw new Error('Cheque en garantía no encontrado.');
      }

      if (check.status !== 'pending' || !check.isGuarantee) {
        throw new Error('El cheque no es un cheque en garantía pendiente o ya ha sido procesado.');
      }

      if (!check.apId) {
        throw new Error('El cheque en garantía no está asociado a una cuenta por pagar.');
      }

      // 2. Get the payment
      const [payment] = await tx
        .select()
        .from(apPayments)
        .where(and(eq(apPayments.checkId, checkId), eq(apPayments.companyId, companyId)));

      if (!payment) {
        throw new Error('Registro de pago asociado al cheque no encontrado.');
      }

      // 3. Get the accounts payable
      const [ap] = await tx
        .select()
        .from(accountsPayable)
        .where(and(eq(accountsPayable.id, check.apId), eq(accountsPayable.companyId, companyId)));

      if (!ap) {
        throw new Error('Cuenta por pagar asociada no encontrada.');
      }

      const amountNum = parseFloat(payment.amount);
      const apBalance = parseFloat(ap.balance);

      const newBalance = Math.max(0, apBalance - amountNum);

      // 4. Update check status to cleared
      await tx.update(checks)
        .set({ status: 'cleared', updatedAt: new Date() })
        .where(eq(checks.id, check.id));

      // 5. Update payment status to applied
      await tx.update(apPayments)
        .set({ status: 'applied', updatedAt: new Date() })
        .where(eq(apPayments.id, payment.id));

      // 6. Update accounts payable balance
      await ApRepository.updateApBalance(tx, ap.id, companyId, newBalance);

      // 7. Update bank account balance and create bank transaction
      if (check.bankAccountId) {
        const [bankAcc] = await tx
          .select()
          .from(bankAccounts)
          .where(and(eq(bankAccounts.id, check.bankAccountId), eq(bankAccounts.companyId, companyId)));

        if (bankAcc) {
          const currentBankBalance = parseFloat(bankAcc.balance);
          const newBankBalance = currentBankBalance - amountNum;

          await tx.update(bankAccounts)
            .set({ balance: newBankBalance.toString(), updatedAt: new Date() })
            .where(eq(bankAccounts.id, check.bankAccountId));

          await tx.insert(bankTransactions).values({
            id: uuidv4(),
            companyId,
            bankAccountId: check.bankAccountId,
            date: today.toISOString().split('T')[0],
            type: 'withdrawal',
            amount: amountNum.toString(),
            reference: check.checkNumber,
            description: `Aplicación de Cheque en Garantía #${check.checkNumber} - Beneficiario: ${check.payee}`,
            status: 'reconciled',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      // 8. Create Ledger entry
      const description = `Aplicación de Cheque en Garantía #${check.checkNumber} - Beneficiario: ${check.payee}`;
      
      await AccountRepository.createJournalEntry(tx, {
        companyId,
        reference: payment.id,
        date: today,
        description,
        lines: [
          {
            accountId: payment.debitAccountId,
            debit: amountNum,
            credit: 0,
          },
          {
            accountId: payment.creditAccountId,
            debit: 0,
            credit: amountNum,
          }
        ]
      });

      return {
        appliedCount: 1,
        totalAppliedAmount: amountNum,
      };
    });
  }
}
