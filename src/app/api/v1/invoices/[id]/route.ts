import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, dgiiSubmissions } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
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
    const { id } = await params;

    // Enforce "facturacion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const invoice = await InvoiceRepository.getById(id, auth.companyId);

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    let securityCode = '';
    const [submission] = await db
      .select({ responsePayload: dgiiSubmissions.responsePayload })
      .from(dgiiSubmissions)
      .where(eq(dgiiSubmissions.invoiceId, id))
      .limit(1);

    if (submission && submission.responsePayload) {
      try {
        const payload = JSON.parse(submission.responsePayload);
        securityCode = payload.securityCode || payload.codigoSeguridad || '';
      } catch (err) {
        console.error('Error parsing responsePayload for security code:', err);
      }
    }

    if (!securityCode) {
      const crypto = require('crypto');
      securityCode = crypto.createHash('sha256').update(invoice.id + invoice.ncf).digest('hex').substring(0, 16).toUpperCase();
    }

    return NextResponse.json(
      { success: true, data: { ...invoice, securityCode } },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/invoices/[id]:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
