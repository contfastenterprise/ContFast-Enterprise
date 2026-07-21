import { NextRequest, NextResponse } from 'next/server';
import { db, products, inventoryLevels, warehouses } from '@/db';
import { eq, and, isNull, inArray } from 'drizzle-orm';
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
  secondaryBarcodes: z.array(z.object({
    barcode: z.string().min(1),
    barcodeType: z.string()
  })).optional()
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
      let dataWithInventory: any[] = [];
      if (product) {
        const levels = await db
          .select({
            productId: inventoryLevels.productId,
            warehouseId: inventoryLevels.warehouseId,
            warehouseName: warehouses.name,
            quantity: inventoryLevels.quantity,
          })
          .from(inventoryLevels)
          .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
          .where(
            and(
              eq(inventoryLevels.companyId, auth.companyId),
              eq(inventoryLevels.productId, product.id)
            )
          );
        dataWithInventory = [{
          ...product,
          inventory: levels.map(lvl => ({
            warehouseId: lvl.warehouseId,
            warehouseName: lvl.warehouseName,
            quantity: lvl.quantity,
            availableQuantity: lvl.quantity,
          }))
        }];
      }

      const responseData = { 
        success: true, 
        data: dataWithInventory, 
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
    
    // Batch fetch inventory levels for all products in list
    const productIds = result.data.map((p: any) => p.id);
    const inventoryMap: Record<string, any[]> = {};
    if (productIds.length > 0) {
      const levels = await db
        .select({
          productId: inventoryLevels.productId,
          warehouseId: inventoryLevels.warehouseId,
          warehouseName: warehouses.name,
          quantity: inventoryLevels.quantity,
        })
        .from(inventoryLevels)
        .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
        .where(
          and(
            eq(inventoryLevels.companyId, auth.companyId),
            inArray(inventoryLevels.productId, productIds)
          )
        );

      levels.forEach((lvl) => {
        if (!inventoryMap[lvl.productId]) {
          inventoryMap[lvl.productId] = [];
        }
        inventoryMap[lvl.productId].push({
          warehouseId: lvl.warehouseId,
          warehouseName: lvl.warehouseName,
          quantity: lvl.quantity,
          availableQuantity: lvl.quantity,
        });
      });
    }

    const dataWithInventory = result.data.map((p: any) => ({
      ...p,
      inventory: inventoryMap[p.id] || [],
    }));

    const responseDataList = { success: true, data: dataWithInventory, meta: result.meta };

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

    if (data.sku && data.sku.trim()) {
      const [existingSku] = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.companyId, auth.companyId),
            eq(products.sku, data.sku.trim()),
            isNull(products.deletedAt)
          )
        )
        .limit(1);

      if (existingSku) {
        return NextResponse.json(
          { success: false, error: { code: 'SKU_ALREADY_EXISTS', message: 'Ya existe un producto con este SKU.' } },
          { status: 400, headers: resHeaders }
        );
      }
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
