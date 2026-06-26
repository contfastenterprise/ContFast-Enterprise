import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { db, auditLogs, dgiiSubmissions } from '@/db';
import { addJob } from '@/infrastructure/queue';
import { eq, and } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<any> }
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

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const invoice = await InvoiceRepository.getById(id, auth.companyId);

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Only allow resubmission if status is rejected or failed
    if (!['rejected', 'failed', 'draft', 'signed'].includes(invoice.status)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: `No se puede reenviar una factura en estado "${invoice.status}". Solo facturas rechazadas o fallidas pueden ser reenviadas.`,
          },
        },
        { status: 400, headers: resHeaders }
      );
    }

    // Create a fresh dgii_submissions record for this resubmission
    const [submission] = await db
      .insert(dgiiSubmissions)
      .values({
        companyId: auth.companyId,
        invoiceId: invoice.id,
        status: 'pending',
        retryCount: 0,
      })
      .returning();

    // Queue BullMQ job
    await addJob('dgii-submissions', 'submit-ecf', {
      companyId: auth.companyId,
      invoiceId: invoice.id,
    });

    // Update invoice status to submitted
    await InvoiceRepository.updateStatus(invoice.id, auth.companyId, 'submitted');

    // Audit log
    await db.insert(auditLogs).values({
      companyId: auth.companyId,
      userId: auth.userId,
      action: 'invoice_resubmitted_to_dgii',
      entityType: 'invoices',
      entityId: invoice.id,
      newValues: { ncf: invoice.ncf, submissionId: submission?.id },
      ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Reenvío a la DGII encolado exitosamente.',
        submissionId: submission?.id,
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/ecf/[id]/resubmit:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
