import 'dotenv/config';
import { db, routeMappings } from '../src/db';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Actualizando mapeo de retenciones en la base de datos...');
  try {
    const res = await db.update(routeMappings)
      .set({ groupName: 'Sistema', orderIndex: 25 })
      .where(eq(routeMappings.routePattern, '/dashboard/retentions%'));
    
    console.log('Mapeo actualizado con éxito en la BD.');
    process.exit(0);
  } catch (error) {
    console.error('Error al actualizar el mapeo:', error);
    process.exit(1);
  }
}

main();
