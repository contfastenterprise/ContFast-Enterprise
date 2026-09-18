ALTER TABLE "notifications" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "clave" varchar(120) NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "action_text" varchar(80);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "action_link" varchar(255);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_clave_idx" ON "notifications" USING btree ("company_id","modo","clave");--> statement-breakpoint
CREATE INDEX "notifications_vivos_idx" ON "notifications" USING btree ("company_id","modo","resolved_at");