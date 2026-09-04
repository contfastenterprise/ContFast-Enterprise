CREATE TABLE "supplier_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"modelo" varchar(255),
	"medida" varchar(100),
	"color_acabado" varchar(100),
	"linea" varchar(255),
	"num_huecos_cerradura" varchar(50),
	"cantidad" integer NOT NULL,
	"observaciones" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_order_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"current_year" integer NOT NULL,
	"current_sequence" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"observations" text,
	"general_conditions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_order_id_supplier_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."supplier_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_sequences" ADD CONSTRAINT "supplier_order_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_order_lines_order_idx" ON "supplier_order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_order_seq_company_year_modo_idx" ON "supplier_order_sequences" USING btree ("company_id","current_year","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_orders_company_num_modo_idx" ON "supplier_orders" USING btree ("company_id","order_number","modo");--> statement-breakpoint
CREATE INDEX "supplier_orders_status_idx" ON "supplier_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_orders_supplier_idx" ON "supplier_orders" USING btree ("supplier_id");