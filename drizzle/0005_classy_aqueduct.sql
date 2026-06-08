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
ALTER TABLE "company_settings" ADD COLUMN "mseller_url" text DEFAULT 'https://api.mseller.app/v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "mseller_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "supplier_payment_applied" ADD CONSTRAINT "supplier_payment_applied_payment_id_supplier_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_applied" ADD CONSTRAINT "supplier_payment_applied_ap_id_accounts_payable_id_fk" FOREIGN KEY ("ap_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spa_payment_idx" ON "supplier_payment_applied" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "spa_ap_idx" ON "supplier_payment_applied" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "supp_pay_company_idx" ON "supplier_payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "supp_pay_supplier_idx" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supp_pay_date_idx" ON "supplier_payments" USING btree ("date");