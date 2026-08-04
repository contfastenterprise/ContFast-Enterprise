import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env', override: false });

async function main() {
  const { db } = await import('../src/db');
  const { routeMappings } = await import('../src/db/schema');
  const { like, or } = await import('drizzle-orm');

  console.log('Querying current route mappings...');
  const mappings = await db.select().from(routeMappings).where(
    or(
      like(routeMappings.routePattern, '%customer-balances%'),
      like(routeMappings.routePattern, '%supplier-balances%'),
      like(routeMappings.routePattern, '%accounts-receivable%'),
      like(routeMappings.routePattern, '%accounts-payable%')
    )
  );
  console.log('Current finance mappings:', mappings);
  
  console.log('Deleting obsolete mappings...');
  await db.delete(routeMappings).where(
    or(
      like(routeMappings.routePattern, '%customer-balances%'),
      like(routeMappings.routePattern, '%supplier-balances%')
    )
  );
  
  console.log('Inserting new mappings if they do not exist...');
  const newRoutes = [
    {
      routePattern: '/dashboard/financial/accounts-receivable%',
      module: 'caja',
      action: 'read',
      isMenuItem: true,
      displayName: 'Cuentas por Cobrar',
      groupName: 'Finanzas',
      iconName: 'Banknote',
      orderIndex: 25
    },
    {
      routePattern: '/dashboard/financial/accounts-payable%',
      module: 'caja',
      action: 'read',
      isMenuItem: true,
      displayName: 'Cuentas por Pagar',
      groupName: 'Finanzas',
      iconName: 'Receipt',
      orderIndex: 35
    }
  ];
  
  for (const route of newRoutes) {
    const exists = await db.select().from(routeMappings).where(like(routeMappings.routePattern, route.routePattern));
    if (exists.length === 0) {
      await db.insert(routeMappings).values(route);
      console.log(`Inserted ${route.displayName}`);
    } else {
      console.log(`${route.displayName} already exists, skipping.`);
    }
  }
  
  console.log('Done.');
  process.exit(0);
}

main().catch(console.error);
