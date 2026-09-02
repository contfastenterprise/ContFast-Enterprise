import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { BIRepository, BIFilters } from '@/repositories/biRepository';
import { getCache, setCache } from '@/infrastructure/redis';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  try {
    // 1. Verify Authentication
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
        { status: 401 }
      );
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(auth, 'administracion', 'read');
    if (denegado) return denegado;

    // 2. Enforce Role Check: Only systems or admin roles
    const userRole = (auth.role || '').toLowerCase();
    const isAuthorized = userRole === 'sistemas' || userRole.includes('sistema') || userRole.includes('admin') || userRole.includes('administraci');
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No tiene permisos para acceder a este módulo. Solo administradores o sistemas.' } },
        { status: 403 }
      );
    }

    // 3. Extract Query Parameters
    const url = new URL(req.url);
    const tab = url.searchParams.get('tab') || 'general';
    
    const filters: BIFilters = {
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      warehouseId: url.searchParams.get('warehouseId') || undefined,
      userId: url.searchParams.get('userId') || undefined,
      categoryId: url.searchParams.get('categoryId') || undefined,
      customerId: url.searchParams.get('customerId') || undefined,
      supplierId: url.searchParams.get('supplierId') || undefined,
      status: url.searchParams.get('status') || undefined,
      ecfType: url.searchParams.get('ecfType') || undefined,
    };

    // 4. Caching with Redis
    // Standardize filter properties to make cache key deterministic
    const serializedFilters = JSON.stringify(filters, Object.keys(filters).sort());
    const filterHash = crypto.createHash('md5').update(serializedFilters).digest('hex');
    // El entorno forma parte de la clave. Sin el, el resultado calculado en
    // PRODUCCION se servia durante cinco minutos a quien estuviera en PRUEBA, y
    // al reves: arreglar las consultas sin tocar esto no habria servido de nada.
    const cacheKey = `cache:bi:${auth.companyId}:${auth.modo}:${tab}:${filterHash}`;

    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json({
        success: true,
        cached: true,
        data: JSON.parse(cachedData)
      });
    }

    // 5. Execute Repository Aggregation Queries based on tab
    let result: any = null;

    switch (tab) {
      case 'general':
        result = await BIRepository.getGeneralStats(auth.companyId, auth.modo, filters);
        break;
      case 'products':
        result = await BIRepository.getProductStats(auth.companyId, auth.modo, filters);
        break;
      case 'inventory':
        result = await BIRepository.getInventoryStats(auth.companyId, auth.modo, filters);
        break;
      case 'customers':
        result = await BIRepository.getCustomerStats(auth.companyId, auth.modo, filters);
        break;
      case 'billing':
        result = await BIRepository.getBillingStats(auth.companyId, auth.modo, filters);
        break;
      case 'purchases':
        result = await BIRepository.getPurchaseStats(auth.companyId, auth.modo, filters);
        break;
      default:
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_TAB', message: `La pestaña '${tab}' no es válida.` } },
          { status: 400 }
        );
    }

    // 6. Save in cache (expiry: 5 minutes = 300 seconds)
    if (result) {
      await setCache(cacheKey, JSON.stringify(result), 300);
    }

    return NextResponse.json({
      success: true,
      cached: false,
      data: result
    });
  } catch (err: any) {
    console.error('[BI API Endpoint Error]:', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}
