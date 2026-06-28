import { db, roles, companies } from '../src/db';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const allCompanies = await db.select().from(companies);
    console.log(`Found ${allCompanies.length} companies:`);
    for (const comp of allCompanies) {
      const companyRoles = await db.select().from(roles).where(eq(roles.companyId, comp.id));
      console.log(`\nCompany: ${comp.name} (ID: ${comp.id})`);
      console.log(`Roles (${companyRoles.length}):`);
      for (const r of companyRoles) {
        console.log(` - Name: ${r.name}, isFixed: ${r.isFixed}, ID: ${r.id}`);
      }
    }
  } catch (error) {
    console.error('Error checking roles:', error);
  }
  process.exit(0);
}

main();
