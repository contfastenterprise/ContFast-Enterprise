import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { ReportRepository } from '@/repositories/reportRepository';
import { PdfGenerator } from '@/services/pdfGenerator';

// pdfkit usa módulos nativos de Node.js (fs, Buffer, crypto).
// Forzar el runtime de Node.js para que funcione en Next.js App Router.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!type) {
      return NextResponse.json({ success: false, error: { message: 'Tipo de reporte requerido' } }, { status: 400 });
    }

    const companyInfo = await ReportRepository.getCompanyInfo(session.companyId);
    if (!companyInfo) {
      return NextResponse.json({ success: false, error: { message: 'Empresa no encontrada' } }, { status: 404 });
    }

    let pdfBuffer: Buffer;
    let filename = '';

    if (type === 'income_statement') {
      if (!start || !end) {
        return NextResponse.json({ success: false, error: { message: 'Fechas requeridas' } }, { status: 400 });
      }
      const data = await ReportRepository.getIncomeStatement(session.companyId, start, end);
      pdfBuffer = await PdfGenerator.generateIncomeStatement(
        { name: companyInfo.name, rnc: companyInfo.rnc, logoUrl: companyInfo.logoUrl || undefined },
        start,
        end,
        data
      );
      filename = `Estado_Resultados_${start}_${end}.pdf`;
    } 
    else if (type === 'balance_sheet') {
      const asOf = end || new Date().toISOString().split('T')[0];
      const data = await ReportRepository.getBalanceSheet(session.companyId, asOf);
      pdfBuffer = await PdfGenerator.generateBalanceSheet(
        { name: companyInfo.name, rnc: companyInfo.rnc, logoUrl: companyInfo.logoUrl || undefined },
        asOf,
        data
      );
      filename = `Balance_General_${asOf}.pdf`;
    } 
    else if (type === 'ar_statement') {
      const customerId = searchParams.get('customerId');
      if (!customerId) {
        return NextResponse.json({ success: false, error: { message: 'Cliente requerido' } }, { status: 400 });
      }
      const asOf = end || new Date().toISOString().split('T')[0];
      const data = await ReportRepository.getARStatement(session.companyId, customerId);
      
      pdfBuffer = await PdfGenerator.generateARStatement(
        { name: companyInfo.name, rnc: companyInfo.rnc, logoUrl: companyInfo.logoUrl || undefined },
        { name: data.customer.name, rnc: data.customer.rncCedula || '', phone: data.customer.phone || '' },
        asOf,
        data
      );
      filename = `Estado_Cuentas_${data.customer.name.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    }
    else {
      return NextResponse.json({ success: false, error: { message: 'Tipo de reporte no soportado' } }, { status: 400 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${filename}"`);
    headers.set('Content-Length', String(pdfBuffer.length));
    headers.set('Cache-Control', 'no-store');

    return new NextResponse(pdfBuffer as any, { headers });
  } catch (err: any) {
    console.error('Error generating PDF:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
