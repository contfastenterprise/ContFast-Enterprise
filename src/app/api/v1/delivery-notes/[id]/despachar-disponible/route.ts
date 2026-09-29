import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { DeliveryRepository } from '@/repositories/deliveryRepository';

/**
 * POST /api/v1/delivery-notes/[id]/despachar-disponible (lote 224)
 *
 * Despacha lo que hay de un borrador y deja el resto en un borrador nuevo de la
 * misma factura. Mismo permiso que aprobar: por dentro ES la aprobacion de
 * siempre (descuenta existencia y asienta costo de venta), solo que de una
 * parte. Ver `DeliveryRepository.despacharLoDisponible`.
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    const r = await DeliveryRepository.despacharLoDisponible(id, auth.userId, auth.companyId, auth.modo);
    const message = r.pendiente
      ? `Conduce ${r.despachado} despachado con lo disponible. Lo pendiente quedó en el conduce ${r.pendiente}.`
      : `Conduce ${r.despachado} despachado completo.`;

    return NextResponse.json({ success: true, message, data: r }, { headers: resHeaders });
  } catch (error: unknown) {
    console.error('Error in POST /api/v1/delivery-notes/[id]/despachar-disponible:', error);
    const e = error as Error & { status?: number; code?: string };
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status: e.status || 500, headers: resHeaders }
    );
  }
}
