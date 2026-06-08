import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { ReportRepository } from '@/repositories/reportRepository';
import { PdfGenerator } from '@/services/pdfGenerator';

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
        { name: companyInfo.name, rnc: companyInfo.rnc },
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
        { name: companyInfo.name, rnc: companyInfo.rnc },
        asOf,
        data
      );
      filename = `Balance_General_${asOf}.pdf`;
    } 
    else {
      return NextResponse.json({ success: false, error: { message: 'Tipo de reporte no soportado' } }, { status: 400 });
    }

    // Return the PDF buffer directly
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${filename}"`);

    return new NextResponse(pdfBuffer as unknown as BodyInit, { headers });
  } catch (err: any) {
    console.error('Error generating PDF:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
