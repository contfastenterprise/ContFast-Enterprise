import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { z } from 'zod';

const departmentSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional().or(z.literal('')),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const data = await HRRepository.findDepartments(session.companyId);
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
    const parsed = departmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const dept = await HRRepository.createDepartment({
      companyId: session.companyId,
      name: parsed.data.name,
      description: parsed.data.description,
    });

    await HRRepository.logAudit(session.companyId, session.userId, 'create_department', 'departments', dept.id, null, dept);

    return NextResponse.json({ success: true, data: dept }, { status: 201 });
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
    const parsed = departmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const oldDept = (await HRRepository.findDepartments(session.companyId)).find(d => d.id === id);
    const dept = await HRRepository.updateDepartment(id, session.companyId, {
      name: parsed.data.name,
      description: parsed.data.description,
    });

    await HRRepository.logAudit(session.companyId, session.userId, 'update_department', 'departments', id, oldDept, dept);

    return NextResponse.json({ success: true, data: dept });
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

    const oldDept = (await HRRepository.findDepartments(session.companyId)).find(d => d.id === id);
    const dept = await HRRepository.deleteDepartment(id, session.companyId);

    await HRRepository.logAudit(session.companyId, session.userId, 'delete_department', 'departments', id, oldDept, null);

    return NextResponse.json({ success: true, data: dept });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
