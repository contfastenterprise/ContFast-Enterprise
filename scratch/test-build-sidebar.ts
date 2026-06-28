import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

interface RouteMapping {
  id: string;
  routePattern: string;
  module: string;
  action: string | null;
  isMenuItem: boolean;
  displayName: string | null;
  groupName: string | null;
  iconName: string | null;
  orderIndex: number | null;
}

export function buildSidebar(
  routeMappings: RouteMapping[],
  hasPermission: (module: string, action: string) => boolean,
  userRole: string
) {
  const cleanRole = userRole?.toLowerCase() || '';

  // 1. Obtener todos los mapeos configurados como elementos de menú
  const menuMappings = routeMappings.filter(m => m.isMenuItem && m.routePattern);

  // 2. Filtrar los mapeos autorizados para el usuario actual
  const authorizedItems: any[] = [];

  for (const m of menuMappings) {
    const module = m.module;
    const action = m.action || 'read';
    
    const isAllowed = cleanRole === 'sistemas' || 
                      cleanRole.includes('sistema') || 
                      cleanRole.includes('admin') || 
                      cleanRole === 'administracion'
                        ? true 
                        : hasPermission(module, action);

    if (!isAllowed) {
      continue;
    }

    // Restricción admin/companies: solo sistemas y administracion tienen acceso
    if (m.routePattern.includes('/admin/companies') &&
        cleanRole !== 'sistemas' &&
        !cleanRole.includes('admin')) {
      continue;
    }

    authorizedItems.push({
      name: m.displayName || 'Módulo',
      href: m.routePattern.replace(/%/g, ''), // Limpiamos wildcards
      iconName: m.iconName || 'HelpCircle',
      groupName: m.groupName || 'Otros',
      orderIndex: m.orderIndex || 999,
    });
  }

  return authorizedItems;
}

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    const rawMappings = await sql`SELECT * FROM route_mappings`;
    const routeMappings: RouteMapping[] = rawMappings.map((m: any) => ({
      id: m.id,
      routePattern: m.route_pattern,
      module: m.module,
      action: m.action,
      isMenuItem: m.is_menu_item,
      displayName: m.display_name,
      groupName: m.group_name,
      iconName: m.icon_name,
      orderIndex: m.order_index
    }));

    const mockHasPermission = (module: string, action: string) => true;

    console.log('--- TEST buildSidebar for "administracion" ---');
    const resultAdmin = buildSidebar(routeMappings, mockHasPermission, 'administracion');
    resultAdmin.forEach(i => {
      console.log(`  - ${i.name} (group: ${i.groupName}, href: ${i.href})`);
    });

    console.log('\n--- TEST buildSidebar for "sistemas" ---');
    const resultSys = buildSidebar(routeMappings, mockHasPermission, 'sistemas');
    resultSys.forEach(i => {
      console.log(`  - ${i.name} (group: ${i.groupName}, href: ${i.href})`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

run();
