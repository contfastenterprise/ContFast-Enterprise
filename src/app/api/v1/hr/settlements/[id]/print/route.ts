import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { CompanyRepository } from '@/repositories/companyRepository';
import { PdfGenerator } from '@/services/pdfGenerator';

export async function GET(
  req: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { id: settlementId } = await segmentData.params;

    const settlement = await HRRepository.findSettlementById(settlementId, session.companyId);
    if (!settlement) {
      return NextResponse.json({ success: false, error: { message: 'Liquidación no encontrada' } }, { status: 404 });
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

    // Reconstruct calculation parameters
    const hire = new Date(settlement.hireDate);
    const term = new Date(settlement.settlementDate);
    const diffMs = term.getTime() - hire.getTime();
    const totalDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const yearsOfService = Math.floor(totalDays / 365);
    const monthsOfService = Math.floor((totalDays % 365) / 30);

    const preaviso = parseFloat(settlement.preaviso);
    const cesantia = parseFloat(settlement.cesantia);
    const vacaciones = parseFloat(settlement.vacaciones);
    const navidad = parseFloat(settlement.navidad);
    const otros = parseFloat(settlement.otros);

    const dailyRate = Number(settlement.salary) / 23.83;
    const preavisoDays = preaviso > 0 ? Math.round(preaviso / dailyRate) : 0;
    const cesantiaDays = cesantia > 0 ? Math.round(cesantia / dailyRate) : 0;
    const vacacionesDays = vacaciones > 0 ? Math.round(vacaciones / dailyRate) : 0;

    const calculationData = {
      yearsOfService,
      monthsOfService,
      dailyRate,
      preavisoDays,
      cesantiaDays,
      vacacionesDays,
      preaviso,
      cesantia,
      vacaciones,
      navidad,
    };

    const employeeData = {
      employeeCode: settlement.employeeCode,
      firstName: settlement.firstName,
      lastName: settlement.lastName,
      cedula: settlement.cedula,
      hireDate: settlement.hireDate,
    };

    const pdfBuffer = await PdfGenerator.generateSettlementReceipt(
      companyInfo,
      employeeData,
      calculationData,
      settlement.settlementDate,
      otros
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="liquidacion_${settlementId}.pdf"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
