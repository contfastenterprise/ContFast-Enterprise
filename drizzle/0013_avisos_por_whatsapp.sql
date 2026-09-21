ALTER TABLE "company_settings" ADD COLUMN "whatsapp_avisos" varchar(20);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "whatsapp_enviado_at" timestamp;
