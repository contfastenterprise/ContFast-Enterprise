import { NextRequest, NextResponse } from 'next/server';
import { db, invoices, customers, companies, companySettings } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { eq, and, sql, gte, lte, or, ilike, notInArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const status = searchParams.get('status') || undefined;
    const ncf = searchParams.get('ncf') || undefined;
    const ecfType = searchParams.get('ecfType') || undefined;
    const excludeTypesParam = searchParams.get('excludeTypes');
    const excludeTypes = excludeTypesParam ? excludeTypesParam.split(',') : undefined;

    const baseConditions: any[] = [
      eq(invoices.companyId, session.companyId),
      sql`${invoices.deletedAt} IS NULL`,
    ];

    if (excludeTypes && excludeTypes.length > 0) {
      baseConditions.push(notInArray(invoices.ecfType, excludeTypes));
    }

    if (status) {
      baseConditions.push(eq(invoices.status, status as any));
    }

    if (ecfType) {
      baseConditions.push(eq(invoices.ecfType, ecfType));
    }

    if (ncf) {
      const searchCond = or(
        ilike(invoices.ncf, `%${ncf}%`),
        ilike(invoices.buyerName, `%${ncf}%`),
        ilike(invoices.buyerRnc, `%${ncf}%`),
        ilike(customers.name, `%${ncf}%`),
        ilike(customers.rncCedula, `%${ncf}%`)
      );
      if (searchCond) {
        baseConditions.push(searchCond);
      }
    }

    if (startDate) {
      baseConditions.push(gte(invoices.createdAt, new Date(`${startDate}T00:00:00-04:00`)));
    }

    if (endDate) {
      baseConditions.push(lte(invoices.createdAt, new Date(`${endDate}T23:59:59.999-04:00`)));
    }

    const items = await db
      .select({
        id: invoices.id,
        ncf: invoices.ncf,
        ecfType: invoices.ecfType,
        status: invoices.status,
        paymentStatus: invoices.paymentStatus,
        subtotal: invoices.subtotal,
        discount: invoices.discount,
        totalTaxes: invoices.totalTaxes,
        total: invoices.total,
        buyerRnc: invoices.buyerRnc,
        buyerName: invoices.buyerName,
        createdAt: invoices.createdAt,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(...baseConditions))
      .orderBy(sql`${invoices.createdAt} DESC`);

    // Fetch company profile and settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, session.companyId))
      .limit(1);

    if (!company) {
      return new NextResponse('Perfil de compañía no encontrado.', { status: 404 });
    }

    const docData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || '',
        phone: '1-809-555-0199',
        email: settings?.msellerEmail || '',
        logoUrl: settings?.logoUrl || undefined,
      },
      items,
      filters: {
        startDate: startDate || 'Inicio',
        endDate: endDate || 'Hoy',
        status: status || 'all',
      }
    };

    const html = DocumentTemplates.renderInvoicesReport(docData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline; filename="reporte_facturacion.pdf"');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error generating invoices report PDF:', error);
    return new NextResponse(`Error al generar reporte de facturación: ${error.message}`, {
      status: 500
    });
  }
}
