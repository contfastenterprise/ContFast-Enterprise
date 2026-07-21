import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;

    // Fetch all supplier orders without pagination limit
    const result = await SupplierOrderService.getOrders(auth.companyId, auth.modo, 1, 100000, status);

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
      address: company.address || 'Santiago, R.D.',
      phone: '829-214-4128',
      email: settings?.msellerEmail || company.email || 'latindoors@gmail.com',
      logoUrl: settings?.logoUrl || undefined,
    };

    const docData = {
      company: companyData,
      items: result.items,
      filters: {
        status: status || 'Todos',
      }
    };

    const html = DocumentTemplates.renderSupplierOrderListReport(docData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline; filename="reporte_pedidos_suplidores.pdf"');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers
    });
  } catch (error: any) {
    console.error('Error generating Supplier Orders report PDF:', error);
    return new NextResponse(`Error interno al generar PDF: ${error.message}`, { status: 500 });
  }
}
