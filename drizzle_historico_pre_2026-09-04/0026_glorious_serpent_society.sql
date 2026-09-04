CREATE TYPE "public"."environment_mode" AS ENUM('PRODUCCION', 'PRUEBA');--> statement-breakpoint
DROP INDEX "inventory_levels_prod_wh_idx";--> statement-breakpoint
DROP INDEX "delivery_notes_num_idx";--> statement-breakpoint
DROP INDEX "ecf_seq_company_type_idx";--> statement-breakpoint
DROP INDEX "invoices_company_ncf_idx";--> statement-breakpoint
DROP INDEX "invoices_codigo_factura_idx";--> statement-breakpoint
DROP INDEX "invoices_comp_status_created_idx";--> statement-breakpoint
DROP INDEX "quote_seq_company_year_idx";--> statement-breakpoint
DROP INDEX "quotes_company_seq_idx";--> statement-breakpoint
DROP INDEX "checks_company_num_idx";--> statement-breakpoint
DROP INDEX "employee_vacations_employee_idx";--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_session_summary" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_debit_notes" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "dgii_submissions" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "ecf_sequences" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_sequences" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "employee_deductions" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_income" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_leaves" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_settlements" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_vacations" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_details" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
ALTER TABLE "payrolls" ADD COLUMN "modo" "environment_mode" DEFAULT 'PRODUCCION' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_levels_prod_wh_modo_idx" ON "inventory_levels" USING btree ("product_id","warehouse_id","modo");--> statement-breakpoint
CREATE INDEX "inventory_levels_company_modo_idx" ON "inventory_levels" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "inv_movements_company_modo_idx" ON "inventory_movements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "inv_transfers_company_modo_idx" ON "inventory_transfers" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "cash_movements_company_modo_idx" ON "cash_movements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "cash_session_summary_company_modo_idx" ON "cash_session_summary" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "cash_sessions_company_modo_idx" ON "cash_sessions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "credit_debit_notes_company_modo_idx" ON "credit_debit_notes" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_notes_num_modo_idx" ON "delivery_notes" USING btree ("company_id","delivery_number","modo");--> statement-breakpoint
CREATE INDEX "dgii_submissions_company_modo_idx" ON "dgii_submissions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "ecf_seq_company_type_modo_idx" ON "ecf_sequences" USING btree ("company_id","ecf_type","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_company_ncf_modo_idx" ON "invoices" USING btree ("company_id","ncf","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_codigo_factura_modo_idx" ON "invoices" USING btree ("codigo_factura","modo");--> statement-breakpoint
CREATE INDEX "invoices_comp_status_created_modo_idx" ON "invoices" USING btree ("company_id","status","created_at","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_seq_company_year_modo_idx" ON "quote_sequences" USING btree ("company_id","current_year","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_company_seq_modo_idx" ON "quotes" USING btree ("company_id","sequence_number","modo");--> statement-breakpoint
CREATE INDEX "bank_recon_company_modo_idx" ON "bank_reconciliations" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "bank_txs_company_modo_idx" ON "bank_transactions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "accounting_periods_company_modo_idx" ON "accounting_periods" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "ap_company_modo_idx" ON "accounts_payable" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "ar_company_modo_idx" ON "accounts_receivable" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "ap_payments_company_modo_idx" ON "ap_payments" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "checks_company_num_modo_idx" ON "checks" USING btree ("company_id","check_number","modo");--> statement-breakpoint
CREATE INDEX "cust_receipts_company_modo_idx" ON "customer_receipts" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "expense_company_modo_idx" ON "expenses" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "fin_mov_company_modo_idx" ON "financial_movements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "journal_entries_company_modo_idx" ON "journal_entries" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_company_modo_idx" ON "journal_entry_lines" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "supp_pay_company_modo_idx" ON "supplier_payments" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "audit_logs_company_modo_idx" ON "audit_logs" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_deductions_company_modo_idx" ON "employee_deductions" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_income_company_modo_idx" ON "employee_income" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_leaves_company_modo_idx" ON "employee_leaves" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "employee_settlements_company_modo_idx" ON "employee_settlements" USING btree ("company_id","modo");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_vacations_employee_modo_idx" ON "employee_vacations" USING btree ("employee_id","modo");--> statement-breakpoint
CREATE INDEX "overtime_records_company_modo_idx" ON "overtime_records" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "payroll_details_company_modo_idx" ON "payroll_details" USING btree ("company_id","modo");--> statement-breakpoint
CREATE INDEX "payrolls_company_modo_idx" ON "payrolls" USING btree ("company_id","modo");--> statement-breakpoint
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND column_name = 'company_id'
    LOOP
        -- Check if table also has 'modo' column to apply double isolation (company + environment)
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = r.table_name 
              AND column_name = 'modo'
        ) THEN
            -- Drop existing policy
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', r.table_name);
            
            -- Create updated policy with company_id and modo checks
            EXECUTE format('
                CREATE POLICY tenant_isolation_policy ON %I
                FOR ALL
                USING (
                    ((NULLIF(current_setting(''app.current_company_id'', true), '''') IS NULL) OR
                    (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid))
                    AND
                    ((NULLIF(current_setting(''app.current_environment'', true), '''') IS NULL) OR
                    (modo = NULLIF(current_setting(''app.current_environment'', true), '''')::public.environment_mode))
                )
                WITH CHECK (
                    ((NULLIF(current_setting(''app.current_company_id'', true), '''') IS NULL) OR
                    (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid))
                    AND
                    ((NULLIF(current_setting(''app.current_environment'', true), '''') IS NULL) OR
                    (modo = NULLIF(current_setting(''app.current_environment'', true), '''')::public.environment_mode))
                )
            ', r.table_name);
            
            RAISE NOTICE 'Updated RLS policy with environment isolation on table %', r.table_name;
        END IF;
    END LOOP;
END $$;