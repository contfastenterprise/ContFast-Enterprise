import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  
  console.log('--- INSERTING MISSING PERMISSIONS INTO DB ---');

  // Modules used in route_mappings but missing from permissions table
  const missingPermissions = [
    { module: 'nomina', action: 'read', description: 'Ver nómina, empleados, RRHH' },
    { module: 'nomina', action: 'write', description: 'Gestionar nómina, empleados, RRHH' },
    { module: 'cobros', action: 'read', description: 'Ver cobros y cuentas por cobrar' },
    { module: 'cobros', action: 'write', description: 'Gestionar cobros y cuentas por cobrar' },
    { module: 'conduce', action: 'read', description: 'Ver conduces y notas de entrega' },
    { module: 'conduce', action: 'write', description: 'Gestionar conduces y notas de entrega' },
    { module: 'retenciones', action: 'read', description: 'Ver retenciones fiscales' },
    { module: 'retenciones', action: 'write', description: 'Gestionar retenciones fiscales' },
  ];

  for (const perm of missingPermissions) {
    // Check if already exists
    const existing = await sql`
      SELECT id FROM permissions WHERE module = ${perm.module} AND action = ${perm.action}
    `;
    
    if (existing.length > 0) {
      console.log(`  SKIP (already exists): ${perm.module}:${perm.action}`);
      continue;
    }
    
    await sql`
      INSERT INTO permissions (id, module, action, description)
      VALUES (gen_random_uuid(), ${perm.module}, ${perm.action}, ${perm.description})
    `;
    console.log(`  INSERTED: ${perm.module}:${perm.action}`);
  }

  // Verify total permissions in DB
  const total = await sql`SELECT COUNT(*) as count FROM permissions`;
  console.log('\nTotal permissions in DB after migration:', total[0].count);
  
  // Now seed role_permissions for recursos_humanos roles
  console.log('\n--- SEEDING role_permissions FOR recursos_humanos ROLES ---');
  
  const nomina_perms = await sql`SELECT id, module, action FROM permissions WHERE module = 'nomina'`;
  const rh_roles = await sql`SELECT id, company_id FROM roles WHERE name = 'recursos_humanos'`;
  
  console.log(`Found ${rh_roles.length} recursos_humanos roles and ${nomina_perms.length} nomina permissions`);
  
  for (const role of rh_roles) {
    for (const perm of nomina_perms) {
      const existing = await sql`
        SELECT id FROM role_permissions WHERE role_id = ${role.id} AND permission_id = ${perm.id}
      `;
      
      if (existing.length > 0) {
        // Update to granted=true
        await sql`
          UPDATE role_permissions SET granted = true WHERE role_id = ${role.id} AND permission_id = ${perm.id}
        `;
        console.log(`  UPDATED: role ${role.id} - ${perm.module}:${perm.action} -> granted=true`);
      } else {
        await sql`
          INSERT INTO role_permissions (id, company_id, role_id, permission_id, granted)
          VALUES (gen_random_uuid(), ${role.company_id}, ${role.id}, ${perm.id}, true)
        `;
        console.log(`  INSERTED: role ${role.id} - ${perm.module}:${perm.action} -> granted=true`);
      }
    }
  }
  
  console.log('\n--- MIGRATION COMPLETE ---');
  await sql.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
