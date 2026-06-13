const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Manually parse .env file
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const cleanLine = line.trim();
  if (cleanLine && !cleanLine.startsWith('#')) {
    const parts = cleanLine.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      envVars[key] = val;
    }
  }
});

const connectionString = envVars.DATABASE_URL;

async function testInsert() {
  console.log('Connecting to database...');
  const sql = postgres(connectionString, { ssl: 'require' });

  try {
    // We need a valid company, warehouse, and user ID from the database to avoid foreign key failures.
    // Let's query an existing company/warehouse/user first.
    console.log('Querying existing records for foreign keys...');
    const [company] = await sql`SELECT id FROM public.companies LIMIT 1`;
    const [warehouse] = await sql`SELECT id FROM public.warehouses LIMIT 1`;
    const [user] = await sql`SELECT id FROM public.users LIMIT 1`;

    if (!company || !user) {
      console.error('No company or user found in DB. Cannot insert mock invoice.');
      return;
    }

    const companyId = company.id;
    const warehouseId = warehouse ? warehouse.id : null;
    const userId = user.id;

    // Generate a unique mock NCF to avoid unique constraint failure
    const mockNcf = 'E32' + Math.floor(1000000000 + Math.random() * 9000000000).toString();

    console.log(`Inserting mock invoice with NCF: ${mockNcf}...`);
    const [inserted] = await sql`
      INSERT INTO public.invoices (
        company_id,
        warehouse_id,
        user_id,
        ncf,
        ecf_type,
        status,
        payment_status,
        subtotal,
        discount,
        total_taxes,
        total
      ) VALUES (
        ${companyId},
        ${warehouseId},
        ${userId},
        ${mockNcf},
        '32',
        'signed',
        'paid',
        100.00,
        0.00,
        18.00,
        118.00
      )
      RETURNING id, ncf, codigo_factura, created_at;
    `;

    console.log('Insertion response:', inserted);
    console.log('Successfully generated code:', inserted.codigo_factura);
  } catch (err) {
    console.error('Test insert failed:', err.message);
  } finally {
    await sql.end();
  }
}

testInsert();
