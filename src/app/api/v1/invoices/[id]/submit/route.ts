import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { db, auditLogs, dgiiSubmissions } from '@/db';
import { addJob } from '@/infrastructure/queue';
import { eq, and } from 'drizzle-orm';

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

    if (invoice.status === 'accepted' || invoice.status === 'submitted') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Esta factura ya ha sido enviada o aceptada por la DGII.' } },
        { status: 400, headers: resHeaders }
      );
    }

    // 1. Create or update dgii_submissions record
    const [submission] = await db
      .insert(dgiiSubmissions)
      .values({
        companyId: auth.companyId,
        invoiceId: invoice.id,
        status: 'pending',
        retryCount: 0,
      })
      .onConflictDoNothing() // or update
      .returning();

    // 2. Queue the BullMQ job for async worker processing
    await addJob('dgii-submissions', 'submit-ecf', {
      companyId: auth.companyId,
      invoiceId: invoice.id,
    });

    // 3. Register audit log
    await db.insert(auditLogs).values({
      companyId: auth.companyId,
      userId: auth.userId,
      action: 'invoice_submitted_to_queue',
      entityType: 'invoices',
      entityId: invoice.id,
      newValues: { ncf: invoice.ncf },
      ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
    });

    // 4. Update local invoice status to submitted
    await InvoiceRepository.updateStatus(invoice.id, auth.companyId, 'submitted');

    return NextResponse.json(
      { success: true, message: 'Envío a la DGII encolado exitosamente.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/invoices/[id]/submit:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
