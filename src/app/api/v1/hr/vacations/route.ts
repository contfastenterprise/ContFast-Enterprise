import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { HRRepository } from '@/repositories/hrRepository';
import { PayrollCalculationService } from '@/services/payrollCalculationService';
import { z } from 'zod';

/**
 * Saldo de vacaciones por empleado.
 *
 * El saldo es transaccional: PRUEBA y PRODUCCION llevan cuentas separadas, y
 * todas las consultas van filtradas por companyId + modo de la sesion. Los
 * empleados, en cambio, son catalogo compartido, asi que la lista sale completa
 * en los dos entornos aunque el saldo esté en cero.
 *
 * El permiso lo aplica el proxy: /api/v1/hr queda bajo el modulo `nomina`.
 */

const movimientoSchema = z
  .object({
    employeeId: z.string().uuid('ID de empleado no válido'),
    generatedDays: z.number().int('Los días deben ser enteros').min(0, 'No puede ser negativo').default(0),
    takenDays: z.number().int('Los días deben ser enteros').min(0, 'No puede ser negativo').default(0),
  })
  .refine((d) => d.generatedDays > 0 || d.takenDays > 0, {
    message: 'Indique días generados o días tomados',
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

    const saldos = await HRRepository.findVacations(session.companyId, session.modo);
    const hoy = new Date();

    // `diasSugeridos` es lo que le corresponderia al empleado por antiguedad
    // segun el Art. 177. Se calcula aqui, en el servidor, para que la ley viva
    // en un solo sitio y la pantalla no la duplique. Es una sugerencia: no se
    // aplica sola, la registra quien corresponda desde la pantalla.
    const data = saldos.map((s: any) => {
      const diasSugeridos = PayrollCalculationService.calcularDiasVacacionesPorAntiguedad(s.hireDate, hoy);
      return {
        ...s,
        generatedDays: Number(s.generatedDays || 0),
        takenDays: Number(s.takenDays || 0),
        availableDays: Number(s.availableDays || 0),
        diasSugeridos,
        // Cuanto falta por registrar para llegar a lo que marca la ley.
        diasPorRegistrar: Math.max(0, diasSugeridos - Number(s.generatedDays || 0)),
      };
    });

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

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(session, 'nomina', 'write');
    if (denegado) return denegado;

    const body = await req.json();
    const parsed = movimientoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { employeeId, generatedDays, takenDays } = parsed.data;

    // El saldo disponible no puede quedar negativo: no se pueden tomar dias que
    // no se han generado. La comprobacion se hace aqui porque updateVacationDays
    // acumula sin juzgar, y el repositorio no deberia decidir reglas de negocio.
    if (takenDays > 0) {
      const saldos = await HRRepository.findVacations(session.companyId, session.modo);
      const actual: any = saldos.find((s: any) => s.employeeId === employeeId);
      if (!actual) {
        return NextResponse.json({ success: false, error: { message: 'Empleado no encontrado' } }, { status: 404 });
      }
      const disponible = Number(actual.availableDays || 0) + generatedDays;
      if (takenDays > disponible) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message:
                `No se pueden registrar ${takenDays} días tomados: el empleado tiene ${disponible} ` +
                'disponibles. Registre primero los días generados.',
            },
          },
          { status: 409 }
        );
      }
    }

    const saldo = await HRRepository.updateVacationDays(
      employeeId,
      session.companyId,
      session.modo,
      generatedDays,
      takenDays
    );

    await HRRepository.logAudit(
      session.companyId,
      session.modo,
      session.userId,
      'update_vacations',
      'employee_vacations',
      saldo.id,
      null,
      { employeeId, generatedDays, takenDays, saldo }
    );

    return NextResponse.json({ success: true, data: saldo });
  } catch (error: any) {
    const status = error.message === 'Empleado no encontrado' ? 404 : 500;
    return NextResponse.json({ success: false, error: { message: error.message } }, { status });
  }
}
