CREATE TABLE "audit_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"ip_address" varchar(45),
	"route" text NOT NULL,
	"method" varchar(10) NOT NULL,
	"allowed" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_pattern" varchar(255) NOT NULL,
	"module" varchar(100) NOT NULL,
	"action" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_permissions" ADD CONSTRAINT "audit_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_permissions" ADD CONSTRAINT "audit_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_permissions_company_idx" ON "audit_permissions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_permissions_user_idx" ON "audit_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_permissions_created_idx" ON "audit_permissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "route_mappings_pattern_idx" ON "route_mappings" USING btree ("route_pattern");
--> statement-breakpoint
INSERT INTO "route_mappings" ("route_pattern", "module", "action") VALUES
('/dashboard/accounting%', 'contabilidad', 'read'),
('/api/v1/accounting%', 'contabilidad', NULL),
('/dashboard/invoices%', 'facturacion', 'read'),
('/api/v1/invoices%', 'facturacion', NULL),
('/dashboard/adjustments%', 'facturacion', 'read'),
('/api/v1/adjustments%', 'facturacion', NULL),
('/dashboard/cash%', 'caja', 'read'),
('/api/v1/cash%', 'caja', NULL),
('/dashboard/bank%', 'banco', 'read'),
('/api/v1/bank%', 'banco', NULL),
('/dashboard/customers%', 'clientes', 'read'),
('/api/v1/customers%', 'clientes', NULL),
('/dashboard/suppliers%', 'proveedores', 'read'),
('/api/v1/suppliers%', 'proveedores', NULL),
('/dashboard/products%', 'catalogo', 'read'),
('/api/v1/products%', 'catalogo', NULL),
('/dashboard/inventory%', 'catalogo', 'read'),
('/api/v1/categories%', 'catalogo', NULL),
('/api/v1/inventory%', 'catalogo', NULL),
('/dashboard/reports%', 'reportes', 'read'),
('/api/v1/reports%', 'reportes', NULL),
('/dashboard/admin%', 'administracion', 'read'),
('/api/v1/admin%', 'administracion', NULL),
('/dashboard/settings%', 'administracion', 'read'),
('/api/v1/company/settings%', 'administracion', NULL),
('/dashboard/hr%', 'nomina', 'read'),
('/api/v1/hr%', 'nomina', NULL),
('/dashboard/retentions%', 'retenciones', 'read'),
('/api/v1/retentions%', 'retenciones', NULL),
('/dashboard/delivery-notes%', 'conduce', 'read'),
('/api/v1/delivery-notes%', 'conduce', NULL);