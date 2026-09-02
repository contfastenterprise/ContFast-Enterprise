import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
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

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'nomina', 'read');
    if (denegado) return denegado;

    const { id: settlementId } = await segmentData.params;

    const settlement = await HRRepository.findSettlementById(settlementId, session.companyId, session.modo);
    if (!settlement) {
      return NextResponse.json({ success: false, error: { message: 'Liquidación no encontrada' } }, { status: 404 });
    }

    const company = await CompanyRepository.getProfile(session.companyId);
    // Sin empresa NO se imprime. `companies.name` es NOT NULL, asi que el
    // `company?.name || 'Latin Doors SRL'` que habia aqui no cubria "empresa
    // sin nombre": solo saltaba cuando la BUSQUEDA fallaba, y entonces emitia
    // un documento laboral a nombre de OTRA empresa, con RNC "N/A". Un
    // descargo de prestaciones con el emisor equivocado no vale nada, y
    // ademas engana a quien lo firma. Mejor no emitirlo.
    if (!company) {
      return NextResponse.json(
        { success: false, error: { message: 'No se encontro la empresa emisora. No se emite el documento.' } },
        { status: 404 }
      );
    }
    const settings = await CompanyRepository.getSettings(session.companyId);
    const companyInfo = {
      name: company.name,
      rnc: company.rnc,
      logoUrl: settings?.logoUrl || undefined,
      phone: undefined,
      email: company.email || undefined,
      address: company.address || undefined,
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

    const employeeName = `${employeeData.firstName} ${employeeData.lastName}`.trim() || 'Empleado';
    const reason = 'Liquidacion';
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const printDate = `${day}-${month}-${year}`;

    const cleanEmployeeName = employeeName.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const finalFilename = `${cleanEmployeeName} - ${reason} - ${printDate}.pdf`;

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
