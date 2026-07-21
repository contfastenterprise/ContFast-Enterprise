import * as fs from 'fs';
import * as path from 'path';

// Manual .env loader
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value.replace(/^['"]|['"]$/g, ''); // strip quotes
      }
    }
  }
} catch (e: any) {}

async function run() {
  const { db, roles, permissions, rolePermissions, companies } = await import('@/db');
  const { eq, and } = await import('drizzle-orm');

  console.log('Ensuring "compras" role exists in database...');

  await db.transaction(async (tx) => {
    // 1. Check if role exists
    let [comprasRole] = await tx.select().from(roles).where(eq(roles.name, 'compras')).limit(1);
    if (!comprasRole) {
      [comprasRole] = await tx.insert(roles).values({
        name: 'compras',
        description: 'Rol dedicado a la gestión de Compras, Gastos y Suplidores (Egresos)',
        isFixed: false
      }).returning();
      console.log('Created new "compras" role in database:', comprasRole);
    } else {
      console.log('Role "compras" already exists:', comprasRole);
    }

    // 2. Fetch all permission records for "proveedores" module
    const proveedoresPerms = await tx.select().from(permissions).where(eq(permissions.module, 'proveedores'));
    console.log(`Found ${proveedoresPerms.length} permissions for proveedores module.`);

    // 3. For all existing companies, assign these permissions to the compras role
    const allCompanies = await tx.select({ id: companies.id }).from(companies);
    console.log(`Seeding permissions for ${allCompanies.length} companies...`);

    for (const comp of allCompanies) {
      for (const perm of proveedoresPerms) {
        // Check if role permission already exists
        const [existingRp] = await tx.select().from(rolePermissions).where(
          and(
            eq(rolePermissions.companyId, comp.id),
            eq(rolePermissions.roleId, comprasRole.id),
            eq(rolePermissions.permissionId, perm.id)
          )
        ).limit(1);

        if (!existingRp) {
          await tx.insert(rolePermissions).values({
            companyId: comp.id,
            roleId: comprasRole.id,
            permissionId: perm.id,
            granted: true
          });
          console.log(`Granted ${perm.module}:${perm.action} for company ${comp.id}`);
        }
      }
    }
  });

  console.log('Database role insertion and permission seeding completed successfully!');
  process.exit(0);
}

run().catch(console.error);
