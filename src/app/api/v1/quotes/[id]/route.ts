import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { QuoteService } from '@/services/quoteService';

const updateQuoteSchema = z.object({
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
  ).min(1, 'La cotización debe tener al menos una línea de producto').optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const quote = await QuoteService.getQuote(id);
    if (!quote || quote.companyId !== auth.companyId) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Cotización no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: quote },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/quotes/[id]:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500, headers: resHeaders }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

    const quote = await QuoteService.getQuote(id);
    if (!quote || quote.companyId !== auth.companyId) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Cotización no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    const body = await req.json();
    const data = updateQuoteSchema.parse(body);

    // Enforce role-based discount validation if lines are being updated
    if (data.lines) {
      const hasDiscount = data.lines.some(l => l.discount > 0);
      if (hasDiscount && auth.role !== 'admin' && auth.role !== 'sistema') {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Solo administradores pueden aplicar descuentos.' } },
          { status: 403, headers: resHeaders }
        );
      }
    }

    await QuoteService.updateQuote(id, {
      ...data,
      warehouseId: data.warehouseId || undefined,
      customerId: data.customerId || undefined,
    });

    return NextResponse.json(
      { success: true },
      { headers: resHeaders }
    );

  } catch (error: any) {
    console.error('Error in PUT /api/v1/quotes/[id]:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message, details: error.issues } },
        { status: 400, headers: resHeaders }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500, headers: resHeaders }
    );
  }
}
