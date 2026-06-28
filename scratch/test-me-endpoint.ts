import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
  console.log('.env loaded natively.');
} catch (e) {
  console.log('.env loading bypassed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  console.log('--- RUNNING DB QUERY DIAGNOSTIC FOR /me ---');
  const sql = postgres(connectionString, { prepare: false });
  try {
    // 1. Run the join query raw
    const result = await sql`
      SELECT u.id, u.name, u.email, u.company_id, u.avatar_url, u.avatar_path, r.name as role_name, u.role_id 
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      LIMIT 1
    `;
    console.log('Query result:', result);

    // 2. Load Drizzle and RbacService to see if they throw
    const { db, users, roles } = await import('../src/db');
    const { eq } = await import('drizzle-orm');
    const { RbacService } = await import('../src/services/auth/rbacService');

    const userId = result[0]?.id;
    if (userId) {
      console.log('Testing with userId:', userId);
      const [drizzleUser] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          companyId: users.companyId,
          avatarUrl: users.avatarUrl,
          avatarPath: users.avatarPath,
          role: roles.name,
          roleId: users.roleId,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, userId))
        .limit(1);

      console.log('Drizzle user result:', drizzleUser);

      console.log('Testing RbacService.getUserPermissions...');
      const perms = await RbacService.getUserPermissions(drizzleUser.id, drizzleUser.role, drizzleUser.roleId);
      console.log('Permissions list:', perms);
    } else {
      console.log('No user found to test with.');
    }
  } catch (err) {
    console.error('Error during me endpoint simulation:', err);
  } finally {
    await sql.end();
  }
}

run();
