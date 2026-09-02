import { NextRequest, NextResponse } from 'next/server';
import { db, companies, companySettings } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { ApRepository } from '@/repositories/apRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'proveedores', 'read');
    if (denegado) return denegado;

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    // Pendientes: SIN filtro de fecha. Son un worklist accionable y los cheques en
    // garantia son post-fechados; filtrarlos por fecha de emision los ocultaba.
    const { items: pendingItems } = await ApRepository.getPayments(session.companyId, {
      status: 'pending_guarantee',
      modo: session.modo,
      limit: 1000
    });

    // Aplicados: el rango aplica sobre la fecha REAL de cobro (checks.cleared_date).
    const { items: appliedItems } = await ApRepository.getPayments(session.companyId, {
      status: 'applied',
      dateField: 'cleared',
      startDate,
      endDate,
      modo: session.modo,
      limit: 1000
    });

    const isGuaranteeCheck = (p: any) => p.isGuarantee === true;
    const pendingChecks = pendingItems.filter(isGuaranteeCheck);
    const appliedChecks = appliedItems.filter(isGuaranteeCheck);

    // Fetch company info
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
        phone: '',
        logoUrl: settings?.logoUrl || undefined,
      },
      pendingChecks,
      appliedChecks,
      filters: {
        startDate: startDate || 'Inicio',
        endDate: endDate || 'Hoy',
      }
    };

    const html = DocumentTemplates.renderGuaranteeChecksReport(docData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline; filename="reporte_cheques_garantia.pdf"');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error generating guarantee checks report PDF:', error);
    return new NextResponse(`Error al generar reporte: ${error.message}`, {
      status: 500
    });
  }
}
