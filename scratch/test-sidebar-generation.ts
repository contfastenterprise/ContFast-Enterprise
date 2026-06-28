import postgres from 'postgres';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/middleware/permissions';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    console.log('--- START ALL ROLES SIDEBAR DIAGNOSTIC ---');
    
    // 1. Fetch all roles
    const roles = await sql`SELECT * FROM roles`;
    console.log('Total roles in DB:', roles.length);

    // 2. Fetch all permissions in DB
    const allPerms = await sql`SELECT * FROM permissions`;
    console.log('Total permissions in DB:', allPerms.length);

    // 3. Fetch Route Mappings from DB
    const routeMappings = await sql`SELECT * FROM route_mappings`;
    console.log('Total route mappings in DB:', routeMappings.length);

    // 4. Audit each role
    for (const role of roles) {
      const roleName = role.name;
      const roleId = role.id;
      const normalizedRole = roleName.toLowerCase();
      console.log(`\n========================================`);
      console.log(`AUDITING ROLE: "${roleName}" (ID: ${roleId})`);

      // Fetch overrides from DB for this role
      const roleOverrides = await sql`
        SELECT p.module, p.action, rp.granted
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = ${roleId}
      `;
      const roleOverrideMap = new Map<string, boolean>();
      roleOverrides.forEach((o: any) => {
        roleOverrideMap.set(`${o.module}:${o.action}`, o.granted);
      });

      const effectivePermissions: string[] = [];
      for (const p of allPerms) {
        const permissionKey = `${p.module}:${p.action}`;
        
        // Role override
        if (roleOverrideMap.has(permissionKey)) {
          if (roleOverrideMap.get(permissionKey) === true) {
            effectivePermissions.push(permissionKey);
          }
          continue;
        }

        // Default fallback
        const roleDefaults = (DEFAULT_ROLE_PERMISSIONS as any)[normalizedRole];
        if (roleDefaults && roleDefaults[permissionKey] === true) {
          effectivePermissions.push(permissionKey);
        }
      }
      console.log(`- Effective permissions count: ${effectivePermissions.length}`);
      console.log(`- Effective permissions list:`, effectivePermissions);

      // Define hasPermission simulation
      const hasPermission = (module: string, action: string): boolean => {
        if (normalizedRole.includes('sistema')) return true;
        if (normalizedRole.includes('admin') || normalizedRole === 'administracion') {
          if (module === 'auditoria' || module === 'administracion') {
            return action === 'read';
          }
          return true;
        }
        return effectivePermissions.includes(`${module.toLowerCase()}:${action.toLowerCase()}`);
      };

      // Define canAccessRoute simulation
      const canAccessRoute = (path: string): boolean => {
        if (normalizedRole.includes('sistema')) return true;

        const sortedMappings = [...routeMappings].sort(
          (a: any, b: any) => b.route_pattern.length - a.route_pattern.length
        );

        for (const mapping of sortedMappings) {
          const pattern = mapping.route_pattern;
          const regexPattern = '^' + pattern
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
            .replace(/%/g, '.*') + '$';
            
          const regex = new RegExp(regexPattern, 'i');
          if (regex.test(path)) {
            const module = mapping.module;
            const action = mapping.action || 'read';
            return hasPermission(module, action);
          }
        }

        return true; // fallback
      };

      // Evaluate menu mappings
      const menuMappings = routeMappings.filter((m: any) => m.is_menu_item && m.route_pattern);
      const authorizedItems = [];

      for (const m of menuMappings) {
        const isAllowed = canAccessRoute(m.route_pattern);
        if (isAllowed) {
          authorizedItems.push({
            name: m.display_name,
            href: m.route_pattern.replace(/%/g, ''),
            groupName: m.group_name
          });
        }
      }

      console.log(`- Authorized menu items count: ${authorizedItems.length}`);
      console.log(`- Authorized items list:`, authorizedItems.map((i: any) => i.name));
    }

  } catch (err) {
    console.error('Error running test script:', err);
  } finally {
    await sql.end();
  }
}

run();
