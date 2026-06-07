import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';

const JWT_SECRET = process.env.JWT_SECRET || 'cf_v2_jwt_access_secret_2026_super_secure_9876543210';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  // --- CASE 1: Client has a query token. Verify it and stream the PDF ---
  if (token) {
    try {
      // Verify token authenticity and check that it's for this specific invoice
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded.invoiceId !== id) {
        return new NextResponse('Token de descarga inválido.', { status: 400 });
      }

      const invoice = await InvoiceRepository.getById(id, decoded.companyId);
      if (!invoice || !invoice.pdfPath) {
        return new NextResponse('Factura o archivo PDF no encontrado.', { status: 404 });
      }

      if (!fs.existsSync(invoice.pdfPath)) {
        return new NextResponse('El archivo PDF no se encuentra físicamente en el servidor.', { status: 404 });
      }

      // Stream the PDF file binary back to the client
      const fileBuffer = fs.readFileSync(invoice.pdfPath);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${invoice.ncf}.pdf"`,
        },
      });
    } catch (err: any) {
      return new NextResponse(`Token de descarga expirado o inválido: ${err.message}`, { status: 401 });
    }
  }

  // --- CASE 2: Normal authenticated request. Generate a short-lived download token ---
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

    const invoice = await InvoiceRepository.getById(id, auth.companyId);
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Generate a secure, short-lived JWT token (expires in 5 minutes)
    const downloadToken = jwt.sign(
      { invoiceId: id, companyId: auth.companyId },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    const signedUrl = `/api/v1/invoices/${id}/pdf?token=${downloadToken}`;

    return NextResponse.json(
      {
        success: true,
        data: {
          url: signedUrl,
          expires_in_seconds: 300,
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in generating PDF signed URL:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
