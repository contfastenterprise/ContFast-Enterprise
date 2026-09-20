ALTER TABLE "cash_sessions" ADD COLUMN "conteo" jsonb;--> statement-breakpoint
ALTER TABLE "cash_session_summary" ADD COLUMN "conteo" jsonb;--> statement-breakpoint
ALTER TABLE "cash_session_summary" ADD COLUMN "total_transferencias" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_session_summary" ADD COLUMN "transferencias" jsonb;
