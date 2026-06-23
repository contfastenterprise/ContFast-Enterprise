import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { PayrollCalculationService } from '@/services/payrollCalculationService';
import { z } from 'zod';

const calculateSettlementSchema = z.object({
  employeeId: z.string().uuid('ID de empleado no válido'),
  terminationDate: z.string().min(1, 'La fecha de salida es obligatoria'),
  includePreaviso: z.boolean().default(true),
  includeCesantia: z.boolean().default(true),
  vacacionesPendientesDays: z.number().nonnegative().default(0),
  action: z.enum(['calculate', 'save']).default('calculate'),
  status: z.enum(['calculated', 'paid', 'cancelled']).default('calculated'),
  otros: z.number().default(0),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const data = await HRRepository.findSettlements(session.companyId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = calculateSettlementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const { employeeId, terminationDate, includePreaviso, includeCesantia, vacacionesPendientesDays, action, status, otros } = parsed.data;

    // Fetch employee
    const emp = await HRRepository.findEmployeeById(employeeId, session.companyId);
    if (!emp) {
      return NextResponse.json({ success: false, error: { message: 'Empleado no encontrado' } }, { status: 404 });
    }

    const hire = new Date(emp.hireDate);
    const term = new Date(terminationDate);
    
    // Start of current calendar year
    const startOfCurrentYear = new Date(term.getFullYear(), 0, 1);
    const startWagesAccumDate = hire > startOfCurrentYear ? hire : startOfCurrentYear;
    
    // Calculate fractional months worked this calendar year
    const activeTimeMs = term.getTime() - startWagesAccumDate.getTime();
    const activeDays = Math.max(0, Math.ceil(activeTimeMs / (1000 * 60 * 60 * 24)));
    const activeMonths = activeDays / 30.4;
    
    const accumulatedNavidadBase = Number(emp.salary) * activeMonths;

    const calculation = PayrollCalculationService.calculateSettlement({
      hireDate: hire,
      terminationDate: term,
      salary: Number(emp.salary),
      includePreaviso,
      includeCesantia,
      vacacionesPendientesDays,
      accumulatedNavidadBase,
    });

    const totalCalculated = calculation.preaviso + calculation.cesantia + calculation.vacaciones + calculation.navidad + otros;

    if (action === 'save') {
      const record = await HRRepository.createSettlement(session.companyId, {
        employeeId,
        preaviso: calculation.preaviso,
        cesantia: calculation.cesantia,
        vacaciones: calculation.vacaciones,
        navidad: calculation.navidad,
        otros,
        total: totalCalculated,
        status,
        settlementDate: terminationDate,
      });

      await HRRepository.logAudit(session.companyId, session.userId, 'create_settlement', 'employee_settlements', record.id, null, record);

      return NextResponse.json({
        success: true,
        data: {
          employee: {
            id: emp.id,
            firstName: emp.firstName,
            lastName: emp.lastName,
            employeeCode: emp.employeeCode,
            salary: emp.salary,
            hireDate: emp.hireDate,
          },
          calculation,
          record,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        employee: {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          employeeCode: emp.employeeCode,
          salary: emp.salary,
          hireDate: emp.hireDate,
        },
        calculation: {
          ...calculation,
          monthsOfService: calculation.monthsOfService,
          yearsOfService: calculation.yearsOfService,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: { message: 'ID es obligatorio' } }, { status: 400 });
    }

    const deleted = await HRRepository.deleteSettlement(id, session.companyId);
    if (deleted) {
      await HRRepository.logAudit(session.companyId, session.userId, 'delete_settlement', 'employee_settlements', id, deleted, null);
    }

    return NextResponse.json({ success: true, message: 'Liquidación eliminada' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
