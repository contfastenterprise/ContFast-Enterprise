import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';

/**
 * POST /api/v1/supplier-orders/[id]/cancel -- cancela un pedido a suplidor (lote 252).
 *
 * El boton "Cancelar pedido" mandaba `DELETE` a `/send`, que solo admite `POST`: contestaba 405
 * y la pantalla decia "Error de red". O sea, cancelar un pedido NUNCA funciono, y
 * `SupplierOrderService.cancelOrder` (estado `Cancelled` y su apunte en el historial) existia sin
 * ninguna ruta que lo llamara. No es el `DELETE` de `[id]`: ese borra el pedido (lo esconde), y
 * cancelar lo deja a la vista, cancelado, con su historial. Mismo permiso que borrar.
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'proveedores', 'delete');
    const { id } = await params;

    await SupplierOrderService.cancelOrder(id, auth.companyId, auth.modo, auth.userId);

    return NextResponse.json(
      { success: true, message: 'Pedido cancelado.' },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error in POST /api/v1/supplier-orders/[id]/cancel:', error);
    const e = error as Error & { status?: number; code?: string };
    //  Los dos rechazos del servicio son previstos, no averias.
    const status = e.status || (/no encontrado/i.test(e.message) ? 404 : /no se puede cancelar/i.test(e.message) ? 409 : 500);
    const code = e.code || (status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'SERVER_ERROR');
    return NextResponse.json(
      { success: false, error: { code, message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
