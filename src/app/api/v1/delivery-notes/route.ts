import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { DeliveryRepository } from '@/repositories/deliveryRepository';
import { InvoiceRepository } from '@/repositories/invoiceRepository';

const createDeliveryNoteSchema = z.object({
  invoiceId: z.string().uuid('ID de factura inválido'),
  deliveryDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Fecha de entrega inválida',
  }).transform((val) => new Date(val)),
  driverName: z.string().max(255).optional(),
  driverLicense: z.string().max(50).optional(),
  vehiclePlate: z.string().max(50).optional(),
  dispatcherName: z.string().max(255).optional(),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid('ID de producto inválido'),
      quantity: z.number().positive('La cantidad debe ser mayor a cero'),
    })
  ).min(1, 'Debe incluir al menos un artículo'),
});

/**
 * GET /api/v1/delivery-notes - List delivery notes
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

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);

    const list = await DeliveryRepository.list(auth.companyId, page, perPage);

    return NextResponse.json(
      { success: true, ...list },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/delivery-notes:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/delivery-notes - Create a delivery note linked to an invoice
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
    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const body = await req.json();
    const result = createDeliveryNoteSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const { invoiceId, deliveryDate, driverName, driverLicense, vehiclePlate, dispatcherName, notes, lines } = result.data;

    // Verify invoice exists and belongs to the same company
    const invoice = await InvoiceRepository.getById(invoiceId, auth.companyId);
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Create delivery note
    const note = await DeliveryRepository.create({
      companyId: auth.companyId,
      invoiceId,
      userId: auth.userId,
      deliveryDate,
      driverName,
      driverLicense,
      vehiclePlate,
      dispatcherName,
      notes,
      lines,
    });

    return NextResponse.json(
      { success: true, message: 'Conduce/Remisión de entrega creado exitosamente.', data: note },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/delivery-notes:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
