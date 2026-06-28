const postgres = require('postgres');

// Load environment variables
try {
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
    console.log('1. Creating table plans...');
    await sql`
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "price" numeric(15, 2) DEFAULT '0.00' NOT NULL,
        "max_ecf_limit" integer DEFAULT 100 NOT NULL,
        "max_users" integer DEFAULT 5 NOT NULL,
        "max_warehouses" integer DEFAULT 1 NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    console.log('plans table created or exists.');

    console.log('2. Creating table subscriptions...');
    await sql`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "status" varchar(50) DEFAULT 'active' NOT NULL,
        "current_period_start" timestamp NOT NULL,
        "current_period_end" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    console.log('subscriptions table created or exists.');

    console.log('3. Adding subscriptions foreign keys...');
    try {
      await sql`
        ALTER TABLE "subscriptions" 
        ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" 
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action
      `;
      console.log('subscriptions_company_id_companies_id_fk added.');
    } catch (e) {
      console.log('company fk error or exists:', e.message);
    }

    try {
      await sql`
        ALTER TABLE "subscriptions" 
        ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" 
        FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE no action ON UPDATE no action
      `;
      console.log('subscriptions_plan_id_plans_id_fk added.');
    } catch (e) {
      console.log('plan fk error or exists:', e.message);
    }

    console.log('4. Creating subscriptions company index...');
    try {
      await sql`CREATE INDEX IF NOT EXISTS "subscriptions_company_idx" ON "subscriptions" ("company_id")`;
      console.log('Index created.');
    } catch (e) {
      console.log('Index error or exists:', e.message);
    }

    console.log('Done!');
  } catch (err) {
    console.error('Failed to run migration:', err);
  } finally {
    await sql.end();
  }
}

run();
