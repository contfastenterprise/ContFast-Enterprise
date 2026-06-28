import { db, roles } from '../src/db';
import { DEFAULT_COMPANY_ROLES } from '../src/utils/defaultRoles';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('Cleaning and seeding global roles...');

    // Truncate roles table once to clear out old data
    await db.execute(sql`TRUNCATE TABLE roles RESTART IDENTITY CASCADE;`);

    // Insert the 7 clean default roles
    const inserted = await db
      .insert(roles)
      .values(
        DEFAULT_COMPANY_ROLES.map((role) => ({
          name: role.name,
          description: role.description,
          isFixed: role.isFixed,
        }))
      )
      .returning();

    console.log(`Successfully seeded ${inserted.length} global roles.`);
  } catch (error) {
    console.error('Error seeding global roles:', error);
  }
  process.exit(0);
}

main();
