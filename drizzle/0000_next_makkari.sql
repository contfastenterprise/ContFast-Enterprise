CREATE TYPE "public"."environment_mode" AS ENUM('PRODUCCION', 'PRUEBA');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"rnc" varchar(11) NOT NULL,
	"business_activity" varchar(255),
	"address" varchar(255),
	"phone" varchar(50),
	"email" varchar(255),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dgii_env" varchar(50) DEFAULT 'PRUEBA' NOT NULL,
	"logo_url" text,
	"mseller_url" text DEFAULT 'https://ecf.api.mseller.app/v1' NOT NULL,
	"mseller_api_key_encrypted" text,
	"mseller_email" varchar(255),
	"mseller_password_encrypted" text,
	"print_layout" varchar(50) DEFAULT 'carta' NOT NULL,
	"print_copies" integer DEFAULT 2 NOT NULL,
	"auto_delivery_notes" boolean DEFAULT false NOT NULL,
	"max_credit_note_approval_amount" numeric(15, 2) DEFAULT '10000.00' NOT NULL,
	"max_cash_out_approval_amount" numeric(15, 2) DEFAULT '5000.00' NOT NULL,
	"barcode_default_type" varchar(30) DEFAULT 'code128' NOT NULL,
	"barcode_prefix" varchar(20) DEFAULT 'COD' NOT NULL,
	"barcode_length" integer DEFAULT 9 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mseller_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entorno" varchar(20) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
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
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" varchar(100) NOT NULL,
	"action" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_fixed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"refresh_hash" varchar(255) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"invalidated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"avatar_url" text,
	"avatar_path" text,
	"is_platform_staff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "barcode_print_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "price_lists_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "product_barcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"barcode" varchar(100) NOT NULL,
	"barcode_type" varchar(30) NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "product_categories_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category_id" uuid,
	"sku" varchar(100),
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"cost" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"unit_of_measure" varchar(50) DEFAULT 'unidad' NOT NULL,
	"tracks_inventory" boolean DEFAULT true NOT NULL,
	"price_consumidor" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"price_proveedor" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"price_mayorista" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"is_on_sale" boolean DEFAULT false NOT NULL,
	"promotional_price" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"image_url" text,
	"barcode" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "products_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(15, 4) DEFAULT '0.0000' NOT NULL,
	"min_stock" numeric(15, 4) DEFAULT '0.0000' NOT NULL,
	"max_stock" numeric(15, 4),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"balance_after" numeric(15, 4) NOT NULL,
	"reference_id" uuid,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(15, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"source_warehouse_id" uuid NOT NULL,
	"destination_warehouse_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"address" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "warehouses_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rnc_cedula" varchar(15),
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"price_type" varchar(20) DEFAULT 'base' NOT NULL,
	"credit_limit" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "customers_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rnc" varchar(11),
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "suppliers_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"invoice_id" uuid,
	"type" varchar(50) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"description" text,
	"reference" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "cash_registers_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "cash_session_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"initial_balance" numeric(15, 2) NOT NULL,
	"total_cash_in" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_cash_out" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"expected_balance" numeric(15, 2) NOT NULL,
	"actual_balance" numeric(15, 2) NOT NULL,
	"difference" numeric(15, 2) NOT NULL,
	"justification" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"cash_register_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"initial_balance" numeric(15, 2) NOT NULL,
	"expected_balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"actual_balance" numeric(15, 2),
	"difference" numeric(15, 2),
	"justification" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_sessions_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "credit_debit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"invoice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(5) NOT NULL,
	"ncf" varchar(13) NOT NULL,
	"reason" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending_approval' NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "delivery_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_note_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"invoice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delivery_number" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"delivery_date" date NOT NULL,
	"driver_name" varchar(255),
	"driver_license" varchar(50),
	"vehicle_plate" varchar(50),
	"dispatcher_name" varchar(255),
	"notes" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"voided_by" uuid,
	"voided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "dgii_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"invoice_id" uuid NOT NULL,
	"track_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"response_code" varchar(50),
	"response_message" text,
	"xml_payload" text,
	"response_payload" text,
	"security_code" varchar(64),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecf_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"ecf_type" varchar(5) NOT NULL,
	"prefix" varchar(5) DEFAULT 'E' NOT NULL,
	"current_sequence" integer NOT NULL,
	"max_sequence" integer NOT NULL,
	"expiry_date" date,
	"sequence_expiry" varchar(10),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid,
	"quantity" numeric(15, 4) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"discount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"subtotal" numeric(15, 2) NOT NULL,
	"total" numeric(15, 2) NOT NULL,
	"tax_rate" numeric(6, 4),
	"tax_category" varchar(16),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_retentions" (
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
);
--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"prefix" varchar(8) NOT NULL,
	"current_year" integer NOT NULL,
	"current_sequence" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"tax_type" varchar(50) NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"warehouse_id" uuid,
	"customer_id" uuid,
	"user_id" uuid NOT NULL,
	"cash_session_id" uuid,
	"quote_id" uuid,
	"ncf" varchar(13) NOT NULL,
	"ecf_type" varchar(5) NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"payment_status" varchar(50) DEFAULT 'unpaid' NOT NULL,
	"subtotal" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"discount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_taxes" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"xml_path" text,
	"signed_xml_path" text,
	"mseller_xml_path" text,
	"pdf_path" text,
	"mseller_track_id" varchar(255),
	"buyer_rnc" varchar(15),
	"buyer_name" varchar(255),
	"dgii_message" text,
	"notes" text,
	"payment_type" varchar(50) DEFAULT 'cash' NOT NULL,
	"bank_name" varchar(100),
	"transaction_number" varchar(100),
	"modified_ncf" varchar(13),
	"modified_invoice_id" uuid,
	"indicador_nota_credito" integer,
	"codigo_factura" varchar(50),
	"delivery_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"total_retained" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_net" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"security_code" varchar(64),
	"signature_date" varchar(40),
	"qr_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "invoices_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"discount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"subtotal" numeric(15, 2) NOT NULL,
	"total" numeric(15, 2) NOT NULL,
	"tax_rate" numeric(6, 4),
	"tax_category" varchar(16),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"current_year" integer NOT NULL,
	"current_sequence" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"tax_type" varchar(50) NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"warehouse_id" uuid,
	"customer_id" uuid,
	"user_id" uuid NOT NULL,
	"sequence_number" varchar(20) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"subtotal" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"discount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_taxes" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "quotes_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "retentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" varchar(255) NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"type" varchar(20) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_account_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"account_number" varchar(100) NOT NULL,
	"currency" varchar(10) DEFAULT 'DOP' NOT NULL,
	"type" varchar(50) DEFAULT 'corriente' NOT NULL,
	"color" varchar(50) DEFAULT '#003366' NOT NULL,
	"balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"chart_account_id" uuid,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "bank_accounts_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"opening_balance" numeric(15, 2) NOT NULL,
	"closing_balance" numeric(15, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reference" varchar(100),
	"description" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "accounting_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"mapping_key" varchar(100) NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"closed_at" timestamp,
	"closed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"expense_id" uuid,
	"amount" numeric(15, 2) NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "accounts_payable_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ap_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"ap_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"check_id" uuid,
	"debit_account_id" uuid NOT NULL,
	"credit_account_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"status" varchar(50) DEFAULT 'applied' NOT NULL,
	"created_by" uuid,
	"voided_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"nature" varchar(20) DEFAULT 'debit' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"is_transactional" boolean DEFAULT true NOT NULL,
	"parent_id" uuid,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "chart_of_accounts_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"check_number" varchar(100) NOT NULL,
	"payee" varchar(255) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"is_guarantee" boolean DEFAULT false NOT NULL,
	"ap_id" uuid,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"cleared_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "checks_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "customer_receipt_applied" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"ar_id" uuid NOT NULL,
	"amount_applied" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"customer_id" uuid NOT NULL,
	"date" date NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reference" varchar(255),
	"notes" text,
	"created_by" uuid,
	"voided_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "expense_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_cost" numeric(15, 2) NOT NULL,
	"subtotal" numeric(15, 2) NOT NULL,
	"itbis" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(2) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"warehouse_id" uuid,
	"supplier_id" uuid,
	"expense_type" varchar(2) NOT NULL,
	"is_minor_expense" boolean DEFAULT false NOT NULL,
	"ncf" varchar(19),
	"ncf_modified" varchar(19),
	"issue_date" date NOT NULL,
	"payment_date" date,
	"amount" numeric(15, 2) NOT NULL,
	"itbis" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"itbis_retained" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"itbis_proportionality" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"isr_retained" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"isc" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"other_taxes" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"tip" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"payment_method" varchar(2) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "financial_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"customer_id" uuid,
	"supplier_id" uuid,
	"date" date NOT NULL,
	"time" varchar(8) NOT NULL,
	"movement_type" varchar(50) NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"origin_module" varchar(50) NOT NULL,
	"debit" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"credit" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"currency" varchar(10) DEFAULT 'DOP' NOT NULL,
	"user_id" uuid,
	"notes" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"reference" varchar(255),
	"date" date NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'posted' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "journal_entries_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"credit" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_applied" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"ap_id" uuid NOT NULL,
	"amount_applied" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"date" date NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reference" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"action" varchar(255) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"ip_address" varchar(45),
	"route" text NOT NULL,
	"method" varchar(10) NOT NULL,
	"allowed" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_pattern" varchar(255) NOT NULL,
	"module" varchar(100) NOT NULL,
	"action" varchar(50),
	"is_menu_item" boolean DEFAULT false NOT NULL,
	"display_name" varchar(255),
	"group_name" varchar(100),
	"icon_name" varchar(100),
	"order_index" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_email_logs" (
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
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "departments_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "employee_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text,
	"amount" numeric(18, 2) NOT NULL,
	"date" date NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text,
	"amount" numeric(18, 2) NOT NULL,
	"date" date NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"notes" text,
	"status" varchar(50) DEFAULT 'approved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"employee_id" uuid NOT NULL,
	"preaviso" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"cesantia" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"vacaciones" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"navidad" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"otros" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"status" varchar(50) DEFAULT 'calculated' NOT NULL,
	"settlement_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_vacations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"employee_id" uuid NOT NULL,
	"generated_days" integer DEFAULT 0 NOT NULL,
	"taken_days" integer DEFAULT 0 NOT NULL,
	"available_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_code" varchar(50) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"cedula" varchar(20) NOT NULL,
	"birth_date" date NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"photo_url" text,
	"gender" varchar(20),
	"civil_status" varchar(50),
	"nationality" varchar(100),
	"department_id" uuid,
	"position_id" uuid,
	"contract_type" varchar(50) NOT NULL,
	"payment_frequency" varchar(20) DEFAULT 'mensual' NOT NULL,
	"salary" numeric(18, 2) NOT NULL,
	"hire_date" date NOT NULL,
	"termination_date" date,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "employees_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "isr_brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"from_amount" numeric(18, 2) NOT NULL,
	"to_amount" numeric(18, 2),
	"fixed_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"employee_id" uuid NOT NULL,
	"date_worked" date NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"afp_employee" numeric(5, 4) DEFAULT '0.0287' NOT NULL,
	"sfs_employee" numeric(5, 4) DEFAULT '0.0304' NOT NULL,
	"afp_employer" numeric(5, 4) DEFAULT '0.0710' NOT NULL,
	"sfs_employer" numeric(5, 4) DEFAULT '0.0709' NOT NULL,
	"infotep_employer" numeric(5, 4) DEFAULT '0.0100' NOT NULL,
	"risk_employer" numeric(5, 4) DEFAULT '0.0110' NOT NULL,
	"overtime_diurna_rate" numeric(5, 2) DEFAULT '1.35' NOT NULL,
	"overtime_nocturna_rate" numeric(5, 2) DEFAULT '1.85' NOT NULL,
	"overtime_festiva_rate" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"overtime_doble_rate" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"payroll_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"base_salary" numeric(18, 2) NOT NULL,
	"overtime_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"bonus_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"commission_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"gross_salary" numeric(18, 2) NOT NULL,
	"afp" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"sfs" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"isr" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"other_deductions" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"net_salary" numeric(18, 2) NOT NULL,
	"afp_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"sfs_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"risk_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"infotep_employer" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payrolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payment_date" date NOT NULL,
	"frequency" varchar(20) DEFAULT 'mensual' NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "payrolls_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "positions_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
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
CREATE TABLE "purchase_order_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"change_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
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
	"deleted_at" timestamp,
	CONSTRAINT "purchase_orders_id_company_uq" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_order_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"current_year" integer NOT NULL,
	"current_sequence" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_proposals" (
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
CREATE TABLE "document_shares" (
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
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"route" varchar(100) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'processing' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mseller_api_keys" ADD CONSTRAINT "mseller_api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_product_id_company_fk" FOREIGN KEY ("product_id","company_id") REFERENCES "public"."products"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_company_fk" FOREIGN KEY ("price_list_id","company_id") REFERENCES "public"."price_lists"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_company_fk" FOREIGN KEY ("product_id","company_id") REFERENCES "public"."products"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_company_fk" FOREIGN KEY ("product_id","company_id") REFERENCES "public"."products"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_company_fk" FOREIGN KEY ("category_id","company_id") REFERENCES "public"."product_categories"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_product_id_company_fk" FOREIGN KEY ("product_id","company_id") REFERENCES "public"."products"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_warehouse_id_company_fk" FOREIGN KEY ("warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_company_fk" FOREIGN KEY ("product_id","company_id") REFERENCES "public"."products"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_company_fk" FOREIGN KEY ("warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_transfer_id_inventory_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."inventory_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_source_warehouse_id_company_fk" FOREIGN KEY ("source_warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destination_warehouse_id_company_fk" FOREIGN KEY ("destination_warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_warehouses" ADD CONSTRAINT "user_warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_warehouses" ADD CONSTRAINT "user_warehouses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_warehouses" ADD CONSTRAINT "user_warehouses_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_warehouses" ADD CONSTRAINT "user_warehouses_warehouse_id_company_fk" FOREIGN KEY ("warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_company_fk" FOREIGN KEY ("cash_session_id","company_id") REFERENCES "public"."cash_sessions"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_invoice_id_company_fk" FOREIGN KEY ("invoice_id","company_id") REFERENCES "public"."invoices"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_summary" ADD CONSTRAINT "cash_session_summary_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_summary" ADD CONSTRAINT "cash_session_summary_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_summary" ADD CONSTRAINT "cash_session_summary_cash_session_id_company_fk" FOREIGN KEY ("cash_session_id","company_id") REFERENCES "public"."cash_sessions"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cash_register_id_cash_registers_id_fk" FOREIGN KEY ("cash_register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cash_register_id_company_fk" FOREIGN KEY ("cash_register_id","company_id") REFERENCES "public"."cash_registers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_invoice_id_company_fk" FOREIGN KEY ("invoice_id","company_id") REFERENCES "public"."invoices"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_delivery_note_id_delivery_notes_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_company_fk" FOREIGN KEY ("invoice_id","company_id") REFERENCES "public"."invoices"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dgii_submissions" ADD CONSTRAINT "dgii_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dgii_submissions" ADD CONSTRAINT "dgii_submissions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dgii_submissions" ADD CONSTRAINT "dgii_submissions_invoice_id_company_fk" FOREIGN KEY ("invoice_id","company_id") REFERENCES "public"."invoices"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_sequences" ADD CONSTRAINT "ecf_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_retention_id_retentions_id_fk" FOREIGN KEY ("retention_id") REFERENCES "public"."retentions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_modified_invoice_id_invoices_id_fk" FOREIGN KEY ("modified_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_warehouse_id_company_fk" FOREIGN KEY ("warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_company_fk" FOREIGN KEY ("customer_id","company_id") REFERENCES "public"."customers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cash_session_id_company_fk" FOREIGN KEY ("cash_session_id","company_id") REFERENCES "public"."cash_sessions"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_company_fk" FOREIGN KEY ("quote_id","company_id") REFERENCES "public"."quotes"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_sequences" ADD CONSTRAINT "quote_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_taxes" ADD CONSTRAINT "quote_taxes_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_warehouse_id_company_fk" FOREIGN KEY ("warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_company_fk" FOREIGN KEY ("customer_id","company_id") REFERENCES "public"."customers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retentions" ADD CONSTRAINT "retentions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account_balances" ADD CONSTRAINT "bank_account_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account_balances" ADD CONSTRAINT "bank_account_balances_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_chart_account_company_fk" FOREIGN KEY ("chart_account_id","company_id") REFERENCES "public"."chart_of_accounts"("id","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_company_fk" FOREIGN KEY ("bank_account_id","company_id") REFERENCES "public"."bank_accounts"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_company_fk" FOREIGN KEY ("bank_account_id","company_id") REFERENCES "public"."bank_accounts"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_mappings" ADD CONSTRAINT "accounting_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_mappings" ADD CONSTRAINT "accounting_mappings_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_company_fk" FOREIGN KEY ("supplier_id","company_id") REFERENCES "public"."suppliers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchase_order_id_company_fk" FOREIGN KEY ("purchase_order_id","company_id") REFERENCES "public"."purchase_orders"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customer_id_company_fk" FOREIGN KEY ("customer_id","company_id") REFERENCES "public"."customers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_invoice_id_company_fk" FOREIGN KEY ("invoice_id","company_id") REFERENCES "public"."invoices"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_ap_id_accounts_payable_id_fk" FOREIGN KEY ("ap_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_debit_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("debit_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_credit_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_ap_id_company_fk" FOREIGN KEY ("ap_id","company_id") REFERENCES "public"."accounts_payable"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_check_id_company_fk" FOREIGN KEY ("check_id","company_id") REFERENCES "public"."checks"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_debit_account_id_company_fk" FOREIGN KEY ("debit_account_id","company_id") REFERENCES "public"."chart_of_accounts"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_credit_account_id_company_fk" FOREIGN KEY ("credit_account_id","company_id") REFERENCES "public"."chart_of_accounts"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_chart_of_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_ap_id_accounts_payable_id_fk" FOREIGN KEY ("ap_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_bank_account_id_company_fk" FOREIGN KEY ("bank_account_id","company_id") REFERENCES "public"."bank_accounts"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_ap_id_company_fk" FOREIGN KEY ("ap_id","company_id") REFERENCES "public"."accounts_payable"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipt_applied" ADD CONSTRAINT "customer_receipt_applied_receipt_id_customer_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."customer_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipt_applied" ADD CONSTRAINT "customer_receipt_applied_ar_id_accounts_receivable_id_fk" FOREIGN KEY ("ar_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_company_fk" FOREIGN KEY ("customer_id","company_id") REFERENCES "public"."customers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_types" ADD CONSTRAINT "expense_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_warehouse_id_company_fk" FOREIGN KEY ("warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_company_fk" FOREIGN KEY ("supplier_id","company_id") REFERENCES "public"."suppliers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_customer_id_company_fk" FOREIGN KEY ("customer_id","company_id") REFERENCES "public"."customers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_supplier_id_company_fk" FOREIGN KEY ("supplier_id","company_id") REFERENCES "public"."suppliers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_company_fk" FOREIGN KEY ("journal_entry_id","company_id") REFERENCES "public"."journal_entries"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_company_fk" FOREIGN KEY ("account_id","company_id") REFERENCES "public"."chart_of_accounts"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_applied" ADD CONSTRAINT "supplier_payment_applied_payment_id_supplier_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_applied" ADD CONSTRAINT "supplier_payment_applied_ap_id_accounts_payable_id_fk" FOREIGN KEY ("ap_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_company_fk" FOREIGN KEY ("supplier_id","company_id") REFERENCES "public"."suppliers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_permissions" ADD CONSTRAINT "audit_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_permissions" ADD CONSTRAINT "audit_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_email_logs" ADD CONSTRAINT "system_email_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_email_logs" ADD CONSTRAINT "system_email_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_employee_id_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_income" ADD CONSTRAINT "employee_income_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_income" ADD CONSTRAINT "employee_income_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_income" ADD CONSTRAINT "employee_income_employee_id_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_employee_id_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_settlements" ADD CONSTRAINT "employee_settlements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_settlements" ADD CONSTRAINT "employee_settlements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_settlements" ADD CONSTRAINT "employee_settlements_employee_id_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_vacations" ADD CONSTRAINT "employee_vacations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_vacations" ADD CONSTRAINT "employee_vacations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_vacations" ADD CONSTRAINT "employee_vacations_employee_id_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_company_fk" FOREIGN KEY ("department_id","company_id") REFERENCES "public"."departments"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_company_fk" FOREIGN KEY ("position_id","company_id") REFERENCES "public"."positions"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_employee_id_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_configs" ADD CONSTRAINT "payroll_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_payroll_id_payrolls_id_fk" FOREIGN KEY ("payroll_id") REFERENCES "public"."payrolls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_payroll_id_company_fk" FOREIGN KEY ("payroll_id","company_id") REFERENCES "public"."payrolls"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_employee_id_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_logs" ADD CONSTRAINT "purchase_order_logs_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_logs" ADD CONSTRAINT "purchase_order_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_company_fk" FOREIGN KEY ("supplier_id","company_id") REFERENCES "public"."suppliers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_company_fk" FOREIGN KEY ("warehouse_id","company_id") REFERENCES "public"."warehouses"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_sequences" ADD CONSTRAINT "supplier_order_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_rnc_idx" ON "companies" USING btree ("rnc");--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "company_settings_company_idx" ON "company_settings" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mseller_api_keys_company_entorno_idx" ON "mseller_api_keys" USING btree ("company_id","entorno");--> statement-breakpoint
CREATE INDEX "mseller_api_keys_company_idx" ON "mseller_api_keys" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "subscriptions_company_idx" ON "subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_idx" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_resets_company_idx" ON "password_resets" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_module_action_idx" ON "permissions" USING btree ("module","action");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_perm_idx" ON "role_permissions" USING btree ("company_id","role_id","permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_company_idx" ON "role_permissions" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_idx" ON "sessions" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_company_idx" ON "sessions" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permissions_user_perm_idx" ON "user_permissions" USING btree ("user_id","permission_id");--> statement-breakpoint
CREATE INDEX "user_permissions_company_idx" ON "user_permissions" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_company_idx" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "barcode_print_logs_company_idx" ON "barcode_print_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "barcode_print_logs_product_idx" ON "barcode_print_logs" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_list_prod_idx" ON "price_list_items" USING btree ("price_list_id","product_id");--> statement-breakpoint
CREATE INDEX "price_list_items_company_idx" ON "price_list_items" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "price_lists_company_idx" ON "price_lists" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "price_lists_is_public_idx" ON "price_lists" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "price_lists_status_idx" ON "price_lists" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prod_barcodes_company_idx" ON "product_barcodes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "prod_barcodes_product_idx" ON "product_barcodes" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prod_barcodes_barcode_idx" ON "product_barcodes" USING btree ("company_id","barcode");--> statement-breakpoint
CREATE INDEX "prod_categories_company_idx" ON "product_categories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "prod_categories_status_idx" ON "product_categories" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_company_idx" ON "products" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "products_sku_idx" ON "products" USING btree ("company_id","sku");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_barcode_idx" ON "products" USING btree ("company_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_levels_prod_wh_modo_idx" ON "inventory_levels" USING btree ("product_id","warehouse_id","modo");--> statement-breakpoint
CREATE INDEX "inventory_levels_company_idx" ON "inventory_levels" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "inventory_levels_company_modo_idx" ON "inventory_levels" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "inv_movements_company_idx" ON "inventory_movements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "inv_movements_prod_wh_idx" ON "inventory_movements" USING btree ("product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "inv_movements_created_idx" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inv_movements_company_modo_idx" ON "inventory_movements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "inv_trans_lines_transfer_idx" ON "inventory_transfer_lines" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "inv_transfers_company_idx" ON "inventory_transfers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "inv_transfers_company_modo_idx" ON "inventory_transfers" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "user_warehouses_user_wh_idx" ON "user_warehouses" USING btree ("user_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "user_warehouses_company_idx" ON "user_warehouses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouses_company_idx" ON "warehouses" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_company_code_idx" ON "warehouses" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_company_rnc_idx" ON "customers" USING btree ("company_id","rnc_cedula");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_company_rnc_idx" ON "suppliers" USING btree ("company_id","rnc");--> statement-breakpoint
CREATE INDEX "suppliers_status_idx" ON "suppliers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cash_movements_company_idx" ON "cash_movements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cash_movements_session_idx" ON "cash_movements" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "cash_movements_company_modo_idx" ON "cash_movements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_registers_company_code_idx" ON "cash_registers" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "cash_registers_status_idx" ON "cash_registers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cash_session_summary_company_idx" ON "cash_session_summary" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_session_summary_sess_idx" ON "cash_session_summary" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "cash_session_summary_company_modo_idx" ON "cash_session_summary" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "cash_sessions_company_idx" ON "cash_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cash_sessions_cashier_active_idx" ON "cash_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "cash_sessions_company_modo_idx" ON "cash_sessions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "credit_debit_notes_company_idx" ON "credit_debit_notes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "credit_debit_notes_invoice_idx" ON "credit_debit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "credit_debit_notes_company_modo_idx" ON "credit_debit_notes" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "delivery_note_lines_note_idx" ON "delivery_note_lines" USING btree ("delivery_note_id");--> statement-breakpoint
CREATE INDEX "delivery_notes_company_idx" ON "delivery_notes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "delivery_notes_invoice_idx" ON "delivery_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_notes_num_modo_idx" ON "delivery_notes" USING btree ("company_id","delivery_number","modo");--> statement-breakpoint
CREATE INDEX "dgii_submissions_company_idx" ON "dgii_submissions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dgii_submissions_invoice_idx" ON "dgii_submissions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "dgii_submissions_status_idx" ON "dgii_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dgii_submissions_company_modo_idx" ON "dgii_submissions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "ecf_seq_company_type_modo_idx" ON "ecf_sequences" USING btree ("company_id","ecf_type","modo");--> statement-breakpoint
CREATE INDEX "ecf_seq_status_idx" ON "ecf_sequences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_retentions_invoice_idx" ON "invoice_retentions" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_seq_company_prefix_year_modo_idx" ON "invoice_sequences" USING btree ("company_id","prefix","current_year","modo");--> statement-breakpoint
CREATE INDEX "invoice_taxes_invoice_idx" ON "invoice_taxes" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_company_ncf_modo_idx" ON "invoices" USING btree ("company_id","ncf","modo");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_created_idx" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_company_codigo_factura_modo_idx" ON "invoices" USING btree ("company_id","codigo_factura","modo");--> statement-breakpoint
CREATE INDEX "invoices_comp_status_created_modo_idx" ON "invoices" USING btree ("company_id","status","created_at","modo");--> statement-breakpoint
CREATE INDEX "quote_lines_quote_idx" ON "quote_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_seq_company_year_modo_idx" ON "quote_sequences" USING btree ("company_id","current_year","modo");--> statement-breakpoint
CREATE INDEX "quote_taxes_quote_idx" ON "quote_taxes" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_company_seq_modo_idx" ON "quotes" USING btree ("company_id","sequence_number","modo");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "retentions_company_active_idx" ON "retentions" USING btree ("company_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_balances_cuenta_modo_idx" ON "bank_account_balances" USING btree ("bank_account_id","modo");--> statement-breakpoint
CREATE INDEX "bank_account_balances_company_modo_idx" ON "bank_account_balances" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_company_acc_idx" ON "bank_accounts" USING btree ("company_id","account_number");--> statement-breakpoint
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bank_accounts_chart_account_idx" ON "bank_accounts" USING btree ("chart_account_id");--> statement-breakpoint
CREATE INDEX "bank_recon_company_idx" ON "bank_reconciliations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "bank_recon_account_idx" ON "bank_reconciliations" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "bank_recon_company_modo_idx" ON "bank_reconciliations" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "bank_txs_company_idx" ON "bank_transactions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "bank_txs_account_idx" ON "bank_transactions" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "bank_txs_company_modo_idx" ON "bank_transactions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_mappings_company_key_idx" ON "accounting_mappings" USING btree ("company_id","mapping_key");--> statement-breakpoint
CREATE INDEX "accounting_periods_company_idx" ON "accounting_periods" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "accounting_periods_status_idx" ON "accounting_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "accounting_periods_company_modo_idx" ON "accounting_periods" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "ap_company_idx" ON "accounts_payable" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ap_supplier_idx" ON "accounts_payable" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "ap_company_modo_idx" ON "accounts_payable" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "ar_company_idx" ON "accounts_receivable" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ar_customer_idx" ON "accounts_receivable" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ar_invoice_idx" ON "accounts_receivable" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ar_company_modo_idx" ON "accounts_receivable" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "ap_payments_company_idx" ON "ap_payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ap_payments_ap_idx" ON "ap_payments" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "ap_payments_status_idx" ON "ap_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ap_payments_company_modo_idx" ON "ap_payments" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_accounts_company_code_idx" ON "chart_of_accounts" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "chart_accounts_status_idx" ON "chart_of_accounts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "checks_company_num_modo_idx" ON "checks" USING btree ("company_id","check_number","modo");--> statement-breakpoint
CREATE INDEX "checks_cleared_date_idx" ON "checks" USING btree ("cleared_date");--> statement-breakpoint
CREATE INDEX "checks_status_idx" ON "checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checks_ap_idx" ON "checks" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "cra_receipt_idx" ON "customer_receipt_applied" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "cra_ar_idx" ON "customer_receipt_applied" USING btree ("ar_id");--> statement-breakpoint
CREATE INDEX "cust_receipts_company_idx" ON "customer_receipts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cust_receipts_customer_idx" ON "customer_receipts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cust_receipts_date_idx" ON "customer_receipts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "cust_receipts_company_modo_idx" ON "customer_receipts" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "expense_line_exp_idx" ON "expense_lines" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_line_prod_idx" ON "expense_lines" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_types_company_code_idx" ON "expense_types" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "expense_types_company_idx" ON "expense_types" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "expense_company_idx" ON "expenses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "expense_supplier_idx" ON "expenses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "expense_issue_date_idx" ON "expenses" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "expense_comp_issue_date_idx" ON "expenses" USING btree ("company_id","issue_date");--> statement-breakpoint
CREATE INDEX "expense_company_modo_idx" ON "expenses" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "fin_mov_company_idx" ON "financial_movements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "fin_mov_customer_idx" ON "financial_movements" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "fin_mov_supplier_idx" ON "financial_movements" USING btree ("company_id","supplier_id");--> statement-breakpoint
CREATE INDEX "fin_mov_date_idx" ON "financial_movements" USING btree ("date");--> statement-breakpoint
CREATE INDEX "fin_mov_created_at_idx" ON "financial_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fin_mov_company_modo_idx" ON "financial_movements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_mov_company_modo_type_doc_uniq" ON "financial_movements" USING btree ("company_id","modo","movement_type","document_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "journal_entries_company_idx" ON "journal_entries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "journal_entries_created_by_idx" ON "journal_entries" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "journal_entries_comp_status_date_idx" ON "journal_entries" USING btree ("company_id","status","date");--> statement-breakpoint
CREATE INDEX "journal_entries_company_modo_idx" ON "journal_entries" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_entry_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_entry_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_company_idx" ON "journal_entry_lines" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_comp_acc_idx" ON "journal_entry_lines" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_acc_created_idx" ON "journal_entry_lines" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_company_modo_idx" ON "journal_entry_lines" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "spa_payment_idx" ON "supplier_payment_applied" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "spa_ap_idx" ON "supplier_payment_applied" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "supp_pay_company_idx" ON "supplier_payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "supp_pay_supplier_idx" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supp_pay_date_idx" ON "supplier_payments" USING btree ("date");--> statement-breakpoint
CREATE INDEX "supp_pay_company_modo_idx" ON "supplier_payments" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "audit_logs_company_idx" ON "audit_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_company_modo_idx" ON "audit_logs" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "audit_permissions_company_idx" ON "audit_permissions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_permissions_user_idx" ON "audit_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_permissions_created_idx" ON "audit_permissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_company_idx" ON "notifications" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "route_mappings_pattern_idx" ON "route_mappings" USING btree ("route_pattern");--> statement-breakpoint
CREATE INDEX "system_email_logs_company_idx" ON "system_email_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "system_email_logs_context_idx" ON "system_email_logs" USING btree ("context");--> statement-breakpoint
CREATE INDEX "system_email_logs_status_idx" ON "system_email_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "departments_company_idx" ON "departments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_deductions_company_idx" ON "employee_deductions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_deductions_employee_idx" ON "employee_deductions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_deductions_company_modo_idx" ON "employee_deductions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_income_company_idx" ON "employee_income" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_income_employee_idx" ON "employee_income" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_income_company_modo_idx" ON "employee_income" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_leaves_company_idx" ON "employee_leaves" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_leaves_employee_idx" ON "employee_leaves" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_leaves_company_modo_idx" ON "employee_leaves" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_settlements_company_idx" ON "employee_settlements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_settlements_employee_idx" ON "employee_settlements" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_settlements_company_modo_idx" ON "employee_settlements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_vacations_company_idx" ON "employee_vacations" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_vacations_employee_modo_idx" ON "employee_vacations" USING btree ("employee_id","modo");--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employees_code_idx" ON "employees" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX "employees_cedula_idx" ON "employees" USING btree ("cedula");--> statement-breakpoint
CREATE INDEX "overtime_records_company_idx" ON "overtime_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "overtime_records_employee_idx" ON "overtime_records" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "overtime_records_company_modo_idx" ON "overtime_records" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_configs_company_idx" ON "payroll_configs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_details_company_idx" ON "payroll_details" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_details_payroll_idx" ON "payroll_details" USING btree ("payroll_id");--> statement-breakpoint
CREATE INDEX "payroll_details_employee_idx" ON "payroll_details" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_details_company_modo_idx" ON "payroll_details" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "payrolls_company_idx" ON "payrolls" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payrolls_company_modo_idx" ON "payrolls" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "positions_company_idx" ON "positions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_logs_order_idx" ON "purchase_order_logs" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_company_num_modo_idx" ON "purchase_orders" USING btree ("company_id","order_number","modo");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_order_seq_company_year_modo_idx" ON "supplier_order_sequences" USING btree ("company_id","current_year","modo");--> statement-breakpoint
CREATE INDEX "agent_proposals_company_modo_idx" ON "agent_proposals" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "agent_proposals_area_idx" ON "agent_proposals" USING btree ("area");--> statement-breakpoint
CREATE UNIQUE INDEX "idem_keys_company_modo_route_key_idx" ON "idempotency_keys" USING btree ("company_id","modo","route","idempotency_key");--> statement-breakpoint
CREATE INDEX "idem_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE VIEW "public"."v_public_categories" AS (
  SELECT id, company_id, name, status, deleted_at
  FROM product_categories
  WHERE status = 'active' AND deleted_at IS NULL
);--> statement-breakpoint
CREATE VIEW "public"."v_public_price_lists" AS (
  SELECT id, company_id, name, is_public, status, deleted_at
  FROM price_lists
  WHERE is_public = true AND status = 'active' AND deleted_at IS NULL
);--> statement-breakpoint
CREATE VIEW "public"."v_public_products" AS (
  SELECT DISTINCT ON (p.id)
         p.id, p.company_id, p.category_id, p.sku, p.name, p.description, pli.price, p.status, p.deleted_at
  FROM products p
  JOIN price_list_items pli ON pli.product_id = p.id
   AND pli.company_id = p.company_id
   AND pli.deleted_at IS NULL
  JOIN price_lists pl ON pl.id = pli.price_list_id
   AND pl.company_id = p.company_id
   AND pl.is_public = true AND pl.status = 'active' AND pl.deleted_at IS NULL
  WHERE p.status = 'active' AND p.deleted_at IS NULL
  ORDER BY p.id, pl.created_at DESC, pli.id
);