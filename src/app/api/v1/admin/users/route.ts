import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { AdminRepository } from '@/repositories/adminRepository';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  passwordRaw: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  roleId: z.string().uuid('Rol inválido')
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || session.roleName !== 'sistemas' && session.roleName !== 'administracion') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
    }

    const users = await AdminRepository.getUsers(session.companyId);
    return NextResponse.json({ success: true, data: users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || session.roleName !== 'sistemas' && session.roleName !== 'administracion') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
    }

    const body = await req.json();
    const parsed = userSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const newUser = await AdminRepository.createUser({
      ...parsed.data,
      companyId: session.companyId
    });

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || session.roleName !== 'sistemas' && session.roleName !== 'administracion') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
    }

    const body = await req.json();
    if (!body.userId) {
      return NextResponse.json({ success: false, error: { message: 'Falta userId' } }, { status: 400 });
    }

    // Prevent toggling oneself
    if (body.userId === session.userId) {
      return NextResponse.json({ success: false, error: { message: 'No puedes desactivar tu propia cuenta' } }, { status: 400 });
    }

    const result = await AdminRepository.toggleUserStatus(body.userId, session.companyId);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 });
  }
}
