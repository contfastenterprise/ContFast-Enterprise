import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { DeliveryRepository } from '@/repositories/deliveryRepository';

/**
 * POST /api/v1/delivery-notes/[id]/approve - Approve a delivery note and deduct stock
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

    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const result = await DeliveryRepository.approve(id, auth.userId, auth.companyId);

    return NextResponse.json(
      { success: true, message: `Conduce ${result.deliveryNumber} aprobado y stock descontado exitosamente.`, data: result },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/delivery-notes/[id]/approve:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
