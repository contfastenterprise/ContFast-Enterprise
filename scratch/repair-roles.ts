import { db, roles, companies } from '../src/db';
import { seedRolePermissionsForCompany } from '../src/middleware/permissions';
import { DEFAULT_COMPANY_ROLES } from '../src/utils/defaultRoles';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  try {
    const allCompanies = await db.select().from(companies);
    console.log(`Checking ${allCompanies.length} companies...`);

    for (const comp of allCompanies) {
      console.log(`\nCompany: ${comp.name} (${comp.id})`);
      const existingRoles = await db.select().from(roles).where(eq(roles.companyId, comp.id));
      const existingNames = new Set(existingRoles.map(r => r.name.toLowerCase()));

      const rolesToInsert: any[] = [];

      // Check standard 6 roles
      for (const defRole of DEFAULT_COMPANY_ROLES) {
        if (!existingNames.has(defRole.name.toLowerCase())) {
          rolesToInsert.push({
            id: uuidv4(),
            companyId: comp.id,
            name: defRole.name,
            description: defRole.description,
            isFixed: defRole.isFixed,
          });
        }
      }

      // Check recursos_humanos role
      if (!existingNames.has('recursos_humanos')) {
        rolesToInsert.push({
          id: uuidv4(),
          companyId: comp.id,
          name: 'recursos_humanos',
          description: 'Rol de Gestión de Recursos Humanos y Nómina',
          isFixed: true,
        });
      }

      if (rolesToInsert.length > 0) {
        console.log(`Seeding ${rolesToInsert.length} missing roles...`);
        const inserted = await db.insert(roles).values(rolesToInsert).returning({ id: roles.id, name: roles.name });
        
        // Seed permissions for newly inserted roles
        await seedRolePermissionsForCompany(db, comp.id, inserted);
        console.log(`Successfully seeded permissions for: ${inserted.map(i => i.name).join(', ')}`);
      } else {
        console.log('All standard roles are already present.');
      }
    }
  } catch (error) {
    console.error('Error repairing roles:', error);
  }
  process.exit(0);
}

main();
