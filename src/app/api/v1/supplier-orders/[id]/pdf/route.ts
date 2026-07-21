import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resHeaders = new Headers();
    const auth = await verifyAuth(req, resHeaders);

    if (!auth) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    try {
      await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'read');
    } catch (err: any) {
      return new NextResponse('Sin permisos', { status: 403 });
    }

    const { id } = await params;
    const order = await SupplierOrderService.getOrderById(id, auth.companyId, auth.modo);
    if (!order) {
      return new NextResponse('Pedido no encontrado', { status: 404 });
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, auth.companyId))
      .limit(1);

    if (!company) {
      return new NextResponse('Perfil de empresa no encontrado', { status: 404 });
    }

    const companyData = {
      name: company.name,
      rnc: company.rnc,
      address: company.address || '',
      phone: '',
      email: settings?.msellerEmail || company.email || '',
      logoUrl: settings?.logoUrl || undefined,
    };

    const data = {
      order,
      company: companyData,
      lines: order.lines,
    };

    const html = DocumentTemplates.renderSupplierOrder(data);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="Pedido_${order.orderNumber}.pdf"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers
    });
  } catch (error: any) {
    console.error('Error generating Supplier Order PDF:', error);
    return new NextResponse(`Error interno al generar PDF: ${error.message}`, { status: 500 });
  }
}
