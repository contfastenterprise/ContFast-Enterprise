import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { AdminRepository } from '@/repositories/adminRepository';
import { db, roles } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Auditoria F0-05: la tabla `roles` es global (no tiene company_id) y la ruta
 * aceptaba cualquier roleId con la sola validacion de que fuera un UUID. Un
 * usuario 'administracion' podia leer el id del rol 'sistemas' en
 * GET /api/v1/admin/roles y crearse una cuenta con acceso total a la plataforma,
 * incluida la posibilidad de saltar a otras empresas con switch-company.
 *
 * Solucion de contencion: solo un usuario 'sistemas' puede asignar el rol
 * 'sistemas'. La solucion de fondo (roles por empresa, o separar rol de
 * plataforma de rol de tenant) queda para la Fase 3.
 */
async function assertRoleAsignable(roleId: string, actorRole: string) {
  const [target] = await db
    .select({ name: roles.name })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);

  if (!target) {
    const err: any = new Error('El rol indicado no existe.');
    err.status = 400;
    throw err;
  }

  const esSistemas = actorRole.toLowerCase().trim() === 'sistemas';
  if (target.name.toLowerCase().trim() === 'sistemas' && !esSistemas) {
    const err: any = new Error('Solo un usuario de sistemas puede asignar el rol sistemas.');
    err.status = 403;
    throw err;
  }
}

const userSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  passwordRaw: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  roleId: z.string().uuid('Rol inválido'),
  avatarUrl: z.string().optional().nullable(),
  avatarPath: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'read');

    let users = await AdminRepository.getUsers(session.companyId);
    const currentUserIsSystem = session.role?.toLowerCase() === 'sistemas' || session.role?.toLowerCase() === 'sistema';
    if (!currentUserIsSystem) {
      users = users.filter(u => u.roleName?.toLowerCase() !== 'sistemas' && u.roleName?.toLowerCase() !== 'sistema');
    }
    return NextResponse.json({ success: true, data: users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'write');

    const body = await req.json();
    const parsed = userSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    await assertRoleAsignable(parsed.data.roleId, session.role);

    const newUser = await AdminRepository.createUser({
      ...parsed.data,
      companyId: session.companyId
    });

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: err.status || 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'write');

    const body = await req.json();
    if (!body.userId) {
      return NextResponse.json({ success: false, error: { message: 'Falta userId' } }, { status: 400 });
    }

    // Prevent toggling oneself
    if (body.userId === session.userId) {
      return NextResponse.json({ success: false, error: { message: 'No puedes desactivar tu propia cuenta' } }, { status: 400 });
    }

    const result = await AdminRepository.toggleUserStatus(body.userId, session.companyId, session.role);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 });
  }
}
