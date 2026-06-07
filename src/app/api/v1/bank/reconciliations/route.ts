import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, bankAccounts, bankReconciliations, bankTransactions, auditLogs } from '@/db';
import { eq, and, isNull, count, desc, gte, lte } from 'drizzle-orm';

const createReconciliationSchema = z.object({
  bankAccountId: z.string().uuid('ID de cuenta bancaria inválido'),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Fecha de inicio inválida',
  }).transform((val) => new Date(val)),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Fecha de fin inválida',
  }).transform((val) => new Date(val)),
  openingBalance: z.number(),
  closingBalance: z.number(),
  status: z.enum(['draft', 'posted']).default('draft'),
});

/**
 * GET /api/v1/bank/reconciliations - List bank reconciliations
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

    const { searchParams } = new URL(req.url);
    const bankAccountId = searchParams.get('bank_account_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const offset = (page - 1) * perPage;

    const conditions = [
      eq(bankReconciliations.companyId, auth.companyId),
      isNull(bankReconciliations.deletedAt)
    ];

    if (bankAccountId) {
      conditions.push(eq(bankReconciliations.bankAccountId, bankAccountId));
    }

    const [totalResult] = await db
      .select({ value: count() })
      .from(bankReconciliations)
      .where(and(...conditions));

    const total = totalResult?.value || 0;

    const list = await db
      .select()
      .from(bankReconciliations)
      .where(and(...conditions))
      .orderBy(desc(bankReconciliations.endDate), desc(bankReconciliations.createdAt))
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
    console.error('Error in GET /api/v1/bank/reconciliations:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/bank/reconciliations - Create a bank reconciliation
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
    const result = createReconciliationSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const { bankAccountId, startDate, endDate, openingBalance, closingBalance, status } = result.data;

    // Verify bank account exists
    const [account] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, auth.companyId), isNull(bankAccounts.deletedAt)))
      .limit(1);

    if (!account) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Cuenta bancaria no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    const recon = await db.transaction(async (tx) => {
      // Create reconciliation record
      const [newRecon] = await tx
        .insert(bankReconciliations)
        .values({
          companyId: auth.companyId,
          bankAccountId,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          openingBalance: openingBalance.toString(),
          closingBalance: closingBalance.toString(),
          status,
        })
        .returning();

      // If status is posted, reconcile all bank transactions within the date range
      if (status === 'posted') {
        await tx
          .update(bankTransactions)
          .set({
            status: 'reconciled',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankTransactions.bankAccountId, bankAccountId),
              gte(bankTransactions.date, startDate.toISOString().split('T')[0]),
              lte(bankTransactions.date, endDate.toISOString().split('T')[0]),
              eq(bankTransactions.status, 'pending')
            )
          );
      }

      // Register audit log
      await tx.insert(auditLogs).values({
        companyId: auth.companyId,
        userId: auth.userId,
        action: 'bank_reconciliation_created',
        entityType: 'bank_reconciliations',
        entityId: newRecon.id,
        newValues: { bankAccountId, startDate, endDate, openingBalance, closingBalance, status },
        ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
      });

      return newRecon;
    });

    return NextResponse.json(
      { success: true, message: 'Conciliación bancaria registrada exitosamente.', data: recon },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/bank/reconciliations:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
