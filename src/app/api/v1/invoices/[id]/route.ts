import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, dgiiSubmissions, invoices, withTenantMode } from '@/db';
import { eq } from 'drizzle-orm';
import { envioVigente, datosFirmaDeEnvio } from '@/repositories/dgiiSubmissionRepository';

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'read');

    const invoice = await InvoiceRepository.getById(id, auth.companyId, auth.modo);

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Una factura puede tener varios envios: uno por cada intento. Antes esto
    // cogia una fila cualquiera (.limit(1) sin ORDER BY), y de esa fila salen
    // el codigo de seguridad y el QR del comprobante. La eleccion vive ahora
    // en un solo sitio: envioVigente.
    const submission = await envioVigente(id, auth.companyId, auth.modo);

    // Y la lectura del codigo vive en datosFirmaDeEnvio. Aqui habia un
    // `if (!securityCode) securityCode = sha256(id + ncf)...`: se inventaba el
    // codigo de seguridad de un comprobante fiscal cuando no constaba. Ahora
    // cadena vacia significa que no consta, y quien imprime lo dice.
    const { codigo: securityCode } = datosFirmaDeEnvio(submission);

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

export async function DELETE(
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    const invoice = await InvoiceRepository.getById(id, auth.companyId, auth.modo);
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Borrador no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (invoice.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Solo se pueden eliminar facturas en estado borrador.' } },
        { status: 400, headers: resHeaders }
      );
    }

    await db
      .update(invoices)
      .set({ deletedAt: new Date() })
      .where(withTenantMode(invoices, auth, eq(invoices.id, id)));

    return NextResponse.json(
      { success: true, message: 'Borrador eliminado correctamente.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/invoices/[id]:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500, headers: resHeaders }
    );
  }
}
