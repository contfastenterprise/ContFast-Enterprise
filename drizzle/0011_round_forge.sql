ALTER TABLE "company_settings" ALTER COLUMN "mseller_url" SET DEFAULT 'https://ecf.api.mseller.app/v1';--> statement-breakpoint
ALTER TABLE "delivery_notes" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "address" varchar(255);--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "delivery_number" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "dispatcher_name" varchar(255);--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "modified_ncf" varchar(13);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "modified_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "codigo_factura" varchar(50);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "delivery_status" varchar(50) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_notes_num_idx" ON "delivery_notes" USING btree ("company_id","delivery_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_codigo_factura_idx" ON "invoices" USING btree ("codigo_factura");