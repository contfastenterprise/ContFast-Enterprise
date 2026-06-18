import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
  console.log('.env loaded.');
} catch (e) {
  console.log('Natively loaded or no .env needed.');
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('Missing connection string');
  process.exit(1);
}

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(connectionString, { ssl: 'require' });

  try {
    console.log('Adding columns...');
    try {
      await sql`ALTER TABLE "invoices" ADD COLUMN "total_retained" numeric(15, 2) DEFAULT '0.00' NOT NULL`;
      console.log('total_retained column added.');
    } catch (e: any) {
      console.log('total_retained column already exists or error:', e.message);
    }

    try {
      await sql`ALTER TABLE "invoices" ADD COLUMN "total_net" numeric(15, 2) DEFAULT '0.00' NOT NULL`;
      console.log('total_net column added.');
    } catch (e: any) {
      console.log('total_net column already exists or error:', e.message);
    }

    console.log('Creating tables...');
    await sql`
      CREATE TABLE IF NOT EXISTS "retentions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" uuid,
        "name" varchar(255) NOT NULL,
        "percentage" numeric(5, 2) NOT NULL,
        "type" varchar(20) NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    console.log('retentions table created.');

    await sql`
      CREATE TABLE IF NOT EXISTS "invoice_retentions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "invoice_id" uuid NOT NULL,
        "retention_id" uuid,
        "retention_name" varchar(255) NOT NULL,
        "retention_type" varchar(20) NOT NULL,
        "retention_percentage" numeric(5, 2) NOT NULL,
        "retention_amount" numeric(15, 2) NOT NULL,
        "agent_rnc" varchar(15),
        "retention_date" date,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" uuid,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    console.log('invoice_retentions table created.');

    try {
      await sql`CREATE INDEX IF NOT EXISTS "invoice_retentions_invoice_idx" ON "invoice_retentions" ("invoice_id")`;
      console.log('Index created.');
    } catch (e: any) {
      console.log('Index creation message:', e.message);
    }

    try {
      await sql`ALTER TABLE "retentions" ADD CONSTRAINT "retentions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action`;
    } catch (e: any) { console.log('constraint company_id error/exists:', e.message); }

    try {
      await sql`ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE no action ON UPDATE no action`;
    } catch (e: any) { console.log('constraint invoice_id error/exists:', e.message); }

    try {
      await sql`ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_retention_id_retentions_id_fk" FOREIGN KEY ("retention_id") REFERENCES "retentions"("id") ON DELETE no action ON UPDATE no action`;
    } catch (e: any) { console.log('constraint retention_id error/exists:', e.message); }

    try {
      await sql`ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action`;
    } catch (e: any) { console.log('constraint created_by error/exists:', e.message); }

    console.log('Seeding default retentions...');
    const defaultRetentions = [
      { name: 'Retención ISR 2%', percentage: 2.00, type: 'ISR' },
      { name: 'Retención ISR 10%', percentage: 10.00, type: 'ISR' },
      { name: 'Retención ISR 27%', percentage: 27.00, type: 'ISR' },
      { name: 'Retención ITBIS 30%', percentage: 30.00, type: 'ITBIS' },
      { name: 'Retención ITBIS 75%', percentage: 75.00, type: 'ITBIS' },
      { name: 'Retención ITBIS 100%', percentage: 100.00, type: 'ITBIS' },
    ];

    for (const r of defaultRetentions) {
      const existing = await sql`SELECT 1 FROM "retentions" WHERE "name" = ${r.name}`;
      if (existing.length === 0) {
        await sql`
          INSERT INTO "retentions" ("name", "percentage", "type", "active")
          VALUES (${r.name}, ${r.percentage}, ${r.type}, true)
        `;
        console.log(`Seeded: ${r.name}`);
      }
    }

    console.log('Done!');
  } catch (error: any) {
    console.error('Error running SQL:', error);
  } finally {
    await sql.end();
  }
}

run();
