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
    const migrationFile = path.join(process.cwd(), 'drizzle', '0026_glorious_serpent_society.sql');
    console.log(`Reading target migration file: ${migrationFile}`);
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
        console.log(`Statement ${i + 1} executed successfully.`);
      } catch (err: any) {
        console.warn(`Warning/Error in statement ${i + 1}: ${err.message}`);
        if (
          err.message.includes('already exists') || 
          err.message.includes('does not exist') || 
          err.message.includes('already a member')
        ) {
          console.log('Continuing since object/column already exists or does not exist...');
        } else {
          throw err;
        }
      }
    }

    console.log('Single migration applied successfully!');
  } catch (err: any) {
    console.error('Migration execution failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
