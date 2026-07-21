import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';

const updateOrderSchema = z.object({
  supplierId: z.string().uuid('El suplidor seleccionado no es válido').optional(),
  observations: z.string().optional(),
  generalConditions: z.string().optional(),
  status: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid().optional().nullable(),
      modelo: z.string().optional().nullable(),
      medida: z.string().optional().nullable(),
      colorAcabado: z.string().optional().nullable(),
      linea: z.string().optional().nullable(),
      numHuecosCerradura: z.string().optional().nullable(),
      cantidad: z.number().int().positive('La cantidad debe ser mayor a cero'),
      observaciones: z.string().optional().nullable(),
    })
  ).optional(),
});

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'read');
    const { id } = await params;

    const result = await SupplierOrderService.getOrderById(id, auth.companyId, auth.modo);
    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Pedido no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: result },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/supplier-orders/[id]:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

export async function PUT(
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
    const data = updateOrderSchema.parse(body);

    const result = await SupplierOrderService.updateOrder(id, auth.companyId, auth.modo, data);

    return NextResponse.json(
      { success: true, data: result },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in PUT /api/v1/supplier-orders/[id]:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message, details: error.issues } },
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

export async function DELETE(
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'delete');
    const { id } = await params;

    await SupplierOrderService.deleteOrder(id, auth.companyId, auth.modo);

    return NextResponse.json(
      { success: true, message: 'Pedido eliminado correctamente.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/supplier-orders/[id]:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
