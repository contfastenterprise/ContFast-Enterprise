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
ALTER TABLE "chart_of_accounts" ADD COLUMN "nature" varchar(20) DEFAULT 'debit' NOT NULL;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD COLUMN "is_transactional" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_mappings" ADD CONSTRAINT "accounting_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_mappings" ADD CONSTRAINT "accounting_mappings_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_mappings_company_key_idx" ON "accounting_mappings" USING btree ("company_id","mapping_key");--> statement-breakpoint
CREATE INDEX "accounting_periods_company_idx" ON "accounting_periods" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "accounting_periods_status_idx" ON "accounting_periods" USING btree ("status");