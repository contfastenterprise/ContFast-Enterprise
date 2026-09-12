import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { HRRepository } from '@/repositories/hrRepository';
import { PayrollCalculationService } from '@/services/payrollCalculationService';
import { z } from 'zod';
import { mesesEnElAnio } from '@/services/hr/antiguedad';

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

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'nomina', 'read');
    if (denegado) return denegado;

    const data = await HRRepository.findSettlements(session.companyId, session.modo);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'nomina', 'write');
    if (denegado) return denegado;

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

    // Meses trabajados en el año natural de la salida, para la regalia.
    //
    // Aqui vivia el fallo del 1 de enero: `new Date('2026-01-01')` es medianoche
    // UTC, y `getFullYear()` en RD lo lee como 2025. La cuenta arrancaba el 1 de
    // enero del año ANTERIOR y acumulaba un año entero de salario devengado en
    // vez de cero -- con un sueldo de 40.000, 40.021 de regalia en lugar de 0.
    //
    // El resto del año salia bien por accidente: la resta entre una medianoche
    // UTC y una LOCAL salia cuatro horas corta y el `Math.ceil` la devolvia al
    // numero bueno. El desajuste estaba entero; lo tapaba un redondeo que nadie
    // habia puesto para eso.
    const activeMonths = mesesEnElAnio(emp.hireDate, terminationDate);

    const accumulatedNavidadBase = Number(emp.salary) * activeMonths;

    const calculation = PayrollCalculationService.calculateSettlement({
      hireDate: emp.hireDate,
      terminationDate,
      salary: Number(emp.salary),
      includePreaviso,
      includeCesantia,
      vacacionesPendientesDays,
      accumulatedNavidadBase,
    });

    const totalCalculated = calculation.preaviso + calculation.cesantia + calculation.vacaciones + calculation.navidad + otros;

    if (action === 'save') {
      const record = await HRRepository.createSettlement(session.companyId, session.modo, {
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

      await HRRepository.logAudit(session.companyId, session.modo, session.userId, 'create_settlement', 'employee_settlements', record.id, null, record);

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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'nomina', 'write');
    if (denegado) return denegado;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: { message: 'ID es obligatorio' } }, { status: 400 });
    }

    const deleted = await HRRepository.deleteSettlement(id, session.companyId, session.modo);
    if (deleted) {
      await HRRepository.logAudit(session.companyId, session.modo, session.userId, 'delete_settlement', 'employee_settlements', id, deleted, null);
    }

    return NextResponse.json({ success: true, message: 'Liquidación eliminada' });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });
  }
}
