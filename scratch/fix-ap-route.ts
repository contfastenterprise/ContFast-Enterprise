import { db, routeMappings } from '@/db';
import { v4 as uuidv4 } from 'uuid';

async function fix() {
  const existing = await db.query.routeMappings.findFirst({
    where: (r, { eq }) => eq(r.routePattern, '/dashboard/ap')
  });

  if (!existing) {
    await db.insert(routeMappings).values({
      id: uuidv4(),
      routePattern: '/dashboard/ap',
      module: 'proveedores',
      action: 'write',
      displayName: 'Pagos a Suplidores',
      iconName: 'Building2',
      groupName: 'Finanzas',
      orderIndex: 3,
      isMenuItem: true
    });
    console.log('Inserted route mapping for /dashboard/ap');
  } else {
    console.log('Route mapping already exists.');
  }
}

fix().catch(console.error);
