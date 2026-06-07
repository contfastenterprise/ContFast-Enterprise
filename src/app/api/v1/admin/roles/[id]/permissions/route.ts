import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, roles, rolePermissions, permissions, auditLogs } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';

const patchPermissionsSchema = z.array(
  z.object({
    permission_id: z.string().uuid('ID de permiso inválido'),
    granted: z.boolean(),
  })
);

/**
 * GET /api/v1/admin/roles/[id]/permissions - Get role permissions
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // Fetch the target role
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, auth.companyId), isNull(roles.deletedAt)))
      .limit(1);

    if (!role) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Rol no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // Fetch role permissions
    const list = await db
      .select({
        id: rolePermissions.id,
        permissionId: rolePermissions.permissionId,
        granted: rolePermissions.granted,
        module: permissions.module,
        action: permissions.action,
        description: permissions.description,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(rolePermissions.roleId, id), eq(rolePermissions.companyId, auth.companyId)));

    return NextResponse.json(
      { success: true, data: { role, permissions: list } },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/admin/roles/[id]/permissions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * PATCH /api/v1/admin/roles/[id]/permissions - Edit role permissions
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // 1. Fetch and validate role
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, auth.companyId), isNull(roles.deletedAt)))
      .limit(1);

    if (!role) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Rol no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    // 2. Reject modifications to fixed roles systems / admin
    if (role.name === 'sistemas' || role.name === 'administracion') {
      return NextResponse.json(
        { success: false, error: { code: 'ROLE_PERMISSIONS_IMMUTABLE', message: 'Los permisos de este rol no pueden modificarse.' } },
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
        // Find existing permission
        const [existing] = await tx
          .select()
          .from(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, id),
              eq(rolePermissions.permissionId, change.permission_id),
              eq(rolePermissions.companyId, auth.companyId)
            )
          )
          .limit(1);

        const oldGranted = existing ? existing.granted : null;

        if (existing) {
          // Update
          await tx
            .update(rolePermissions)
            .set({
              granted: change.granted,
              updatedBy: auth.userId,
              updatedAt: new Date(),
            })
            .where(eq(rolePermissions.id, existing.id));
        } else {
          // Insert
          await tx.insert(rolePermissions).values({
            companyId: auth.companyId,
            roleId: id,
            permissionId: change.permission_id,
            granted: change.granted,
            updatedBy: auth.userId,
          });
        }

        // Write audit log entry
        await tx.insert(auditLogs).values({
          companyId: auth.companyId,
          userId: auth.userId,
          action: 'role_permission_changed',
          entityType: 'role_permissions',
          entityId: change.permission_id,
          oldValues: { roleId: id, granted: oldGranted },
          newValues: { roleId: id, granted: change.granted },
          ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
        });
      }
    });

    return NextResponse.json(
      { success: true, message: 'Permisos del rol actualizados exitosamente.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/admin/roles/[id]/permissions:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
