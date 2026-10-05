import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { HRRepository } from '@/repositories/hrRepository';
import { asientoDeLaNomina } from '@/services/nomina/asentarNomina';
import { z } from 'zod';
import { bloqueoSinPlanVigente } from '@/services/suscripcion/planRepositorio';
import { cuerpoDelBloqueo } from '@/services/suscripcion/planVigente';
import { NominaNoPermitidaError } from '@/services/nomina/estadoDeNomina';

/**
 * Lote 290: una transicion que la regla de estados no admite (recalcular una
 * aprobada, aprobar sin detalle, calcular sin la escala del ISR del año) es un
 * conflicto con el estado de la nomina: 409 con el motivo, no un 500.
 */
function respuestaDeError(error: unknown) {
  if (error instanceof NominaNoPermitidaError) {
    return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });
}

const createPayrollSchema = z.object({
  periodStart: z.string().min(1, 'La fecha de inicio es obligatoria'),
  periodEnd: z.string().min(1, 'La fecha de fin es obligatoria'),
  paymentDate: z.string().min(1, 'La fecha de pago es obligatoria'),
  frequency: z.enum(['mensual', 'quincenal', 'semanal']).optional().default('mensual'),
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

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const payroll = await HRRepository.findPayrollById(id, session.companyId, session.modo);
      if (!payroll) {
        return NextResponse.json({ success: false, error: { message: 'Nómina no encontrada' } }, { status: 404 });
      }
      // Lote 290: si se calcula con la escala del ISR de otro año, la pantalla lo dice.
      // Lote 293: y el asiento de devengo que registro la aprobacion (null si no tiene).
      // Las tres lecturas no dependen entre si: a la vez.
      const [details, avisoIsr, asiento] = await Promise.all([
        HRRepository.findPayrollDetails(id, session.companyId, session.modo),
        HRRepository.avisoDeEscalaIsr(payroll),
        asientoDeLaNomina(id, session.companyId, session.modo),
      ]);
      return NextResponse.json({ success: true, data: { payroll, details, avisoIsr, asiento } });
    }

    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const result = await HRRepository.findPayrolls(session.companyId, session.modo, limit, offset);

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (error: unknown) {
    return respuestaDeError(error);
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

    // Lote 299: crear una nomina es CALCULARLA. Plan vigente con la regla unica
    // (`trialing` en su periodo cuenta; antes no), y el mismo `code` que el resto.
    const bloqueoDelPlan = await bloqueoSinPlanVigente(session.companyId);
    if (bloqueoDelPlan) {
      return NextResponse.json(cuerpoDelBloqueo(bloqueoDelPlan), { status: bloqueoDelPlan.status });
    }

    const body = await req.json();
    const parsed = createPayrollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const payroll = await HRRepository.createPayroll(session.companyId, session.modo, {
      ...parsed.data,
      createdBy: session.userId,
    });

    await HRRepository.logAudit(session.companyId, session.modo, session.userId, 'create_payroll', 'payrolls', payroll.id, null, payroll);

    return NextResponse.json({ success: true, data: payroll, aviso: payroll.avisoIsr }, { status: 201 });
  } catch (error: unknown) {
    return respuestaDeError(error);
  }
}

export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const action = body.action; // 'recalculate' | 'approve'

    // Lote 299: recalcular y aprobar (que asienta el devengo, lote 293) exigen plan
    // vigente. Eliminar no: no crea nada.
    if (action === 'recalculate' || action === 'approve') {
      const bloqueoDelPlan = await bloqueoSinPlanVigente(session.companyId);
      if (bloqueoDelPlan) {
        return NextResponse.json(cuerpoDelBloqueo(bloqueoDelPlan), { status: bloqueoDelPlan.status });
      }
    }

    if (action === 'recalculate') {
      const { avisoIsr } = await HRRepository.recalculatePayroll(id, session.companyId, session.modo);
      const payroll = await HRRepository.findPayrollById(id, session.companyId, session.modo);
      await HRRepository.logAudit(session.companyId, session.modo, session.userId, 'recalculate_payroll', 'payrolls', id, null, payroll);
      return NextResponse.json({ success: true, message: 'Nómina recalculada exitosamente', aviso: avisoIsr });
    }

    if (action === 'approve') {
      // Lote 293: aprobar registra el asiento de devengo; la respuesta lo nombra.
      const { asiento } = await HRRepository.approvePayroll(id, session.companyId, session.modo, session.userId);
      return NextResponse.json({ success: true, message: 'Nómina aprobada exitosamente', data: { asiento } });
    }

    return NextResponse.json({ success: false, error: { message: 'Acción no válida' } }, { status: 400 });
  } catch (error: unknown) {
    return respuestaDeError(error);
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

    const oldPayroll = await HRRepository.findPayrollById(id, session.companyId, session.modo);
    await HRRepository.deletePayroll(id, session.companyId, session.modo);

    await HRRepository.logAudit(session.companyId, session.modo, session.userId, 'delete_payroll', 'payrolls', id, oldPayroll, null);

    return NextResponse.json({ success: true, message: 'Nómina eliminada/cancelada exitosamente' });
  } catch (error: unknown) {
    return respuestaDeError(error);
  }
}
