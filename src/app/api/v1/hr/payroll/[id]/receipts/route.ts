import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { CompanyRepository } from '@/repositories/companyRepository';
import { PdfGenerator } from '@/services/pdfGenerator';

export async function GET(
  req: NextRequest,
  segmentData: { params: Promise<any> }
) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { id: payrollId } = await segmentData.params;
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');

    const payroll = await HRRepository.findPayrollById(payrollId, session.companyId);
    if (!payroll) {
      return NextResponse.json({ success: false, error: { message: 'Nómina no encontrada' } }, { status: 404 });
    }

    let details = await HRRepository.findPayrollDetails(payrollId, session.companyId);
    if (employeeId) {
      details = details.filter(d => d.employeeId === employeeId);
      if (details.length === 0) {
        return NextResponse.json({ success: false, error: { message: 'Detalle no encontrado para el empleado especificado' } }, { status: 404 });
      }
    }

    const company = await CompanyRepository.getProfile(session.companyId);
    const settings = await CompanyRepository.getSettings(session.companyId);

    const companyInfo = {
      name: company?.name || 'Latin Doors SRL',
      rnc: company?.rnc || 'N/A',
      logoUrl: settings?.logoUrl || undefined,
      phone: undefined,
      email: company?.email || undefined,
      address: company?.address || undefined,
    };

    const pdfBuffer = await PdfGenerator.generatePayrollReceipts(companyInfo, payroll, details);

    let targetName = 'General';
    if (employeeId && details.length > 0) {
      const firstDetail = details[0] as any;
      targetName = firstDetail.employeeName || `${firstDetail.firstName || ''} ${firstDetail.lastName || ''}`.trim() || 'Empleado';
    } else {
      targetName = payroll.periodStart && payroll.periodEnd 
        ? `Nomina_${payroll.periodStart}_al_${payroll.periodEnd}` 
        : `Nomina_${payrollId.slice(0, 8)}`;
    }
    const reason = 'Volante de Nomina';
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const printDate = `${day}-${month}-${year}`;

    const cleanTargetName = targetName.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const finalFilename = `${cleanTargetName} - ${reason} - ${printDate}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${finalFilename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
