import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { AdminRepository } from '@/repositories/adminRepository';
import { z } from 'zod';
import { enforcePermission } from '@/middleware/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'read');

    const roles = await AdminRepository.getRoles(session.companyId);
    return NextResponse.json({ success: true, data: roles });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

const createRoleSchema = z.object({
  name: z.string().min(2, 'El nombre del rol debe tener al menos 2 caracteres'),
  description: z.string().optional().default(''),
});

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // Validación estricta: Solo el rol de 'sistemas' puede crear roles
    if (session.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { message: 'Acceso denegado. Solo el rol sistemas puede crear nuevos roles.' } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const result = createRoleSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    const newRole = await AdminRepository.createRole(
      session.companyId,
      result.data.name,
      result.data.description
    );

    return NextResponse.json({ success: true, data: newRole });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

