import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, bankAccounts, bankTransactions, auditLogs, chartOfAccounts } from '@/db';
import { eq, and, isNull, count, desc } from 'drizzle-orm';
import { AccountRepository } from '@/repositories/accountRepository';

const createTransactionSchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Fecha inválida',
  }).transform((val) => new Date(val)),
  type: z.enum(['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fee']),
  amount: z.number().positive('El monto debe ser mayor a cero'),
  reference: z.string().max(100).optional(),
  description: z.string().min(3, 'La descripción debe tener al menos 3 caracteres'),
});

async function getOrCreateAccount(tx: any, companyId: string, code: string, name: string, type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense') {
  const [acc] = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));

  if (acc) return acc;

  const [newAcc] = await tx
    .insert(chartOfAccounts)
    .values({
      companyId,
      code,
      name,
      type,
      status: 'active',
    })
    .returning();

  return newAcc;
}

/**
 * GET /api/v1/bank/accounts/[id]/transactions - List transactions for a bank account
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "banco:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'banco', 'read');

    // Verify bank account exists
    const [account] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, auth.companyId), isNull(bankAccounts.deletedAt)))
      .limit(1);

    if (!account) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Cuenta bancaria no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const offset = (page - 1) * perPage;

    const [totalResult] = await db
      .select({ value: count() })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.bankAccountId, id), isNull(bankTransactions.deletedAt)));

    const total = totalResult?.value || 0;

    const list = await db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.bankAccountId, id), isNull(bankTransactions.deletedAt)))
      .orderBy(desc(bankTransactions.date), desc(bankTransactions.createdAt))
      .limit(perPage)
      .offset(offset);

    return NextResponse.json(
      {
        success: true,
        data: list,
        meta: {
          page,
          per_page: perPage,
          total,
          total_pages: Math.ceil(total / perPage),
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/bank/accounts/[id]/transactions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/bank/accounts/[id]/transactions - Register bank transaction
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "banco:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'banco', 'write');

    const body = await req.json();
    const result = createTransactionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const { date, type, amount, reference, description } = result.data;

    // Fetch the bank account
    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, auth.companyId), isNull(bankAccounts.deletedAt)))
      .limit(1);

    if (!account) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Cuenta bancaria no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Process transaction and update balance
    const transaction = await db.transaction(async (tx) => {
      const currentBalance = parseFloat(account.balance);
      let newBalance = currentBalance;

      if (type === 'deposit' || type === 'transfer_in') {
        newBalance += amount;
      } else {
        newBalance -= amount;
      }

      // Update bank account balance
      await tx
        .update(bankAccounts)
        .set({
          balance: newBalance.toString(),
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, id));

      // Insert transaction record
      const [newTx] = await tx
        .insert(bankTransactions)
        .values({
          companyId: auth.companyId,
          bankAccountId: id,
          date: date.toISOString().split('T')[0],
          type,
          amount: amount.toString(),
          reference,
          description,
          status: 'pending',
        })
        .returning();

      // Automate general ledger entry
      const accBanco = await getOrCreateAccount(tx, auth.companyId, '1.1.01.02', `Banco - ${account.bankName}`, 'asset');
      const accContra = await getOrCreateAccount(
        tx,
        auth.companyId,
        type === 'deposit' || type === 'transfer_in' ? '4.1.99' : '6.1.99',
        type === 'deposit' || type === 'transfer_in' ? 'Otros Ingresos (Por Conciliar)' : 'Gastos Operacionales (Por Conciliar)',
        type === 'deposit' || type === 'transfer_in' ? 'revenue' : 'expense'
      );

      const journalLines = [];
      if (type === 'deposit' || type === 'transfer_in') {
        journalLines.push({ accountId: accBanco.id, debit: amount, credit: 0 });
        journalLines.push({ accountId: accContra.id, debit: 0, credit: amount });
      } else {
        journalLines.push({ accountId: accContra.id, debit: amount, credit: 0 });
        journalLines.push({ accountId: accBanco.id, debit: 0, credit: amount });
      }

      await AccountRepository.createJournalEntry(tx, {
        companyId: auth.companyId,
        reference: newTx.id,
        date,
        description: `Transacción Bancaria Automática: ${description}`,
        lines: journalLines,
      });

      // Register audit log
      await tx.insert(auditLogs).values({
        companyId: auth.companyId,
        userId: auth.userId,
        action: 'bank_transaction_registered',
        entityType: 'bank_transactions',
        entityId: newTx.id,
        newValues: { type, amount, reference, description },
        ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
      });

      return newTx;
    });

    return NextResponse.json(
      { success: true, message: 'Movimiento bancario registrado exitosamente.', data: transaction },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/bank/accounts/[id]/transactions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
