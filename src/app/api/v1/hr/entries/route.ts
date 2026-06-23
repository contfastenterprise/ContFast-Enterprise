import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { z } from 'zod';

const overtimeSchema = z.object({
  employeeId: z.string().uuid('ID de empleado no válido'),
  dateWorked: z.string().min(1, 'La fecha es obligatoria'),
  hours: z.number().positive('Las horas deben ser mayores a cero'),
  type: z.enum(['diurna', 'nocturna', 'festiva', 'doble']),
});

const incomeSchema = z.object({
  employeeId: z.string().uuid('ID de empleado no válido'),
  date: z.string().min(1, 'La fecha es obligatoria'),
  amount: z.number().positive('El monto debe ser mayor a cero'),
  type: z.enum(['productividad', 'comision', 'transporte', 'combustible', 'incentivo', 'otro']),
  description: z.string().optional(),
});

const deductionSchema = z.object({
  employeeId: z.string().uuid('ID de empleado no válido'),
  date: z.string().min(1, 'La fecha es obligatoria'),
  amount: z.number().positive('El monto debe ser mayor a cero'),
  type: z.enum(['prestamo', 'cooperativa', 'seguro', 'embargo', 'otro']),
  description: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const entryType = searchParams.get('entryType'); // 'overtime' | 'income' | 'deduction'

    if (entryType === 'overtime') {
      const data = await HRRepository.findOvertimeRecords(session.companyId);
      return NextResponse.json({ success: true, data });
    } else if (entryType === 'income') {
      const data = await HRRepository.findIncomeRecords(session.companyId);
      return NextResponse.json({ success: true, data });
    } else if (entryType === 'deduction') {
      const data = await HRRepository.findDeductionRecords(session.companyId);
      return NextResponse.json({ success: true, data });
    }

    // Return all
    const overtime = await HRRepository.findOvertimeRecords(session.companyId);
    const income = await HRRepository.findIncomeRecords(session.companyId);
    const deduction = await HRRepository.findDeductionRecords(session.companyId);

    return NextResponse.json({
      success: true,
      data: {
        overtime,
        income,
        deduction,
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
    const entryType = body.entryType; // 'overtime' | 'income' | 'deduction'

    if (entryType === 'overtime') {
      const parsed = overtimeSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
      }
      const record = await HRRepository.createOvertimeRecord(session.companyId, parsed.data);
      await HRRepository.logAudit(session.companyId, session.userId, 'create_overtime', 'overtime_records', record.id, null, record);
      return NextResponse.json({ success: true, data: record }, { status: 201 });
    } else if (entryType === 'income') {
      const parsed = incomeSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
      }
      const record = await HRRepository.createIncomeRecord(session.companyId, parsed.data);
      await HRRepository.logAudit(session.companyId, session.userId, 'create_income', 'employee_income', record.id, null, record);
      return NextResponse.json({ success: true, data: record }, { status: 201 });
    } else if (entryType === 'deduction') {
      const parsed = deductionSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
      }
      const record = await HRRepository.createDeductionRecord(session.companyId, parsed.data);
      await HRRepository.logAudit(session.companyId, session.userId, 'create_deduction', 'employee_deductions', record.id, null, record);
      return NextResponse.json({ success: true, data: record }, { status: 201 });
    }

    return NextResponse.json({ success: false, error: { message: 'Tipo de registro no válido' } }, { status: 400 });
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
    const entryType = searchParams.get('entryType'); // 'overtime' | 'income' | 'deduction'

    if (!id || !entryType) {
      return NextResponse.json({ success: false, error: { message: 'ID y tipo de registro son obligatorios' } }, { status: 400 });
    }

    if (entryType === 'overtime') {
      const record = await HRRepository.deleteOvertimeRecord(id, session.companyId);
      if (record) {
        await HRRepository.logAudit(session.companyId, session.userId, 'delete_overtime', 'overtime_records', id, record, null);
      }
      return NextResponse.json({ success: true, message: 'Registro de horas extras eliminado' });
    } else if (entryType === 'income') {
      const record = await HRRepository.deleteIncomeRecord(id, session.companyId);
      if (record) {
        await HRRepository.logAudit(session.companyId, session.userId, 'delete_income', 'employee_income', id, record, null);
      }
      return NextResponse.json({ success: true, message: 'Ingreso adicional eliminado' });
    } else if (entryType === 'deduction') {
      const record = await HRRepository.deleteDeductionRecord(id, session.companyId);
      if (record) {
        await HRRepository.logAudit(session.companyId, session.userId, 'delete_deduction', 'employee_deductions', id, record, null);
      }
      return NextResponse.json({ success: true, message: 'Deducción eliminada' });
    }

    return NextResponse.json({ success: false, error: { message: 'Tipo de registro no válido' } }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
