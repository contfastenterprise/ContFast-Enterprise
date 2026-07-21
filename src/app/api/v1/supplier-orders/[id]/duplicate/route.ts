import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';
import { db, companies } from '@/db';
import { eq } from 'drizzle-orm';

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'write');
    const { id } = await params;

    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, auth.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Empresa no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    const result = await SupplierOrderService.duplicateOrder(id, auth.companyId, auth.modo, auth.userId, company.name);

    return NextResponse.json(
      { success: true, data: result },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/supplier-orders/[id]/duplicate:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
