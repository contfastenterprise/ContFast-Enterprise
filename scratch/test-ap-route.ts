import { db, routeMappings } from '@/db';
async function test() {
  const routes = await db.select().from(routeMappings);
  const apRoute = routes.find(r => r.routePattern.includes('/ap') || r.displayName.toLowerCase().includes('pago'));
  console.log(apRoute);
}
test().catch(console.error);
