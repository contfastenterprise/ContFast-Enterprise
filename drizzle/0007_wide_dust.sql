CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"expense_type" varchar(2) NOT NULL,
	"ncf" varchar(19) NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "mseller_entorno" varchar(50) DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "mseller_email" varchar(255);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "mseller_password_encrypted" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_company_idx" ON "expenses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "expense_supplier_idx" ON "expenses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "expense_issue_date_idx" ON "expenses" USING btree ("issue_date");