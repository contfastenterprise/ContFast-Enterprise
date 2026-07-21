CREATE TABLE "barcode_print_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_barcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"barcode" varchar(100) NOT NULL,
	"barcode_type" varchar(30) NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "barcode_default_type" varchar(30) DEFAULT 'code128' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "barcode_prefix" varchar(20) DEFAULT 'COD' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "barcode_length" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "barcode_print_logs_company_idx" ON "barcode_print_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "barcode_print_logs_product_idx" ON "barcode_print_logs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "prod_barcodes_company_idx" ON "product_barcodes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "prod_barcodes_product_idx" ON "product_barcodes" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prod_barcodes_barcode_idx" ON "product_barcodes" USING btree ("company_id","barcode");