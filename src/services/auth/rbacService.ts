import { db, userPermissions, rolePermissions, permissions, routeMappings, auditPermissions } from '@/db';
import { eq, and } from 'drizzle-orm';
import { DEFAULT_ROLE_PERMISSIONS, PermissionModule, PermissionAction } from '@/middleware/permissions';

export interface RouteMapping {
  routePattern: string;
  module: string;
  action: string | null;
}

// Memory cache for route mappings to optimize middleware performance
let cachedRouteMappings: RouteMapping[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class RbacService {
  /**
   * Resolves the list of all effective permissions for a user.
   * Returns an array of strings in format "module:action".
   */
  static async getUserPermissions(
    userId: string,
    roleName: string,
    roleId: string
  ): Promise<string[]> {
    const normalizedRole = roleName.toLowerCase();
    const allPerms = await db.select().from(permissions);

    // 1. Fixed roles logic
    if (normalizedRole.includes('sistema')) {
      // Full access to every permission
      return allPerms.map((p) => `${p.module}:${p.action}`);
    }

    if (normalizedRole.includes('admin')) {
      // Access to everything except auditoria & administracion which are read-only
      return allPerms
        .filter((p) => {
          if (p.module === 'auditoria' || p.module === 'administracion') {
            return p.action === 'read';
          }
          return true;
        })
        .map((p) => `${p.module}:${p.action}`);
    }

    // 2. Fetch User and Role overrides from DB
    const [userOverrides, roleOverrides] = await Promise.all([
      db
        .select({
          module: permissions.module,
          action: permissions.action,
          granted: userPermissions.granted,
        })
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(eq(userPermissions.userId, userId)),
      db
        .select({
          module: permissions.module,
          action: permissions.action,
          granted: rolePermissions.granted,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, roleId)),
    ]);

    // Build map of user overrides: "module:action" -> granted
    const userOverrideMap = new Map<string, boolean>();
    userOverrides.forEach((o) => {
      userOverrideMap.set(`${o.module}:${o.action}`, o.granted);
    });

    // Build map of role overrides: "module:action" -> granted
    const roleOverrideMap = new Map<string, boolean>();
    roleOverrides.forEach((o) => {
      roleOverrideMap.set(`${o.module}:${o.action}`, o.granted);
    });

    const effectivePermissions: string[] = [];

    // 3. Evaluate each system permission
    for (const p of allPerms) {
      const permissionKey = `${p.module}:${p.action}`;

      // User override takes first precedence
      if (userOverrideMap.has(permissionKey)) {
        if (userOverrideMap.get(permissionKey) === true) {
          effectivePermissions.push(permissionKey);
        }
        continue;
      }

      // Role override takes second precedence
      if (roleOverrideMap.has(permissionKey)) {
        if (roleOverrideMap.get(permissionKey) === true) {
          effectivePermissions.push(permissionKey);
        }
        continue;
      }

      // Default role permissions fallback
      const roleDefaults = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
      if (roleDefaults && roleDefaults[permissionKey] === true) {
        effectivePermissions.push(permissionKey);
      }
    }

    return effectivePermissions;
  }

  /**
   * Log an access authorization attempt to database for security auditing.
   */
  static async logAccessAttempt(
    companyId: string | null,
    userId: string | null,
    ipAddress: string,
    route: string,
    method: string,
    allowed: boolean,
    reason: string
  ): Promise<void> {
    try {
      await db.insert(auditPermissions).values({
        companyId,
        userId,
        ipAddress,
        route,
        method,
        allowed,
        reason,
      });
    } catch (err) {
      console.error('[RBAC Audit Log Error]: Failed to save access log.', err);
    }
  }

  /**
   * Resolves the required module and action for a given route path.
   * Matches patterns in the database using SQL LIKE syntax.
   */
  static async resolveRoutePermission(
    path: string
  ): Promise<{ module: PermissionModule; action: PermissionAction | null } | null> {
    const now = Date.now();
    
    // Refresh mappings cache if expired
    if (!cachedRouteMappings || now - cacheTimestamp > CACHE_TTL_MS) {
      try {
        const mappings = await db.select().from(routeMappings);
        cachedRouteMappings = mappings.map((m) => ({
          routePattern: m.routePattern,
          module: m.module,
          action: m.action,
        }));
        cacheTimestamp = now;
      } catch (err) {
        console.error('[RBAC Cache Refresh Error]:', err);
        // If DB fails, fallback to existing cache if available
        if (!cachedRouteMappings) return null;
      }
    }

    // Match path against route patterns (e.g. '/dashboard/accounting%' -> '/dashboard/accounting/entries')
    // We sort patterns by length descending to match most specific patterns first
    const sortedMappings = [...cachedRouteMappings].sort(
      (a, b) => b.routePattern.length - a.routePattern.length
    );

    for (const mapping of sortedMappings) {
      const pattern = mapping.routePattern;
      
      // Convert SQL LIKE wildcard '%' to regex equivalent
      const regexPattern = '^' + pattern
        .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') // Escape regex special chars except %
        .replace(/%/g, '.*') + '$';
        
      const regex = new RegExp(regexPattern, 'i');
      if (regex.test(path)) {
        return {
          module: mapping.module as PermissionModule,
          action: mapping.action as PermissionAction | null,
        };
      }
    }

    return null;
  }
}
