import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, isAdminOrSistemas } from '@/middleware/permissions';
import { QuoteService } from '@/services/quoteService';

const createQuoteSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().positive('La cantidad debe ser mayor a cero'),
      unitPrice: z.number().nonnegative('El precio unitario no puede ser negativo'),
      discount: z.number().nonnegative('El descuento no puede ser negativo').default(0),
      taxRate: z.number().nonnegative('La tasa de impuesto no puede ser negativa').default(0.18),
    })
  ).min(1, 'La cotización debe tener al menos una línea de producto'),
});

/**
 * GET /api/v1/quotes - Paginated list of quotes
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
    // Assuming quotes use 'facturacion' permission for now, or maybe a new 'cotizaciones' permission.
    // To be safe we will use facturacion permission.
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('limit') || '50', 10);
    const status = searchParams.get('status') || undefined;

    const result = await QuoteService.getQuotes(auth.companyId, page, perPage, status);

    return NextResponse.json(
      { success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages, stats: result.stats } },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/quotes:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/quotes - Create a quote
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const body = await req.json();
    const data = createQuoteSchema.parse(body);

    // Enforce role-based discount validation
    const hasDiscount = data.lines.some(l => l.discount > 0);
    if (hasDiscount && !isAdminOrSistemas(auth.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Solo administradores pueden aplicar descuentos.' } },
        { status: 403, headers: resHeaders }
      );
    }

    const result = await QuoteService.createQuote({
      ...data,
      companyId: auth.companyId,
      userId: auth.userId,
      warehouseId: data.warehouseId || undefined,
      customerId: data.customerId || undefined,
    });

    return NextResponse.json(
      { success: true, data: result },
      { status: 201, headers: resHeaders }
    );

  } catch (error: any) {
    console.error('Error in POST /api/v1/quotes:', error);
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
