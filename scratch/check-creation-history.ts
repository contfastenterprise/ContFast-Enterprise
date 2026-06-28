import { db, companies, auditLogs, roles } from '../src/db';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const comps = await db.select().from(companies);
    for (const comp of comps) {
      console.log(`\nCompany: ${comp.name}`);
      console.log(`Created At: ${comp.createdAt}`);
      
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.companyId, comp.id));
      console.log(`Audit Logs (${logs.length}):`);
      for (const log of logs) {
        console.log(` - Action: ${log.action}, Entity: ${log.entityType}, Date: ${log.createdAt}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

main();
