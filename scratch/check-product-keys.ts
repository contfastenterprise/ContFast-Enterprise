import 'dotenv/config';
import { db, products } from '../src/db';

async function main() {
  try {
    const list = await db.select().from(products).limit(1);
    console.log('PRODUCT FROM DB:', JSON.stringify(list[0], null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
