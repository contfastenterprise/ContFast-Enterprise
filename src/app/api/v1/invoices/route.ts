import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { InvoiceService } from '@/services/invoiceService';
import { InvoiceRepository } from '@/repositories/invoiceRepository';

// Zod validation schema for creating an invoice
const createInvoiceSchema = z.object({
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
  cashSessionId: z.string().uuid().optional(),
  ecfType: z.enum(['31', '32', '33', '34', '45'], {
    message: 'Tipo de e-CF inválido. Debe ser 31 (Fiscal), 32 (Consumo), 33 (ND), 34 (NC) o 45 (Gubernamental)',
  }),
  paymentType: z.enum(['cash', 'credit', 'bank_transfer']),
  bankName: z.string().optional(),
  transactionNumber: z.string().optional(),
  notes: z.string().optional(),
  ignoreCommunicationError: z.boolean().optional(),
  modifiedNcf: z.string().length(13, 'El NCF modificado debe tener exactamente 13 caracteres').optional(),
  modifiedInvoiceId: z.string().uuid().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      productName: z.string().min(1, 'El nombre del producto es requerido'),
      quantity: z.number().positive('La cantidad debe ser mayor a cero'),
      unitPrice: z.number().nonnegative('El precio unitario no puede ser negativo'),
      discount: z.number().nonnegative('El descuento no puede ser negativo').default(0),
      taxRate: z.number().nonnegative('La tasa de impuesto no puede ser negativa').default(0.18),
    })
  ).min(1, 'La factura debe tener al menos una línea de producto'),
  retentions: z.array(
    z.object({
      retentionId: z.string().uuid().optional(),
      retentionName: z.string(),
      retentionType: z.enum(['ITBIS', 'ISR', 'OTRA']),
      retentionPercentage: z.number().nonnegative().max(100),
      agentRnc: z.string().optional(),
      retentionDate: z.string().optional(),
    })
  ).optional(),
}).refine((data) => {
  if (data.paymentType === 'bank_transfer') {
    return !!data.bankName && !!data.transactionNumber;
  }
  return true;
}, {
  message: 'El banco y número de transferencia son requeridos para pagos por transferencia.',
  path: ['bankName'],
}).refine((data) => {
  if ((data.ecfType === '33' || data.ecfType === '34') && !data.modifiedNcf) {
    return false;
  }
  return true;
}, {
  message: 'El NCF modificado es requerido para Notas de Crédito y Notas de Débito.',
  path: ['modifiedNcf'],
});

/**
 * GET /api/v1/invoices - Paginated list of invoices
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
    // Enforce "facturacion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    // Parse pagination query parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);

    const result = await InvoiceRepository.list(auth.companyId, page, perPage);

    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/invoices:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/invoices - Create, sign, and issue an invoice
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

  // Rate limit billing creation requests
  const allowed = await checkRateLimit(auth.userId, 'dgii');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas facturas emitidas en poco tiempo. Intente en un minuto.' } },
      { status: 429 }
    );
  }

  try {
    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const body = await req.json();
    const result = createInvoiceSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    // Call service layer to perform all database transactions and PDF/XMLDSIG generation
    const { invoice, msellerResponse } = await InvoiceService.issueInvoice({
      companyId: auth.companyId,
      userId: auth.userId,
      ...result.data,
    });

    return NextResponse.json(
      { success: true, data: invoice, msellerResponse },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/invoices:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
