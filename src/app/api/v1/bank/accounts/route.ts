import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, bankAccounts, bankTransactions, auditLogs } from '@/db';
import { eq, and, isNull, count, desc } from 'drizzle-orm';

const createBankAccountSchema = z.object({
  bankName: z.string().min(3, 'El nombre del banco debe tener al menos 3 caracteres'),
  accountNumber: z.string().min(5, 'El número de cuenta debe tener al menos 5 caracteres'),
  currency: z.string().max(10).default('DOP'),
  type: z.enum(['corriente', 'ahorros']).default('corriente'),
  balance: z.number().default(0),
});

/**
 * GET /api/v1/bank/accounts - List company bank accounts
 */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "banco:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'banco', 'read');

    const accounts = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, auth.companyId), isNull(bankAccounts.deletedAt)))
      .orderBy(desc(bankAccounts.createdAt));

    return NextResponse.json(
      { success: true, data: accounts },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/bank/accounts:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/bank/accounts - Create a new bank account
 */
export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "banco:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'banco', 'write');

    const body = await req.json();
    const result = createBankAccountSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const { bankName, accountNumber, currency, type, balance } = result.data;

    // Check if account number already exists for the company
    const [existing] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.companyId, auth.companyId),
          eq(bankAccounts.accountNumber, accountNumber),
          isNull(bankAccounts.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_ACCOUNT_NUMBER', message: 'El número de cuenta bancaria ya existe en su empresa.' } },
        { status: 409, headers: resHeaders }
      );
    }

    const account = await db.transaction(async (tx) => {
      // 1. Insert bank account
      const [newAccount] = await tx
        .insert(bankAccounts)
        .values({
          companyId: auth.companyId,
          bankName,
          accountNumber,
          currency,
          type,
          balance: balance.toString(),
          status: 'active',
        })
        .returning();

      // 2. If initial balance > 0, register deposit transaction
      if (balance > 0) {
        await tx.insert(bankTransactions).values({
          companyId: auth.companyId,
          bankAccountId: newAccount.id,
          date: new Date().toISOString().split('T')[0],
          type: 'deposit',
          amount: balance.toString(),
          reference: 'SALDO INICIAL',
          description: 'Registro de saldo de apertura de cuenta bancaria',
          status: 'reconciled',
        });
      }

      // 3. Register audit log
      await tx.insert(auditLogs).values({
        companyId: auth.companyId,
        userId: auth.userId,
        action: 'bank_account_created',
        entityType: 'bank_accounts',
        entityId: newAccount.id,
        newValues: { bankName, accountNumber, type, initialBalance: balance },
        ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
      });

      return newAccount;
    });

    return NextResponse.json(
      { success: true, message: 'Cuenta bancaria creada exitosamente.', data: account },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/bank/accounts:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
