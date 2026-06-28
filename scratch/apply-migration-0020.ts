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
  const sql = postgres(connectionString, { prepare: false });

  try {
    const migrationFile = path.join(process.cwd(), 'drizzle', '0020_add_rbac_system_tables.sql');
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

    console.log('Migration execution completed successfully!');
  } catch (err: any) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
