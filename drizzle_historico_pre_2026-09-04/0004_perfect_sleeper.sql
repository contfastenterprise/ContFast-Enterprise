CREATE TABLE "ap_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ap_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"check_id" uuid,
	"debit_account_id" uuid NOT NULL,
	"credit_account_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"status" varchar(50) DEFAULT 'applied' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"customer_id" uuid NOT NULL,
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
ALTER TABLE "checks" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "is_guarantee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "ap_id" uuid;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_ap_id_accounts_payable_id_fk" FOREIGN KEY ("ap_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_debit_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("debit_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_credit_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipt_applied" ADD CONSTRAINT "customer_receipt_applied_receipt_id_customer_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."customer_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipt_applied" ADD CONSTRAINT "customer_receipt_applied_ar_id_accounts_receivable_id_fk" FOREIGN KEY ("ar_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_payments_company_idx" ON "ap_payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ap_payments_ap_idx" ON "ap_payments" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "ap_payments_status_idx" ON "ap_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cra_receipt_idx" ON "customer_receipt_applied" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "cra_ar_idx" ON "customer_receipt_applied" USING btree ("ar_id");--> statement-breakpoint
CREATE INDEX "cust_receipts_company_idx" ON "customer_receipts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cust_receipts_customer_idx" ON "customer_receipts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cust_receipts_date_idx" ON "customer_receipts" USING btree ("date");--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_ap_id_accounts_payable_id_fk" FOREIGN KEY ("ap_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checks_ap_idx" ON "checks" USING btree ("ap_id");