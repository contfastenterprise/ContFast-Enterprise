ALTER TABLE "invoices" ADD COLUMN "total_retained" numeric(15, 2) DEFAULT '0.00' NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "total_net" numeric(15, 2) DEFAULT '0.00' NOT NULL;

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

CREATE INDEX "invoice_retentions_invoice_idx" ON "invoice_retentions" ("invoice_id");

ALTER TABLE "retentions" ADD CONSTRAINT "retentions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_retention_id_retentions_id_fk" FOREIGN KEY ("retention_id") REFERENCES "retentions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "invoice_retentions" ADD CONSTRAINT "invoice_retentions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;

-- Seed default retentions
INSERT INTO "retentions" ("name", "percentage", "type", "active") VALUES
('Retención ISR 2%', 2.00, 'ISR', true),
('Retención ISR 10%', 10.00, 'ISR', true),
('Retención ISR 27%', 27.00, 'ISR', true),
('Retención ITBIS 30%', 30.00, 'ITBIS', true),
('Retención ITBIS 75%', 75.00, 'ITBIS', true),
('Retención ITBIS 100%', 100.00, 'ITBIS', true);
