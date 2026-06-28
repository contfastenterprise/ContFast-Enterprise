const postgres = require('postgres');

try {
  process.loadEnvFile();
  console.log('.env loaded.');
} catch (e) {
  console.log('.env loaded natively or not needed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('Missing database connection string.');
  process.exit(1);
}

const defaultPlans = [
  {
    name: 'Plan Básico',
    description: 'Ideal para pequeñas empresas y profesionales independientes.',
    price: 2500.00,
    max_ecf_limit: 100,
    max_users: 3,
    max_warehouses: 1,
    active: true
  },
  {
    name: 'Plan Profesional',
    description: 'Perfecto para empresas en crecimiento con necesidades avanzadas.',
    price: 6000.00,
    max_ecf_limit: 500,
    max_users: 10,
    max_warehouses: 3,
    active: true
  },
  {
    name: 'Plan Ilimitado (Corporativo)',
    description: 'Consumo ilimitado para grandes corporaciones y facturación intensiva.',
    price: 15000.00,
    max_ecf_limit: -1,
    max_users: -1,
    max_warehouses: 10,
    active: true
  }
];

async function run() {
  console.log('Connecting to database to seed default SaaS plans...');
  const sql = postgres(connectionString, { prepare: false });

  try {
    for (const p of defaultPlans) {
      // Check if plan already exists by name
      const existing = await sql`SELECT id FROM plans WHERE name = ${p.name}`;
      if (existing.length === 0) {
        await sql`
          INSERT INTO plans (name, description, price, max_ecf_limit, max_users, max_warehouses, active)
          VALUES (${p.name}, ${p.description}, ${p.price}, ${p.max_ecf_limit}, ${p.max_users}, ${p.max_warehouses}, ${p.active})
        `;
        console.log(`[OK] Plan '${p.name}' seeded successfully.`);
      } else {
        console.log(`[SKIP] Plan '${p.name}' already exists.`);
      }
    }
    console.log('Seeding finished!');
  } catch (err) {
    console.error('Failed to seed plans:', err);
  } finally {
    await sql.end();
  }
}

run();
