import { db, plans } from '../src/db';

async function main() {
  try {
    console.log('Seeding SaaS plans...');
    const inserted = await db.insert(plans).values([
      {
        name: 'Plan Básico',
        description: 'Ideal para pequeñas empresas que inician en facturación electrónica.',
        price: '1500.00',
        maxEcfLimit: 100,
        maxUsers: 2,
        maxWarehouses: 1,
        active: true,
      },
      {
        name: 'Plan Profesional',
        description: 'Perfecto para negocios en crecimiento con múltiples usuarios.',
        price: '3500.00',
        maxEcfLimit: 500,
        maxUsers: 5,
        maxWarehouses: 2,
        active: true,
      },
      {
        name: 'Plan Corporativo',
        description: 'Acceso completo para corporaciones grandes con alta facturación y almacenes.',
        price: '7500.00',
        maxEcfLimit: 2000,
        maxUsers: 15,
        maxWarehouses: 5,
        active: true,
      }
    ]).returning();

    console.log(`Seeded ${inserted.length} plans successfully.`);
  } catch (err) {
    console.error('Error seeding plans:', err);
  }
  process.exit(0);
}

main();
