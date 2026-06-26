// Load environment variables first
try {
  // @ts-ignore
  process.loadEnvFile();
  console.log('.env loaded successfully. DATABASE_URL exists:', !!process.env.DATABASE_URL);
} catch (e) {
  console.log('Environment loaded natively or no .env needed.');
}

async function run() {
  const { db, companies, chartOfAccounts, accountingMappings } = await import('../src/db');
  const { eq } = await import('drizzle-orm');
  const { v4: uuidv4 } = await import('uuid');
  const { AccountingRepository } = await import('../src/repositories/accountingRepository');

  console.log('Starting retroactive accounting configuration seeding for all companies...');

  try {
    // 1. Fetch all companies
    const allCompanies = await db.select().from(companies);
    console.log(`Found ${allCompanies.length} companies to process.`);

    for (const company of allCompanies) {
      console.log(`Processing company: ${company.name} (ID: ${company.id})`);

      // 2. Fetch existing accounts and mappings
      const existingAccounts = await db.select()
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.companyId, company.id));

      const existingMappings = await db.select()
        .from(accountingMappings)
        .where(eq(accountingMappings.companyId, company.id));

      if (existingAccounts.length === 0) {
        console.log(`  -> Company has 0 accounts. Seeding complete Chart of Accounts and mappings...`);
        await AccountingRepository.seedDefaultChartOfAccounts(company.id);
        console.log(`  -> Seeding complete!`);
      } else {
        console.log(`  -> Company already has ${existingAccounts.length} accounts. Checking for missing default accounts and bridge mappings...`);
        const codeToIdMap = new Map<string, string>(existingAccounts.map(a => [a.code, a.id]));

        // Default mapping definition details
        const defaultMappings = [
          { key: 'sales_revenue', code: '4.1.01', name: 'Ventas de Mercancías', type: 'revenue', nature: 'credit', isTransactional: true },
          { key: 'accounts_receivable', code: '1.1.02.01', name: 'Cuentas por Cobrar Clientes', type: 'asset', nature: 'debit', isTransactional: true },
          { key: 'cash', code: '1.1.01.01', name: 'Caja General', type: 'asset', nature: 'debit', isTransactional: true },
          { key: 'bank', code: '1.1.01.02', name: 'Banco Popular', type: 'asset', nature: 'debit', isTransactional: true },
          { key: 'itbis_sales', code: '2.1.02.01', name: 'ITBIS Cobrado en Ventas', type: 'liability', nature: 'credit', isTransactional: true },
          { key: 'itbis_purchases', code: '1.1.04.01', name: 'ITBIS Pagado en Compras', type: 'asset', nature: 'debit', isTransactional: true },
          { key: 'cost_of_goods_sold', code: '5.1.01', name: 'Costo de Ventas Mercancías', type: 'expense', nature: 'debit', isTransactional: true },
          { key: 'inventory', code: '1.1.03.01', name: 'Inventario de Mercancía', type: 'asset', nature: 'debit', isTransactional: true },
          { key: 'supplier_payable', code: '2.1.01.01', name: 'Cuentas por Pagar Proveedores', type: 'liability', nature: 'credit', isTransactional: true }
        ];

        await db.transaction(async (tx) => {
          // A. Insert any missing default accounts first
          for (const map of defaultMappings) {
            if (!codeToIdMap.has(map.code)) {
              console.log(`    -> Inserting missing transactional account: ${map.code} - ${map.name}`);
              const id = uuidv4();
              
              let parentId: string | null = null;
              if (map.code.includes('.')) {
                const lastDot = map.code.lastIndexOf('.');
                const parentCode = map.code.substring(0, lastDot);
                parentId = codeToIdMap.get(parentCode) || null;
              }
              const level = map.code.split('.').length;

              await tx.insert(chartOfAccounts).values({
                id,
                companyId: company.id,
                code: map.code,
                name: map.name,
                type: map.type as any,
                nature: map.nature as any,
                level,
                isTransactional: map.isTransactional,
                parentId,
                status: 'active'
              });
              codeToIdMap.set(map.code, id);
            }
          }

          // B. Insert missing mappings
          for (const map of defaultMappings) {
            const hasMapping = existingMappings.some(m => m.mappingKey === map.key);
            if (!hasMapping) {
              const accountId = codeToIdMap.get(map.code);
              if (accountId) {
                console.log(`    -> Mapping key "${map.key}" to account "${map.code}"`);
                await tx.insert(accountingMappings).values({
                  id: uuidv4(),
                  companyId: company.id,
                  mappingKey: map.key,
                  accountId
                });
              }
            }
          }
        });
        console.log(`  -> Verification and update complete!`);
      }
    }

    console.log('Retroactive seeding operation completed successfully!');
  } catch (error: any) {
    console.error('Migration execution failed:', error);
    process.exit(1);
  }
}

run();
