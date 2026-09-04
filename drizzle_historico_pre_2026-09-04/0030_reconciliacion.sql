-- 0030: reconciliacion del esquema con las migraciones (auditoria F1-01)
--
-- Estado verificado antes de escribir este archivo, levantando un PostgreSQL 16
-- limpio y ejecutando `drizzle-kit migrate` con las 29 migraciones del journal:
--
--   * La cadena NO abortaba -a diferencia de lo que supuso la auditoria-, pero
--     dejaba 82 tablas frente a las 87 del schema TS.
--   * Faltaban 7 tablas completas y 13 columnas.
--   * El trigger de inmutabilidad de audit_logs no existia, porque
--     0025_immutable_audit_logs.sql nunca estuvo en el journal.
--
-- Todo es idempotente (IF NOT EXISTS / EXCEPTION WHEN duplicate_object): contra
-- produccion es un no-op y contra una base vacia completa el esquema.
--
-- Orden obligatorio: tablas -> columnas -> claves foraneas -> indices. Las FK de
-- accounts_payable apuntan a columnas que se anaden en el paso 2.
--
-- NO se tocan supplier_orders ni supplier_order_lines, que las migraciones aun
-- crean y el schema TS ya no declara. Fueron sustituidas por purchase_orders /
-- purchase_order_items; eliminarlas exige confirmar antes que no tienen datos.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(2) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"area" varchar(50) NOT NULL,
	"summary" text NOT NULL,
	"justification" text NOT NULL,
	"confidence_level" varchar(20) NOT NULL,
	"risk_level" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"document_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"token" varchar(128) NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"context" varchar(50) NOT NULL,
	"reference_id" varchar(128),
	"user_id" uuid,
	"to_email" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"subject" varchar(255) NOT NULL,
	"attachment_names" jsonb,
	"error_message" text,
	"provider_message_id" varchar(255),
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"expected_date" timestamp,
	"status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"observations" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"brand" varchar(100),
	"model" varchar(100),
	"quantity_requested" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"observations" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"change_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD COLUMN IF NOT EXISTS "expense_id" uuid;
--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD COLUMN IF NOT EXISTS "purchase_order_id" uuid;
--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN IF NOT EXISTS "cleared_date" date;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" varchar(50);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "price_type" varchar(20) DEFAULT 'base' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "indicador_nota_credito" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_on_sale" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "promotional_price" numeric(15, 2) DEFAULT 0.00 NOT NULL;
--> statement-breakpoint
ALTER TABLE "route_mappings" ADD COLUMN IF NOT EXISTS "is_menu_item" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "route_mappings" ADD COLUMN IF NOT EXISTS "display_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "route_mappings" ADD COLUMN IF NOT EXISTS "group_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "route_mappings" ADD COLUMN IF NOT EXISTS "icon_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "route_mappings" ADD COLUMN IF NOT EXISTS "order_index" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expense_types" ADD CONSTRAINT "expense_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "system_email_logs" ADD CONSTRAINT "system_email_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "system_email_logs" ADD CONSTRAINT "system_email_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_logs" ADD CONSTRAINT "purchase_order_logs_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_logs" ADD CONSTRAINT "purchase_order_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_types_company_code_idx" ON "expense_types" USING btree ("company_id","code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_types_company_idx" ON "expense_types" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_email_logs_company_idx" ON "system_email_logs" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_email_logs_context_idx" ON "system_email_logs" USING btree ("context");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_email_logs_status_idx" ON "system_email_logs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("purchase_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_order_logs_order_idx" ON "purchase_order_logs" USING btree ("purchase_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_company_num_modo_idx" ON "purchase_orders" USING btree ("company_id","order_number","modo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_proposals_company_modo_idx" ON "agent_proposals" USING btree ("company_id","modo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_proposals_area_idx" ON "agent_proposals" USING btree ("area");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checks_cleared_date_idx" ON "checks" USING btree ("cleared_date");
--> statement-breakpoint
-- Auditoria inmutable: procede de 0025_immutable_audit_logs.sql, huerfano.
CREATE OR REPLACE FUNCTION prevenir_modificacion_audit_logs()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de auditoria son inmutables: no se pueden modificar ni eliminar.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON "audit_logs";
--> statement-breakpoint
CREATE TRIGGER trg_immutable_audit_logs
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevenir_modificacion_audit_logs();
