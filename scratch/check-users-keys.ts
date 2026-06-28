import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema/auth.ts';
import { eq } from 'drizzle-orm';

async function run() {
  try {
    const data = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        avatarPath: users.avatarPath,
      })
      .from(users)
      .where(eq(users.email, 'contfastenterprise@gmail.com'));

    console.log('Gerson DB Record:', data[0]);
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
