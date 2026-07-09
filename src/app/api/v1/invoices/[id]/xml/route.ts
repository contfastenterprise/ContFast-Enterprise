import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
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
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: err.message } },
        { status: 403, headers: resHeaders }
      );
    }

    const invoice = await InvoiceRepository.getById(id, auth.companyId);
    if (!invoice) {
      return new NextResponse('Factura no encontrada.', { status: 404 });
    }

    // Try msellerXmlPath first, then signedXmlPath, then xmlPath
    const filePath = invoice.msellerXmlPath || invoice.signedXmlPath || invoice.xmlPath;
    if (!filePath) {
      return new NextResponse('No hay XML disponible para esta factura.', { status: 404 });
    }

    const resolvedPath = path.resolve(filePath);

    try {
      await fs.access(resolvedPath);
    } catch {
      return new NextResponse('El archivo XML no existe físicamente en el servidor.', { status: 404 });
    }

    const xmlContent = await fs.readFile(resolvedPath);

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/xml');
    headers.set('Content-Disposition', `inline; filename="${invoice.ncf || 'factura'}.xml"`);

    return new NextResponse(xmlContent, { headers });
  } catch (error: any) {
    console.error('Error in XML download stream:', error);
    return new NextResponse(`Error interno al descargar XML: ${error.message}`, { status: 500 });
  }
}
