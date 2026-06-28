const postgres = require('postgres');
// load dotenv if available, otherwise read process.env directly
const fs = require('fs');
const path = require('path');

// Manually parse .env since dotenv is devDependency or might not be loaded
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length > 1) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
        if (key && !key.startsWith('#')) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (err) {
  console.error('Error loading .env manually:', err);
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
console.log('Connecting to:', connectionString ? connectionString.split('@')[1] : 'null');

const sql = postgres(connectionString, { ssl: 'require', timeout: 5000 });

async function run() {
  try {
    const result = await sql`SELECT 1 as result`;
    console.log('Success:', result);
  } catch (error) {
    console.error('Connection failed:', error);
  } finally {
    await sql.end();
  }
}

run();
