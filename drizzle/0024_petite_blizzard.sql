ALTER TABLE "customers" ALTER COLUMN "rnc_cedula" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "rnc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" DROP COLUMN "cert_p12_encrypted";--> statement-breakpoint
ALTER TABLE "company_settings" DROP COLUMN "cert_password_encrypted";