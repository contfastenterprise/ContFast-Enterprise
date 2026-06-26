import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';
import { getCache, setCache, clearCachePattern } from '@/infrastructure/redis';
import { checkRateLimit } from '@/middleware/rateLimiter';

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
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const allowed = await checkRateLimit(ip, 'standard');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
      { status: 429 }
    );
  }

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
    const categoryId = searchParams.get('categoryId') || undefined;
    const barcode = searchParams.get('barcode') || undefined;

    if (barcode) {
      const cacheKeyBarcode = `cache:products:${auth.companyId}:barcode_${barcode}`;
      const cachedBarcode = await getCache(cacheKeyBarcode);
      if (cachedBarcode) {
        return NextResponse.json(JSON.parse(cachedBarcode), { headers: resHeaders });
      }

      const product = await ProductRepository.getByBarcode(barcode, auth.companyId);
      const responseData = { 
        success: true, 
        data: product ? [product] : [], 
        meta: { page: 1, per_page: 1, total: product ? 1 : 0, total_pages: product ? 1 : 0 } 
      };

      await setCache(cacheKeyBarcode, JSON.stringify(responseData), 3600);
      return NextResponse.json(responseData, { headers: resHeaders });
    }

    const cacheKeyList = `cache:products:${auth.companyId}:page_${page}:perPage_${perPage}:search_${search || ''}:cat_${categoryId || ''}`;
    const cachedList = await getCache(cacheKeyList);
    if (cachedList) {
      return NextResponse.json(JSON.parse(cachedList), { headers: resHeaders });
    }

    const result = await ProductRepository.list(auth.companyId, page, perPage, search, categoryId);
    const responseDataList = { success: true, data: result.data, meta: result.meta };

    await setCache(cacheKeyList, JSON.stringify(responseDataList), 3600);

    return NextResponse.json(responseDataList, { headers: resHeaders });
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
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const allowed = await checkRateLimit(ip, 'standard');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
      { status: 429 }
    );
  }

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

    // Invalidate product cache
    await clearCachePattern(`cache:products:${auth.companyId}:*`);

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
