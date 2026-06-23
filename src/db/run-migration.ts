import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

// Load environment variables
try {
  // @ts-ignore
  process.loadEnvFile();
  console.log('.env loaded.');
} catch (e) {
  console.log('Natively loaded or no .env needed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('Missing connection string in environment variables.');
  process.exit(1);
}

async function run() {
  console.log('Connecting to database...');
  // Force direct connection and disable ssl options if needed, or use default from env
  const sql = postgres(connectionString, { prepare: false });

  try {
    const migrationFile = path.join(process.cwd(), 'drizzle', '0014_spotty_king_bedlam.sql');
    console.log(`Reading migration file: ${migrationFile}`);
    const sqlContent = fs.readFileSync(migrationFile, 'utf8');

    // Split by statement breakpoint
    const statements = sqlContent.split('--> statement-breakpoint');
    console.log(`Found ${statements.length} SQL statements to execute.`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      try {
        await sql.unsafe(stmt);
      } catch (err: any) {
        console.warn(`Warning/Error in statement ${i + 1}: ${err.message}`);
        if (err.message.includes('already exists')) {
          console.log('Continuing since object already exists...');
        } else {
          throw err;
        }
      }
    }

    console.log('Tables created. Seeding ISR Brackets...');
    // Clear old brackets to prevent duplicates
    await sql`DELETE FROM isr_brackets WHERE year = 2026`;
    
    const brackets = [
      { year: 2026, from_amount: 0.00, to_amount: 416220.00, fixed_amount: 0.00, percentage: 0.00 },
      { year: 2026, from_amount: 416220.01, to_amount: 624329.00, fixed_amount: 0.00, percentage: 15.00 },
      { year: 2026, from_amount: 624329.01, to_amount: 867123.00, fixed_amount: 31216.00, percentage: 20.00 },
      { year: 2026, from_amount: 867123.01, to_amount: null, fixed_amount: 79776.00, percentage: 25.00 }
    ];

    for (const b of brackets) {
      await sql`
        INSERT INTO isr_brackets (year, from_amount, to_amount, fixed_amount, percentage)
        VALUES (${b.year}, ${b.from_amount}, ${b.to_amount}, ${b.fixed_amount}, ${b.percentage})
      `;
    }
    console.log('ISR Brackets seeded.');

    // Seed default role 'recursos_humanos' and default 'payroll_configs' for ALL existing companies
    const companies = await sql`SELECT id, name FROM companies WHERE deleted_at IS NULL`;
    console.log(`Seeding ${companies.length} existing companies with HR configs and roles...`);

    for (const company of companies) {
      // 1. Seed 'recursos_humanos' role if not exists
      const [existingRole] = await sql`
        SELECT id FROM roles WHERE company_id = ${company.id} AND name = 'recursos_humanos' AND deleted_at IS NULL
      `;
      if (!existingRole) {
        await sql`
          INSERT INTO roles (company_id, name, description, is_fixed)
          VALUES (${company.id}, 'recursos_humanos', 'Rol de Gestión de Recursos Humanos y Nómina', true)
        `;
        console.log(`Role 'recursos_humanos' seeded for company ${company.name}`);
      }

      // 2. Seed default 'payroll_configs' if not exists
      const [existingConfig] = await sql`
        SELECT id FROM payroll_configs WHERE company_id = ${company.id}
      `;
      if (!existingConfig) {
        await sql`
          INSERT INTO payroll_configs (
            company_id, afp_employee, sfs_employee, afp_employer, sfs_employer, 
            infotep_employer, risk_employer, overtime_diurna_rate, overtime_nocturna_rate, 
            overtime_festiva_rate, overtime_doble_rate
          ) VALUES (
            ${company.id}, 0.0287, 0.0304, 0.0710, 0.0709, 
            0.0100, 0.0110, 1.35, 1.85, 2.00, 2.00
          )
        `;
        console.log(`Default payroll configurations seeded for company ${company.name}`);
      }
    }

    console.log('Migration execution completed successfully!');
  } catch (err: any) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
