CREATE TABLE "financial_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
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
ALTER TABLE "employees" ADD COLUMN "payment_frequency" varchar(20) DEFAULT 'mensual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payrolls" ADD COLUMN "frequency" varchar(20) DEFAULT 'mensual' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_mov_company_idx" ON "financial_movements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "fin_mov_customer_idx" ON "financial_movements" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "fin_mov_supplier_idx" ON "financial_movements" USING btree ("company_id","supplier_id");--> statement-breakpoint
CREATE INDEX "fin_mov_date_idx" ON "financial_movements" USING btree ("date");--> statement-breakpoint
CREATE INDEX "fin_mov_created_at_idx" ON "financial_movements" USING btree ("created_at");