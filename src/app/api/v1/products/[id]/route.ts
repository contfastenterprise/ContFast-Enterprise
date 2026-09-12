import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, isAdminOrSistemas } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';
import { getCache, setCache, clearCachePattern } from '@/infrastructure/redis';
import { checkRateLimit } from '@/middleware/rateLimiter';

// El esquema vivia aqui, y su gemelo en `../route.ts`. El parcial es el mismo
// objeto con todo opcional: ausente sigue queriendo decir "no lo toques".
import { esquemaProductoParcial, completarPrecios, erroresPorCampo } from '@/schemas/producto';

type RouteContext = {
  params: Promise<any>;
};

export async function GET(req: NextRequest, context: RouteContext) {
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

  const { id } = await context.params;

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'read');

    const cacheKey = `cache:products:${auth.companyId}:id_${id}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: resHeaders });
    }

    const product = await ProductRepository.getById(id, auth.companyId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    const responseData = { success: true, data: product };
    await setCache(cacheKey, JSON.stringify(responseData), 3600);

    return NextResponse.json(responseData, { headers: resHeaders });
  } catch (error: unknown) {
    console.error(`Error in GET /api/v1/products/${id}:`, error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: e.message } },
      { status, headers: resHeaders }
    );
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
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

  const { id } = await context.params;

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');

    const body = await req.json();
    const result = esquemaProductoParcial.safeParse(body);

    if (!result.success) {
      const campos = erroresPorCampo(result.error);
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message, fields: campos } },
        { status: 400, headers: resHeaders }
      );
    }

    // Las dos ramas estaban escritas al reves que en el alta -- equivalentes,
    // porque las condiciones se excluyen, pero dos copias de la misma regla.
    const data = completarPrecios({ ...result.data });

    const product = await ProductRepository.update(id, auth.companyId, data);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado o no pertenece a su compañía.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Invalidate product cache
    await clearCachePattern(`cache:products:${auth.companyId}:*`);

    return NextResponse.json(
      { success: true, data: product },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error(`Error in PUT /api/v1/products/${id}:`, error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: e.message } },
      { status, headers: resHeaders }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
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

  const { id } = await context.params;

  try {
    if (!isAdminOrSistemas(auth.role)) {
      return NextResponse.json({
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden eliminar o anular registros.' }
      }, { status: 403, headers: resHeaders });
    }

    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'catalogo', 'write');

    const product = await ProductRepository.delete(id, auth.companyId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Producto no encontrado o no pertenece a su compañía.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Invalidate product cache
    await clearCachePattern(`cache:products:${auth.companyId}:*`);

    return NextResponse.json(
      { success: true, message: 'Producto eliminado exitosamente.' },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error(`Error in DELETE /api/v1/products/${id}:`, error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
