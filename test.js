const { db } = require('./src/db/index.js');
const { sql } = require('drizzle-orm');
async function run() {
  const result = await db.execute(sql\
    SELECT 
      supplier_id,
      (SELECT SUM(amount) FROM expenses e WHERE e.supplier_id = ap.supplier_id AND deleted_at IS NULL) as exp_sum,
      SUM(amount) as ap_sum,
      SUM(amount - balance) as ap_paid,
      COUNT(*) as ap_count
    FROM accounts_payable ap
    WHERE deleted_at IS NULL
    GROUP BY supplier_id
  \);
  console.log(result);
  process.exit(0);
}
run().catch(console.error);
