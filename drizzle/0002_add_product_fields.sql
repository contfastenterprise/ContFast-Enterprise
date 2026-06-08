ALTER TABLE "products" ADD COLUMN "unit_of_measure" varchar(50) DEFAULT 'unidad' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_consumidor" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_proveedor" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_mayorista" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "barcode" varchar(100);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_barcode_idx" ON "products" USING btree ("company_id", "barcode");
