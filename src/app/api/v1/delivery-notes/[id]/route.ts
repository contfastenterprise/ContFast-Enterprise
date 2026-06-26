import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, isAdminOrSistemas } from '@/middleware/permissions';
import { DeliveryRepository } from '@/repositories/deliveryRepository';

/**
 * GET /api/v1/delivery-notes/[id] - Get delivery note details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
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

    // Enforce "facturacion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const note = await DeliveryRepository.getById(id, auth.companyId);

    if (!note) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Conduce/Remisión no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: note },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/delivery-notes/[id]:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * DELETE /api/v1/delivery-notes/[id] - Void/Cancel a delivery note
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<any> }
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

    if (!isAdminOrSistemas(auth.role)) {
      return NextResponse.json({
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden eliminar o anular registros.' }
      }, { status: 403, headers: resHeaders });
    }

    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const note = await DeliveryRepository.getById(id, auth.companyId);

    if (!note) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Conduce/Remisión no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (note.status === 'voided') {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_VOIDED', message: 'El conduce ya ha sido anulado anteriormente.' } },
        { status: 400, headers: resHeaders }
      );
    }

    if (note.status === 'approved') {
      await DeliveryRepository.void(id, auth.userId, auth.companyId);
      return NextResponse.json(
        { success: true, message: 'Conduce/Remisión de entrega anulado y revertido stock exitosamente.' },
        { headers: resHeaders }
      );
    } else {
      await DeliveryRepository.softDelete(id, auth.companyId);
      return NextResponse.json(
        { success: true, message: 'Borrador de conduce eliminado exitosamente.' },
        { headers: resHeaders }
      );
    }
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/delivery-notes/[id]:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
