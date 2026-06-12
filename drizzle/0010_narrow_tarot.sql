ALTER TABLE "invoices" ADD COLUMN "payment_type" varchar(50) DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "transaction_number" varchar(100);