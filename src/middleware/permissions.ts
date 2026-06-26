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
  | 'cobros';

export type PermissionAction = 'read' | 'write' | 'delete' | 'execute' | 'admin';

// Default base permissions for editable roles
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  contabilidad: {
    'contabilidad:read': true,
    'contabilidad:write': true,
    'banco:read': true,
    'banco:write': true,
    'proveedores:read': true,
    'proveedores:write': true,
    'clientes:read': true,
    'cobros:read': true,
    'cobros:write': true,
  },
  facturacion: {
    'facturacion:read': true,
    'facturacion:write': true,
    'clientes:read': true,
    'clientes:write': true,
    'catalogo:read': true,
    'caja:read': true,
    'caja:write': true,
    'cobros:read': true,
    'cobros:write': true,
  },
  banco: {
    'banco:read': true,
    'banco:write': true,
    'proveedores:read': true,
    'cobros:read': true,
    'cobros:write': true,
  },
  cajero: {
    'caja:read': true,
    'caja:write': true, // Only for opening, closing, movements on own session (enforced in business logic)
    'catalogo:read': true,
    'clientes:read': true,
    'clientes:write': true, // Can create basic client during checkout
    'facturacion:read': false, // Disabled by default, requires explicit enable override
    'facturacion:write': false,
  }
};

/**
 * Evaluates the effective permission for a user based on their role and overrides.
 */
export async function hasPermission(
  userId: string,
  roleName: string,
  roleId: string,
  module: PermissionModule,
  action: PermissionAction
): Promise<boolean> {
  const permissionKey = `${module}:${action}`;

  const normalizedRole = roleName.toLowerCase();

  // 1. Check Fixed Roles (Sistemas & Administracion)
  if (normalizedRole.includes('sistema')) {
    // Total access to everything, including audit logs modification config and technical parameters
    return true;
  }

  if (normalizedRole.includes('admin')) {
    // Access to all operational modules, read-only for audit logs & technical config
    if (module === 'auditoria' || module === 'administracion') {
      return action === 'read';
    }
    return true; // Full access to contabilidad, banco, caja, facturacion, etc.
  }

  // 2. Check User Override (user_permissions)
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
  const roleOverride = await db
    .select({ granted: rolePermissions.granted })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
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
  module: PermissionModule,
  action: PermissionAction
): Promise<void> {
  const allowed = await hasPermission(userId, roleName, roleId, module, action);
  if (!allowed) {
    const err: any = new Error('No tiene permisos para realizar esta acción.');
    err.status = 403;
    err.code = 'INSUFFICIENT_PERMISSIONS';
    throw err;
  }
}

export function isAdminOrSistemas(roleName: string): boolean {
  const normalizedRole = roleName.toLowerCase();
  return normalizedRole.includes('sistema') || normalizedRole.includes('admin');
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
      if (module === 'auditoria' || module === 'administracion') {
        return action === 'read';
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
