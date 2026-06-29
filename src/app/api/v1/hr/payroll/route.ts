import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { z } from 'zod';

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

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const payroll = await HRRepository.findPayrollById(id, session.companyId);
      if (!payroll) {
        return NextResponse.json({ success: false, error: { message: 'Nómina no encontrada' } }, { status: 404 });
      }
      const details = await HRRepository.findPayrollDetails(id, session.companyId);
      return NextResponse.json({ success: true, data: { payroll, details } });
    }

    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const result = await HRRepository.findPayrolls(session.companyId, limit, offset);

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        limit,
        offset,
      },
    });
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
    const parsed = createPayrollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const payroll = await HRRepository.createPayroll(session.companyId, {
      ...parsed.data,
      createdBy: session.userId,
    });

    await HRRepository.logAudit(session.companyId, session.userId, 'create_payroll', 'payrolls', payroll.id, null, payroll);

    return NextResponse.json({ success: true, data: payroll }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const action = body.action; // 'recalculate' | 'approve'

    if (action === 'recalculate') {
      await HRRepository.recalculatePayroll(id, session.companyId);
      const payroll = await HRRepository.findPayrollById(id, session.companyId);
      await HRRepository.logAudit(session.companyId, session.userId, 'recalculate_payroll', 'payrolls', id, null, payroll);
      return NextResponse.json({ success: true, message: 'Nómina recalculada exitosamente' });
    }

    if (action === 'approve') {
      await HRRepository.approvePayroll(id, session.companyId, session.userId);
      return NextResponse.json({ success: true, message: 'Nómina aprobada exitosamente' });
    }

    return NextResponse.json({ success: false, error: { message: 'Acción no válida' } }, { status: 400 });
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

    const oldPayroll = await HRRepository.findPayrollById(id, session.companyId);
    await HRRepository.deletePayroll(id, session.companyId);

    await HRRepository.logAudit(session.companyId, session.userId, 'delete_payroll', 'payrolls', id, oldPayroll, null);

    return NextResponse.json({ success: true, message: 'Nómina eliminada/cancelada exitosamente' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
