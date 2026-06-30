import { db, users } from '../src/db';
import { count } from 'drizzle-orm';

async function main() {
  try {
    const res = await db.select({ value: count() }).from(users);
    console.log("DB SUCCESS:", res);
  } catch (err: any) {
    console.error("DB FAILED:", err);
  }
}
main();
