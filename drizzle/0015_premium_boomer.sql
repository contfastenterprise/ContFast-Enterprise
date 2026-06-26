CREATE INDEX IF NOT EXISTS "expense_comp_issue_date_idx" ON "expenses" USING btree ("company_id","issue_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_comp_status_created_idx" ON "invoices" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_comp_status_date_idx" ON "journal_entries" USING btree ("company_id","status","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_comp_acc_idx" ON "journal_entry_lines" USING btree ("company_id","account_id");