import * as dotenv from 'dotenv';
dotenv.config();

import { db } from "../src/db";
import { expenses, companies } from "../src/db/schema";
import { eq, isNull, and, sql, gte, lte } from "drizzle-orm";

async function main() {
  const tenantId = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'; // Latin Doors
  
  const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, tenantId));
  const activeExpenses = allExpenses.filter(e => !e.deletedAt);
  const julyExpenses = activeExpenses.filter(e => {
    const dateStr = typeof e.issueDate === 'string' ? e.issueDate : (e.issueDate as Date).toISOString();
    return dateStr.includes("-07-");
  });

  let prodCount = 0;
  let testCount = 0;
  
  julyExpenses.forEach(e => {
    if (e.modo === 'PRODUCCION') prodCount++;
    else if (e.modo === 'PRUEBA') testCount++;
  });
  
  console.log(`Compras activas de JULIO para Latin Doors:`);
  console.log(`PRODUCCION: ${prodCount}`);
  console.log(`PRUEBA: ${testCount}`);

  process.exit(0);
}

main().catch(console.error);
