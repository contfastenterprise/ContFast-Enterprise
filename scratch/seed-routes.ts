import { db } from '../src/db';
import { routeMappings } from '../src/db/schema';
import { DEFAULT_ROUTE_MAPPINGS } from '../src/constants/defaultMappings';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
  try {
    const validMappings = DEFAULT_ROUTE_MAPPINGS.map(m => ({
      ...m,
      id: uuidv4()
    }));
    await db.delete(routeMappings);
    await db.insert(routeMappings).values(validMappings);
    console.log('Successfully seeded route mappings with valid UUIDs.');
  } catch (err) {
    console.error('Error seeding:', err);
  }
  process.exit(0);
}
seed();
