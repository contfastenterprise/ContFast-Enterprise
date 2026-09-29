import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { verConduce } from '@/services/inventario/verConduce';

/**
 * GET /api/v1/delivery-notes/[id]/detalle -- el conduce para VERLO (lote 223):
 * factura y hora de emision, cliente, numero y, por mercancia, SKU, nombre,
 * cantidad facturada y cuanto falta si no hay bastante.
 *
 * Ruta aparte y no un cambio en `GET [id]`: esa la leen tambien la pantalla al
 * preparar un despacho y la impresion, con los renglones pelados, y cambiarle
 * la forma los romperia sin avisar. Mismo permiso que ver un conduce.
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'read');

    const conduce = await verConduce(id, auth.companyId, auth.modo);
    if (!conduce) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Conduce/Remisión no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json({ success: true, data: conduce }, { headers: resHeaders });
  } catch (error: unknown) {
    console.error('Error in GET /api/v1/delivery-notes/[id]/detalle:', error);
    const e = error as Error & { status?: number; code?: string };
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status: e.status || 500, headers: resHeaders }
    );
  }
}
