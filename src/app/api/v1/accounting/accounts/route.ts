import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, chartOfAccounts } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { AccountRepository } from '@/repositories/accountRepository';

const createAccountSchema = z.object({
  code: z.string().regex(/^\d+(?:\.\d+)*$/, 'Código de cuenta inválido (ej: 1, 1.1, 1.1.01)'),
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.string().uuid('ID de cuenta padre inválido').optional(),
});

/**
 * GET /api/v1/accounting/accounts - Get chart of accounts
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
    // Enforce "contabilidad:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'contabilidad', 'read');

    const chart = await AccountRepository.getChart(auth.companyId);

    return NextResponse.json(
      { success: true, data: chart },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/accounting/accounts:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/accounting/accounts - Create a new account in the chart of accounts
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
    // Enforce "contabilidad:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'contabilidad', 'write');

    const body = await req.json();
    const result = createAccountSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const { code, name, type, parentId } = result.data;

    // 1. Check if account with the same code already exists for the company
    const existing = await AccountRepository.getAccountByCode(auth.companyId, code);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_ACCOUNT_CODE', message: `Ya existe una cuenta con el código ${code}.` } },
        { status: 409, headers: resHeaders }
      );
    }

    // 2. Validate parent account if provided
    if (parentId) {
      const [parent] = await db
        .select()
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.id, parentId),
            eq(chartOfAccounts.companyId, auth.companyId),
            isNull(chartOfAccounts.deletedAt)
          )
        )
        .limit(1);

      if (!parent) {
        return NextResponse.json(
          { success: false, error: { code: 'PARENT_NOT_FOUND', message: 'La cuenta contable superior especificada no existe.' } },
          { status: 404, headers: resHeaders }
        );
      }
    }

    // 3. Insert new account
    const [newAccount] = await db
      .insert(chartOfAccounts)
      .values({
        companyId: auth.companyId,
        code,
        name,
        type,
        parentId: parentId || null,
        status: 'active',
      })
      .returning();

    return NextResponse.json(
      { success: true, message: 'Cuenta contable creada exitosamente.', data: newAccount },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/accounting/accounts:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
