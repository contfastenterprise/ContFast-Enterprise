import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, users, roles, userPermissions, permissions, auditLogs } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';

const patchPermissionsSchema = z.array(
  z.object({
    permission_id: z.string().uuid('ID de permiso inválido'),
    granted: z.boolean(),
  })
);

/**
 * GET /api/v1/admin/users/[id]/permissions - Get user permission overrides
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "administracion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'administracion', 'read');

    // Fetch the target user
    const [targetUser] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        roleId: users.roleId,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, id), eq(users.companyId, auth.companyId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Usuario no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Fetch custom user permissions
    const list = await db
      .select({
        id: userPermissions.id,
        permissionId: userPermissions.permissionId,
        granted: userPermissions.granted,
        module: permissions.module,
        action: permissions.action,
        description: permissions.description,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(and(eq(userPermissions.userId, id), eq(userPermissions.companyId, auth.companyId)));

    return NextResponse.json(
      { success: true, data: { user: targetUser, permissions: list } },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/admin/users/[id]/permissions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * PATCH /api/v1/admin/users/[id]/permissions - Edit user permission overrides
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "administracion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'administracion', 'write');

    // 1. Fetch and validate user along with their role
    const [targetUser] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, id), eq(users.companyId, auth.companyId), isNull(users.deletedAt)))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Usuario no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // 2. Reject modifications to users with fixed roles systems / admin
    if (targetUser.roleName === 'sistemas' || targetUser.roleName === 'administracion') {
      return NextResponse.json(
        { success: false, error: { code: 'ROLE_PERMISSIONS_IMMUTABLE', message: 'Los permisos de un usuario con rol fijo no pueden modificarse.' } },
        { status: 403, headers: resHeaders }
      );
    }

    const body = await req.json();
    const result = patchPermissionsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    // 3. Process changes inside a transaction
    await db.transaction(async (tx) => {
      for (const change of result.data) {
        // Find existing permission override
        const [existing] = await tx
          .select()
          .from(userPermissions)
          .where(
            and(
              eq(userPermissions.userId, id),
              eq(userPermissions.permissionId, change.permission_id),
              eq(userPermissions.companyId, auth.companyId)
            )
          )
          .limit(1);

        const oldGranted = existing ? existing.granted : null;

        if (existing) {
          // Update
          await tx
            .update(userPermissions)
            .set({
              granted: change.granted,
              updatedBy: auth.userId,
              updatedAt: new Date(),
            })
            .where(eq(userPermissions.id, existing.id));
        } else {
          // Insert
          await tx.insert(userPermissions).values({
            companyId: auth.companyId,
            userId: id,
            permissionId: change.permission_id,
            granted: change.granted,
            updatedBy: auth.userId,
          });
        }

        // Write audit log entry
        await tx.insert(auditLogs).values({
          companyId: auth.companyId,
          userId: auth.userId,
          action: 'user_permission_changed',
          entityType: 'user_permissions',
          entityId: change.permission_id,
          oldValues: { userId: id, granted: oldGranted },
          newValues: { userId: id, granted: change.granted },
          ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
        });
      }
    });

    return NextResponse.json(
      { success: true, message: 'Permisos personalizados del usuario actualizados exitosamente.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/admin/users/[id]/permissions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
