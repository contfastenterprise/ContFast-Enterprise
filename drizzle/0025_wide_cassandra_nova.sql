ALTER TABLE "company_settings" ADD COLUMN "print_copies" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "mseller_xml_path" text;