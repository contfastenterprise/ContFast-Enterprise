CREATE TABLE "reservas_nota_credito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" NOT NULL,
	"invoice_id" uuid NOT NULL,
	"monto" numeric(15, 2) NOT NULL,
	"expira_en" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservas_nota_credito" ADD CONSTRAINT "reservas_nota_credito_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_nota_credito" ADD CONSTRAINT "reservas_nota_credito_invoice_company_fk" FOREIGN KEY ("invoice_id","company_id") REFERENCES "public"."invoices"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservas_nota_credito_factura_idx" ON "reservas_nota_credito" USING btree ("invoice_id","expira_en");