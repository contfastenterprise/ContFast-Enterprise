import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';

const receiveSchema = z.object({
  receptions: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantityToReceive: z.number().int().nonnegative(),
    })
  ).min(1, 'Debe especificar al menos una recepción'),
});

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

    const body = await req.json();
    const data = receiveSchema.parse(body);

    const result = await SupplierOrderService.registerReception(id, auth.companyId, auth.modo, auth.userId, data.receptions);

    return NextResponse.json(
      { success: true, data: result },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/supplier-orders/[id]/receive:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
