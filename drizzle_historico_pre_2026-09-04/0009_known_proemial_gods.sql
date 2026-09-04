CREATE TABLE "expense_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_cost" numeric(15, 2) NOT NULL,
	"subtotal" numeric(15, 2) NOT NULL,
	"itbis" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "supplier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "ncf" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "color" varchar(50) DEFAULT '#003366' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "is_minor_expense" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_line_exp_idx" ON "expense_lines" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_line_prod_idx" ON "expense_lines" USING btree ("product_id");