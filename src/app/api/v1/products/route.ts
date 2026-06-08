import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';

const createProductSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  name: z.string().min(1, 'El nombre del producto es requerido').max(255),
  description: z.string().nullable().optional(),
  price: z.number().nonnegative('El precio base no puede ser negativo').optional(),
  cost: z.number().nonnegative('El costo no puede ser negativo').optional(),
  unitOfMeasure: z.string().min(1, 'La unidad de medida es requerida').max(50).default('unidad'),
  priceConsumidor: z.number().nonnegative('El precio consumidor no puede ser negativo').optional(),
  priceProveedor: z.number().nonnegative('El precio proveedor no puede ser negativo').optional(),
  priceMayorista: z.number().nonnegative('El precio mayorista no puede ser negativo').optional(),
  imageUrl: z.string().nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  status: z.string().max(50).default('active'),
});

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'read');

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const search = searchParams.get('search') || undefined;
    const barcode = searchParams.get('barcode') || undefined;

    if (barcode) {
      const product = await ProductRepository.getByBarcode(barcode, auth.companyId);
      return NextResponse.json(
        { success: true, data: product ? [product] : [], meta: { page: 1, per_page: 1, total: product ? 1 : 0, total_pages: product ? 1 : 0 } },
        { headers: resHeaders }
      );
    }

    const result = await ProductRepository.list(auth.companyId, page, perPage, search);

    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/products:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'write');

    const body = await req.json();
    const result = createProductSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    // Default base price to priceConsumidor if not specified
    const data = { ...result.data };
    if (data.price === undefined && data.priceConsumidor !== undefined) {
      data.price = data.priceConsumidor;
    } else if (data.priceConsumidor === undefined && data.price !== undefined) {
      data.priceConsumidor = data.price;
    }

    const product = await ProductRepository.create({
      companyId: auth.companyId,
      ...data,
    });

    return NextResponse.json(
      { success: true, data: product },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/products:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
