-- Lote 247: precios atados al dolar.
--
-- TRES TABLAS NUEVAS y ninguna columna en las que ya existen, a proposito: una
-- columna nueva en `products` la pediria toda consulta que lee la fila entera, y
-- un despliegue hecho antes de aplicar esta migracion tumbaria el catalogo (lo
-- que paso con las 0013 y 0015). Con tablas aparte, sin la migracion todo sigue
-- como hoy y solo la pantalla de "Precios en dolares" dice que falta.
--
-- Sin `modo`: el catalogo de productos tampoco lo lleva (los precios son los
-- mismos en PRODUCCION y en PRUEBA).

-- La tasa PROPIA de la empresa, escrita a mano. Una por dia: corregirla el mismo
-- dia la sustituye; la de otro dia queda de historial.
CREATE TABLE "tasas_de_cambio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tasa" numeric(12, 4) NOT NULL,
	"registrada_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tasas_de_cambio_positiva" CHECK ("tasa" > 0)
);
--> statement-breakpoint
ALTER TABLE "tasas_de_cambio" ADD CONSTRAINT "tasas_de_cambio_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasas_de_cambio" ADD CONSTRAINT "tasas_de_cambio_registrada_por_users_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasas_de_cambio_dia_idx" ON "tasas_de_cambio" USING btree ("company_id","fecha");--> statement-breakpoint

-- Los productos cuyo precio sigue al dolar, con su costo en dolares (fijado por
-- producto) y la tasa con la que se calcularon sus precios la ultima vez.
CREATE TABLE "productos_en_dolares" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"costo_usd" numeric(15, 4) NOT NULL,
	"tasa_aplicada" numeric(12, 4),
	"aplicada_en" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "productos_en_dolares_costo_positivo" CHECK ("costo_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "productos_en_dolares" ADD CONSTRAINT "productos_en_dolares_producto_fk" FOREIGN KEY ("product_id","company_id") REFERENCES "public"."products"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "productos_en_dolares_company_idx" ON "productos_en_dolares" USING btree ("company_id");--> statement-breakpoint

-- Lo que cada actualizacion cambio: quien, con que tasa, y el costo y los precios
-- de antes y de despues. Es lo unico que permite contestar "por que este precio
-- es este" semanas despues.
CREATE TABLE "cambios_de_precio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"tasa" numeric(12, 4) NOT NULL,
	"costo_usd" numeric(15, 4) NOT NULL,
	"antes" jsonb NOT NULL,
	"despues" jsonb NOT NULL,
	"aplicado_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cambios_de_precio" ADD CONSTRAINT "cambios_de_precio_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambios_de_precio" ADD CONSTRAINT "cambios_de_precio_aplicado_por_users_id_fk" FOREIGN KEY ("aplicado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cambios_de_precio_producto_idx" ON "cambios_de_precio" USING btree ("company_id","product_id","created_at");
