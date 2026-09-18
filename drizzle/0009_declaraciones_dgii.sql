CREATE TABLE "declaraciones_dgii" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"modo" "environment_mode" NOT NULL,
	"tipo" varchar(8) NOT NULL,
	"periodo" varchar(6) NOT NULL,
	"presentada_por" uuid,
	"presentada_en" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "declaraciones_dgii" ADD CONSTRAINT "declaraciones_dgii_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaraciones_dgii" ADD CONSTRAINT "declaraciones_dgii_presentada_por_users_id_fk" FOREIGN KEY ("presentada_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "declaraciones_dgii_unica_idx" ON "declaraciones_dgii" USING btree ("company_id","modo","tipo","periodo");