ALTER TABLE "ecf_sequences" ADD COLUMN "sequence_expiry" varchar(10);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_rnc" varchar(15);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_name" varchar(255);