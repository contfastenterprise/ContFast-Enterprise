import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { AdminRepository } from '@/repositories/adminRepository';
import { z } from 'zod';

const updateUserSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  passwordRaw: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
  roleId: z.string().uuid('Rol inválido'),
  avatarUrl: z.string().optional().nullable(),
  avatarPath: z.string().optional().nullable(),
});

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'write');

    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const updatedUser = await AdminRepository.updateUser(params.id, session.companyId, parsed.data);

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 });
  }
}
