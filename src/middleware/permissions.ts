import { NextResponse } from 'next/server';
import { db, userPermissions, rolePermissions, permissions } from '@/db';
import { eq, and } from 'drizzle-orm';

export type PermissionModule =
  | 'caja'
  | 'facturacion'
  | 'contabilidad'
  | 'banco'
  | 'clientes'
  | 'proveedores'
  | 'catalogo'
  | 'reportes'
  | 'administracion'
  | 'auditoria'
  | 'cobros'
  | 'nomina'
  | 'conduce'
  | 'retenciones';

export type PermissionAction = 'read' | 'write' | 'delete' | 'execute' | 'admin';

// Default base permissions are defined in a pure, client-safe file to allow import from both client and server
import { DEFAULT_ROLE_PERMISSIONS } from '@/constants/rolePermissions';
export { DEFAULT_ROLE_PERMISSIONS } from '@/constants/rolePermissions';

/**
 * Evaluates the effective permission for a user based on their role and overrides.
 */
export async function hasPermission(
  userId: string,
  roleName: string,
  roleId: string,
  companyId: string,
  module: PermissionModule,
  action: PermissionAction
): Promise<boolean> {
  const permissionKey = `${module}:${action}`;

  const normalizedRole = roleName.toLowerCase().trim();

  // 1. Check Fixed Roles (Sistemas & Administracion)
  // Auditoria F0-05: comparacion EXACTA. Con includes(), un rol creado con nombre
  // libre como "admin de ventas" o "sistemas de inventario" obtenia acceso total.
  if (normalizedRole === 'sistemas') {
    // Total access to everything, including audit logs modification config and technical parameters
    return true;
  }

  if (normalizedRole === 'administracion') {
    // Access to all operational modules, read-only for audit logs
    if (module === 'auditoria') {
      return action === 'read';
    }
    if (module === 'administracion') {
      return action === 'read' || action === 'write';
    }
    return true; // Full access to contabilidad, banco, caja, facturacion, etc.
  }

  // 1b. Support for compras role to read accounting and bank (lookup/recording)
  if (normalizedRole === 'compras') {
    if (module === 'contabilidad' && action === 'read') return true;
    if (module === 'banco' && (action === 'read' || action === 'write')) return true;
  }

  // 2. Check User Override (user_permissions)
  //
  // Aqui NO se filtra por empresa a proposito. El indice unico es
  // (user_id, permission_id): un usuario solo puede tener una fila por permiso,
  // y el usuario pertenece a una empresa, asi que el userId ya acota el ambito.
  // Filtrar ademas por la empresa ACTIVA romperia al rol `sistemas`, que puede
  // cambiar de empresa mientras su users.company_id sigue siendo el de origen.
  const userOverride = await db
    .select({ granted: userPermissions.granted })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userPermissions.userId, userId),
        eq(permissions.module, module),
        eq(permissions.action, action)
      )
    )
    .limit(1);

  if (userOverride.length > 0) {
    return userOverride[0].granted;
  }

  // 3. Check Role Override (role_permissions)
  //
  // `roles` es un catalogo GLOBAL: no tiene company_id. Lo que cada empresa
  // decide sobre su rol "cajero" vive aqui, y el indice unico es
  // (company_id, role_id, permission_id) -- una fila por empresa para el mismo
  // roleId. Sin el filtro por empresa, este .limit(1) resolvia la autorizacion
  // con la fila de OTRA empresa, en las dos direcciones: heredando permisos que
  // el propio administrador nunca concedio, y perdiendo los que si concedio.
  const roleOverride = await db
    .select({ granted: rolePermissions.granted })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.companyId, companyId),
        eq(permissions.module, module),
        eq(permissions.action, action)
      )
    )
    .limit(1);

  if (roleOverride.length > 0) {
    return roleOverride[0].granted;
  }

  // 4. Fall back to role's default base permission
  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[roleName];
  if (roleDefaults) {
    return !!roleDefaults[permissionKey];
  }

  return false;
}

/**
 * Helper to check and throw 403 error if user doesn't have permissions.
 */
export async function enforcePermission(
  userId: string,
  roleName: string,
  roleId: string,
  companyId: string,
  module: PermissionModule,
  action: PermissionAction
): Promise<void> {
  const allowed = await hasPermission(userId, roleName, roleId, companyId, module, action);
  if (!allowed) {
    const err: any = new Error('No tiene permisos para realizar esta acción.');
    err.status = 403;
    err.code = 'INSUFFICIENT_PERMISSIONS';
    throw err;
  }
}

/**
 * Comprobacion de permiso que devuelve la respuesta 403 en vez de lanzarla.
 *
 * `enforcePermission` lanza un error con `status = 403`, y eso solo llega al
 * cliente como 403 si el `catch` de la ruta propaga `error.status`. Muchas
 * rutas cierran con `{ status: 500 }` fijo, de modo que una denegacion de
 * permisos se presentaba como error del servidor. Este helper evita depender
 * de como este escrito el catch de cada ruta:
 *
 *   const denegado = await requirePermission(session, 'nomina', 'read');
 *   if (denegado) return denegado;
 *
 * Auditoria ISO-03: 54 rutas verificaban la sesion pero no el permiso.
 */
export async function requirePermission(
  session: { userId: string; role: string; roleId: string; companyId: string },
  module: PermissionModule,
  action: PermissionAction
): Promise<NextResponse | null> {
  const allowed = await hasPermission(
    session.userId,
    session.role,
    session.roleId,
    session.companyId,
    module,
    action
  );

  if (allowed) return null;

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'No tiene permisos para realizar esta acción.',
      },
    },
    { status: 403 }
  );
}

export function isAdminOrSistemas(roleName: string): boolean {
  // Auditoria F0-05: comparacion exacta contra la lista cerrada de roles fijos.
  // Antes usaba includes(), de modo que cualquier rol cuyo nombre contuviera
  // "admin" o "sistema" pasaba este control.
  const normalizedRole = roleName.toLowerCase().trim();
  return normalizedRole === 'sistemas' || normalizedRole === 'administracion';
}

export function enforceAdminOrSistemas(roleName: string): void {
  if (!isAdminOrSistemas(roleName)) {
    const err: any = new Error('No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden realizar esta acción.');
    err.status = 403;
    err.code = 'INSUFFICIENT_PERMISSIONS';
    throw err;
  }
}

/**
 * Seeds the default role permissions for a newly created company in the database.
 */
export async function seedRolePermissionsForCompany(
  tx: any,
  companyId: string,
  insertedRoles: { id: string; name: string }[]
): Promise<void> {
  const dbPermissions = await tx.select().from(permissions);
  
  const rolePermissionsToInsert: {
    companyId: string;
    roleId: string;
    permissionId: string;
    granted: boolean;
  }[] = [];

  const isPermissionGranted = (roleName: string, module: string, action: string): boolean => {
    const normalizedRole = roleName.toLowerCase();
    if (normalizedRole === 'sistemas') return true;
    if (normalizedRole === 'administracion') {
      if (module === 'auditoria') {
        return action === 'read';
      }
      if (module === 'administracion') {
        return action === 'read' || action === 'write';
      }
      return true;
    }
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
    if (defaultPerms) {
      return !!defaultPerms[`${module}:${action}`];
    }
    return false;
  };

  for (const role of insertedRoles) {
    for (const p of dbPermissions) {
      const granted = isPermissionGranted(role.name, p.module, p.action);
      rolePermissionsToInsert.push({
        companyId,
        roleId: role.id,
        permissionId: p.id,
        granted,
      });
    }
  }

  if (rolePermissionsToInsert.length > 0) {
    await tx.insert(rolePermissions).values(rolePermissionsToInsert);
  }
}
