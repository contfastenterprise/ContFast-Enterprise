import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, isAdminOrSistemas } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';

const updateProductSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  name: z.string().min(1, 'El nombre del producto es requerido').max(255).optional(),
  description: z.string().nullable().optional(),
  price: z.number().nonnegative('El precio base no puede ser negativo').optional(),
  cost: z.number().nonnegative('El costo no puede ser negativo').optional(),
  unitOfMeasure: z.string().min(1, 'La unidad de medida es requerida').max(50).optional(),
  priceConsumidor: z.number().nonnegative('El precio consumidor no puede ser negativo').optional(),
  priceProveedor: z.number().nonnegative('El precio proveedor no puede ser negativo').optional(),
  priceMayorista: z.number().nonnegative('El precio mayorista no puede ser negativo').optional(),
  imageUrl: z.string().nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  status: z.string().max(50).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'read');

    const product = await ProductRepository.getById(id, auth.companyId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: product },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error(`Error in GET /api/v1/products/${id}:`, error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'write');

    const body = await req.json();
    const result = updateProductSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const data = { ...result.data };
    if (data.price !== undefined && data.priceConsumidor === undefined) {
      data.priceConsumidor = data.price;
    } else if (data.priceConsumidor !== undefined && data.price === undefined) {
      data.price = data.priceConsumidor;
    }

    const product = await ProductRepository.update(id, auth.companyId, data);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado o no pertenece a su compañía.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: product },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error(`Error in PUT /api/v1/products/${id}:`, error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  try {
    if (!isAdminOrSistemas(auth.role)) {
      return NextResponse.json({
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden eliminar o anular registros.' }
      }, { status: 403, headers: resHeaders });
    }

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'write');

    const product = await ProductRepository.delete(id, auth.companyId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado o no pertenece a su compañía.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Producto eliminado exitosamente.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error(`Error in DELETE /api/v1/products/${id}:`, error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
