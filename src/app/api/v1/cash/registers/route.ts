import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { CashRepository } from '@/repositories/cashRepository';
import { db, cashRegisters } from '@/db';
import { z } from 'zod';

const createRegisterSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  code: z.string().min(1, 'El código es requerido'),
});

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
    // Enforce "caja:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'read');

    const registers = await CashRepository.listRegisters(auth.companyId);

    return NextResponse.json(
      { success: true, data: registers },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/cash/registers:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

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
    // Enforce "caja:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'caja', 'write');

    const body = await req.json();
    const result = createRegisterSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const { name, code } = result.data;

    const [register] = await db
      .insert(cashRegisters)
      .values({
        companyId: auth.companyId,
        name,
        code: code.toUpperCase(),
        status: 'active',
      })
      .returning();

    return NextResponse.json(
      { success: true, data: register, message: 'Terminal creada exitosamente.' },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/cash/registers:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    
    // Check for unique constraint violation on code
    if (error.code === '23505' || error.message?.includes('unique constraint')) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Ya existe una terminal con ese código en esta empresa.' } },
        { status: 409, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
