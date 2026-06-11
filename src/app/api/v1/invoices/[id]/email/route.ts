import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { CustomerRepository } from '@/repositories/customerRepository';
import { addJob } from '@/infrastructure/queue';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const invoice = await InvoiceRepository.getById(id, auth.companyId);
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (!invoice.customerId) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'La factura no tiene un cliente asociado.' } },
        { status: 400, headers: resHeaders }
      );
    }

    const customer = await CustomerRepository.findById(invoice.customerId, auth.companyId);
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'El cliente asociado no existe o fue eliminado.' } },
        { status: 400, headers: resHeaders }
      );
    }

    if (!customer.email) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'El cliente no tiene un correo electrónico registrado.' } },
        { status: 400, headers: resHeaders }
      );
    }

    // Queue resending the email
    await addJob('emails-sending', 'send-email', {
      to: customer.email,
      subject: `Reenvío de Factura - NCF: ${invoice.ncf}`,
      text: `Estimado(a) ${customer.name},\n\nLe reenviamos su factura NCF: ${invoice.ncf} por un valor total de RD$ ${invoice.total}.\n\nAtentamente,\nContFast`,
      html: `<p>Estimado(a) <strong>${customer.name}</strong>,</p><p>Le reenviamos su factura NCF: <strong>${invoice.ncf}</strong> por un valor total de <strong>RD$ ${invoice.total}</strong>.</p><p>Atentamente,<br/>ContFast</p>`,
    });

    return NextResponse.json(
      { success: true, message: `Correo reenviado exitosamente a ${customer.email}.` },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/invoices/[id]/email:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
