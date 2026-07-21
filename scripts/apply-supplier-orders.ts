// @ts-nocheck
import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL || '';

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(connectionString, { ssl: 'require' });

  try {
    console.log('Dropping old supplier order tables...');
    await sql.unsafe(`
      DROP TABLE IF EXISTS "supplier_order_lines" CASCADE;
      DROP TABLE IF EXISTS "supplier_orders" CASCADE;
    `);

    console.log('Creating new purchase orders and items tables...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "purchase_orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        "modo" varchar(50) DEFAULT 'PRODUCCION' NOT NULL,
        "order_number" varchar(50) NOT NULL,
        "supplier_id" uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        "warehouse_id" uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        "order_date" timestamp DEFAULT now() NOT NULL,
        "expected_date" timestamp,
        "status" varchar(50) DEFAULT 'Draft' NOT NULL,
        "observations" text,
        "created_by" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "deleted_at" timestamp,
        CONSTRAINT "purchase_orders_company_num_modo_idx" UNIQUE ("company_id", "order_number", "modo")
      );

      CREATE TABLE IF NOT EXISTS "purchase_order_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "purchase_order_id" uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        "quantity_requested" integer NOT NULL,
        "quantity_received" integer DEFAULT 0 NOT NULL,
        "observations" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "purchase_order_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "purchase_order_id" uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "action" varchar(100) NOT NULL,
        "change_details" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log('Creating indexes...');
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");
      CREATE INDEX IF NOT EXISTS "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");
      CREATE INDEX IF NOT EXISTS "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("purchase_order_id");
      CREATE INDEX IF NOT EXISTS "purchase_order_logs_order_idx" ON "purchase_order_logs" USING btree ("purchase_order_id");
    `);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await sql.end();
  }
}

run();
