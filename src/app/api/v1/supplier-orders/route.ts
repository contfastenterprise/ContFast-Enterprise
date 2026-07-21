import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';
import { db, companies } from '@/db';
import { eq } from 'drizzle-orm';

const createOrderSchema = z.object({
  supplierId: z.string().uuid('El suplidor seleccionado no es válido'),
  warehouseId: z.string().uuid('El almacén seleccionado no es válido'),
  expectedDate: z.string().optional().nullable(),
  observations: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid('El producto seleccionado no es válido'),
      brand: z.string().optional().nullable(),
      model: z.string().optional().nullable(),
      quantityRequested: z.number().int().positive('La cantidad debe ser mayor a cero'),
      observations: z.string().optional().nullable(),
    })
  ).min(1, 'El pedido debe tener al menos una línea de producto'),
});

/**
 * GET /api/v1/supplier-orders - Paginated list of supplier orders
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'read');

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const status = searchParams.get('status') || undefined;

    const result = await SupplierOrderService.getOrders(auth.companyId, auth.modo, page, limit, status);

    return NextResponse.json(
      { success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/supplier-orders:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/supplier-orders - Create a supplier order
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'write');

    const body = await req.json();
    const data = createOrderSchema.parse(body);

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

    const result = await SupplierOrderService.createOrder({
      ...data,
      companyId: auth.companyId,
      modo: auth.modo,
    }, auth.userId, company.name);

    return NextResponse.json(
      { success: true, data: result },
      { status: 201, headers: resHeaders }
    );

  } catch (error: any) {
    console.error('Error in POST /api/v1/supplier-orders:', error);
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
