-- 0032_aislamiento_estructural.sql
--
-- Hace IMPOSIBLE que una fila apunte a datos de otra empresa.
--
-- Hasta ahora el aislamiento entre empresas dependia de que cada consulta se
-- acordara de filtrar por company_id. La auditoria encontro siete sitios donde
-- no se filtraba y se podia mover el saldo bancario, saldar la cuenta por
-- cobrar o vaciar la caja de otra empresa. Se corrigieron uno a uno, pero eso
-- deja el aislamiento a merced de la proxima consulta que alguien escriba.
--
-- Estas claves foraneas compuestas lo mueven a la base: para que una fila de la
-- empresa A pueda apuntar a una fila, esa fila tiene que ser tambien de A. No
-- hay forma de saltarselo desde el codigo.
--
-- SE EXCLUYE `users` A PROPOSITO: el rol sistemas puede cambiar de empresa
-- (POST /api/v1/auth/switch-company) y su users.company_id sigue siendo el de
-- origen, asi que crea filas legitimas en otras empresas. Una clave foranea
-- sobre user_id romperia al super-administrador.
--
-- Las claves se anaden NOT VALID: se aplican a lo que se escriba a partir de
-- ahora sin recorrer las tablas existentes, asi que la migracion entra rapido y
-- no falla aunque haya datos historicos inconsistentes. Ejecuta antes
-- scratch/auditoria_aislamiento.sql para saber si los hay; cuando este limpio,
-- valida con el bloque del final.

-- ── 1. Las tablas destino necesitan UNIQUE (id, company_id) ──────────────
-- Es redundante con la clave primaria, pero PostgreSQL lo exige para poder
-- referenciar ese par desde otra tabla.

DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checks" ADD CONSTRAINT "checks_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "departments" ADD CONSTRAINT "departments_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "positions" ADD CONSTRAINT "positions_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_id_company_uq" UNIQUE (id, company_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Claves foraneas compuestas ───────────────────────────────────────
-- En las columnas que admiten NULL la comprobacion no se aplica cuando la
-- columna es NULL (MATCH SIMPLE, el comportamiento por defecto), que es lo que
-- se quiere: una referencia opcional sin rellenar no es un error.

DO $$ BEGIN
  ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cash_register_id_company_fk"
    FOREIGN KEY ("cash_register_id", company_id) REFERENCES "cash_registers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_company_fk"
    FOREIGN KEY ("cash_session_id", company_id) REFERENCES "cash_sessions"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_invoice_id_company_fk"
    FOREIGN KEY ("invoice_id", company_id) REFERENCES "invoices"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cash_session_summary" ADD CONSTRAINT "cash_session_summary_cash_session_id_company_fk"
    FOREIGN KEY ("cash_session_id", company_id) REFERENCES "cash_sessions"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_company_fk"
    FOREIGN KEY ("bank_account_id", company_id) REFERENCES "bank_accounts"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_company_fk"
    FOREIGN KEY ("bank_account_id", company_id) REFERENCES "bank_accounts"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_company_fk"
    FOREIGN KEY ("department_id", company_id) REFERENCES "departments"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_company_fk"
    FOREIGN KEY ("position_id", company_id) REFERENCES "positions"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_payroll_id_company_fk"
    FOREIGN KEY ("payroll_id", company_id) REFERENCES "payrolls"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_details" ADD CONSTRAINT "payroll_details_employee_id_company_fk"
    FOREIGN KEY ("employee_id", company_id) REFERENCES "employees"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_employee_id_company_fk"
    FOREIGN KEY ("employee_id", company_id) REFERENCES "employees"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employee_income" ADD CONSTRAINT "employee_income_employee_id_company_fk"
    FOREIGN KEY ("employee_id", company_id) REFERENCES "employees"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_employee_id_company_fk"
    FOREIGN KEY ("employee_id", company_id) REFERENCES "employees"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employee_vacations" ADD CONSTRAINT "employee_vacations_employee_id_company_fk"
    FOREIGN KEY ("employee_id", company_id) REFERENCES "employees"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_employee_id_company_fk"
    FOREIGN KEY ("employee_id", company_id) REFERENCES "employees"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employee_settlements" ADD CONSTRAINT "employee_settlements_employee_id_company_fk"
    FOREIGN KEY ("employee_id", company_id) REFERENCES "employees"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_company_fk"
    FOREIGN KEY ("journal_entry_id", company_id) REFERENCES "journal_entries"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_company_fk"
    FOREIGN KEY ("account_id", company_id) REFERENCES "chart_of_accounts"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customer_id_company_fk"
    FOREIGN KEY ("customer_id", company_id) REFERENCES "customers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_invoice_id_company_fk"
    FOREIGN KEY ("invoice_id", company_id) REFERENCES "invoices"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_company_fk"
    FOREIGN KEY ("customer_id", company_id) REFERENCES "customers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_company_fk"
    FOREIGN KEY ("supplier_id", company_id) REFERENCES "suppliers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchase_order_id_company_fk"
    FOREIGN KEY ("purchase_order_id", company_id) REFERENCES "purchase_orders"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_company_fk"
    FOREIGN KEY ("supplier_id", company_id) REFERENCES "suppliers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checks" ADD CONSTRAINT "checks_bank_account_id_company_fk"
    FOREIGN KEY ("bank_account_id", company_id) REFERENCES "bank_accounts"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checks" ADD CONSTRAINT "checks_ap_id_company_fk"
    FOREIGN KEY ("ap_id", company_id) REFERENCES "accounts_payable"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_ap_id_company_fk"
    FOREIGN KEY ("ap_id", company_id) REFERENCES "accounts_payable"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_check_id_company_fk"
    FOREIGN KEY ("check_id", company_id) REFERENCES "checks"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_debit_account_id_company_fk"
    FOREIGN KEY ("debit_account_id", company_id) REFERENCES "chart_of_accounts"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_credit_account_id_company_fk"
    FOREIGN KEY ("credit_account_id", company_id) REFERENCES "chart_of_accounts"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_warehouse_id_company_fk"
    FOREIGN KEY ("warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_company_fk"
    FOREIGN KEY ("supplier_id", company_id) REFERENCES "suppliers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_customer_id_company_fk"
    FOREIGN KEY ("customer_id", company_id) REFERENCES "customers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_supplier_id_company_fk"
    FOREIGN KEY ("supplier_id", company_id) REFERENCES "suppliers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_company_fk"
    FOREIGN KEY ("supplier_id", company_id) REFERENCES "suppliers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_company_fk"
    FOREIGN KEY ("warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "user_warehouses" ADD CONSTRAINT "user_warehouses_warehouse_id_company_fk"
    FOREIGN KEY ("warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_product_id_company_fk"
    FOREIGN KEY ("product_id", company_id) REFERENCES "products"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_warehouse_id_company_fk"
    FOREIGN KEY ("warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_company_fk"
    FOREIGN KEY ("product_id", company_id) REFERENCES "products"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_company_fk"
    FOREIGN KEY ("warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_source_warehouse_id_company_fk"
    FOREIGN KEY ("source_warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destination_warehouse_id_company_fk"
    FOREIGN KEY ("destination_warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_category_id_company_fk"
    FOREIGN KEY ("category_id", company_id) REFERENCES "product_categories"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_company_fk"
    FOREIGN KEY ("price_list_id", company_id) REFERENCES "price_lists"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_company_fk"
    FOREIGN KEY ("product_id", company_id) REFERENCES "products"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_company_fk"
    FOREIGN KEY ("product_id", company_id) REFERENCES "products"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "barcode_print_logs" ADD CONSTRAINT "barcode_print_logs_product_id_company_fk"
    FOREIGN KEY ("product_id", company_id) REFERENCES "products"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_warehouse_id_company_fk"
    FOREIGN KEY ("warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_company_fk"
    FOREIGN KEY ("customer_id", company_id) REFERENCES "customers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_warehouse_id_company_fk"
    FOREIGN KEY ("warehouse_id", company_id) REFERENCES "warehouses"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_company_fk"
    FOREIGN KEY ("customer_id", company_id) REFERENCES "customers"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cash_session_id_company_fk"
    FOREIGN KEY ("cash_session_id", company_id) REFERENCES "cash_sessions"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_company_fk"
    FOREIGN KEY ("quote_id", company_id) REFERENCES "quotes"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_debit_notes" ADD CONSTRAINT "credit_debit_notes_invoice_id_company_fk"
    FOREIGN KEY ("invoice_id", company_id) REFERENCES "invoices"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_company_fk"
    FOREIGN KEY ("invoice_id", company_id) REFERENCES "invoices"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "dgii_submissions" ADD CONSTRAINT "dgii_submissions_invoice_id_company_fk"
    FOREIGN KEY ("invoice_id", company_id) REFERENCES "invoices"(id, company_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Validacion (ejecutar aparte, con los datos ya limpios) ────────────
--
-- VALIDATE recorre la tabla y falla si encuentra una fila que incumple, pero NO
-- bloquea escrituras mientras lo hace. Ejecuta cada linea por separado para
-- saber cual falla, si es que alguna falla.
--

-- ALTER TABLE "cash_sessions" VALIDATE CONSTRAINT "cash_sessions_cash_register_id_company_fk";
-- ALTER TABLE "cash_movements" VALIDATE CONSTRAINT "cash_movements_cash_session_id_company_fk";
-- ALTER TABLE "cash_movements" VALIDATE CONSTRAINT "cash_movements_invoice_id_company_fk";
-- ALTER TABLE "cash_session_summary" VALIDATE CONSTRAINT "cash_session_summary_cash_session_id_company_fk";
-- ALTER TABLE "bank_transactions" VALIDATE CONSTRAINT "bank_transactions_bank_account_id_company_fk";
-- ALTER TABLE "bank_reconciliations" VALIDATE CONSTRAINT "bank_reconciliations_bank_account_id_company_fk";
-- ALTER TABLE "employees" VALIDATE CONSTRAINT "employees_department_id_company_fk";
-- ALTER TABLE "employees" VALIDATE CONSTRAINT "employees_position_id_company_fk";
-- ALTER TABLE "payroll_details" VALIDATE CONSTRAINT "payroll_details_payroll_id_company_fk";
-- ALTER TABLE "payroll_details" VALIDATE CONSTRAINT "payroll_details_employee_id_company_fk";
-- ALTER TABLE "overtime_records" VALIDATE CONSTRAINT "overtime_records_employee_id_company_fk";
-- ALTER TABLE "employee_income" VALIDATE CONSTRAINT "employee_income_employee_id_company_fk";
-- ALTER TABLE "employee_deductions" VALIDATE CONSTRAINT "employee_deductions_employee_id_company_fk";
-- ALTER TABLE "employee_vacations" VALIDATE CONSTRAINT "employee_vacations_employee_id_company_fk";
-- ALTER TABLE "employee_leaves" VALIDATE CONSTRAINT "employee_leaves_employee_id_company_fk";
-- ALTER TABLE "employee_settlements" VALIDATE CONSTRAINT "employee_settlements_employee_id_company_fk";
-- ALTER TABLE "journal_entry_lines" VALIDATE CONSTRAINT "journal_entry_lines_journal_entry_id_company_fk";
-- ALTER TABLE "journal_entry_lines" VALIDATE CONSTRAINT "journal_entry_lines_account_id_company_fk";
-- ALTER TABLE "accounts_receivable" VALIDATE CONSTRAINT "accounts_receivable_customer_id_company_fk";
-- ALTER TABLE "accounts_receivable" VALIDATE CONSTRAINT "accounts_receivable_invoice_id_company_fk";
-- ALTER TABLE "customer_receipts" VALIDATE CONSTRAINT "customer_receipts_customer_id_company_fk";
-- ALTER TABLE "accounts_payable" VALIDATE CONSTRAINT "accounts_payable_supplier_id_company_fk";
-- ALTER TABLE "accounts_payable" VALIDATE CONSTRAINT "accounts_payable_purchase_order_id_company_fk";
-- ALTER TABLE "supplier_payments" VALIDATE CONSTRAINT "supplier_payments_supplier_id_company_fk";
-- ALTER TABLE "checks" VALIDATE CONSTRAINT "checks_bank_account_id_company_fk";
-- ALTER TABLE "checks" VALIDATE CONSTRAINT "checks_ap_id_company_fk";
-- ALTER TABLE "ap_payments" VALIDATE CONSTRAINT "ap_payments_ap_id_company_fk";
-- ALTER TABLE "ap_payments" VALIDATE CONSTRAINT "ap_payments_check_id_company_fk";
-- ALTER TABLE "ap_payments" VALIDATE CONSTRAINT "ap_payments_debit_account_id_company_fk";
-- ALTER TABLE "ap_payments" VALIDATE CONSTRAINT "ap_payments_credit_account_id_company_fk";
-- ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_warehouse_id_company_fk";
-- ALTER TABLE "expenses" VALIDATE CONSTRAINT "expenses_supplier_id_company_fk";
-- ALTER TABLE "financial_movements" VALIDATE CONSTRAINT "financial_movements_customer_id_company_fk";
-- ALTER TABLE "financial_movements" VALIDATE CONSTRAINT "financial_movements_supplier_id_company_fk";
-- ALTER TABLE "purchase_orders" VALIDATE CONSTRAINT "purchase_orders_supplier_id_company_fk";
-- ALTER TABLE "purchase_orders" VALIDATE CONSTRAINT "purchase_orders_warehouse_id_company_fk";
-- ALTER TABLE "user_warehouses" VALIDATE CONSTRAINT "user_warehouses_warehouse_id_company_fk";
-- ALTER TABLE "inventory_levels" VALIDATE CONSTRAINT "inventory_levels_product_id_company_fk";
-- ALTER TABLE "inventory_levels" VALIDATE CONSTRAINT "inventory_levels_warehouse_id_company_fk";
-- ALTER TABLE "inventory_movements" VALIDATE CONSTRAINT "inventory_movements_product_id_company_fk";
-- ALTER TABLE "inventory_movements" VALIDATE CONSTRAINT "inventory_movements_warehouse_id_company_fk";
-- ALTER TABLE "inventory_transfers" VALIDATE CONSTRAINT "inventory_transfers_source_warehouse_id_company_fk";
-- ALTER TABLE "inventory_transfers" VALIDATE CONSTRAINT "inventory_transfers_destination_warehouse_id_company_fk";
-- ALTER TABLE "products" VALIDATE CONSTRAINT "products_category_id_company_fk";
-- ALTER TABLE "price_list_items" VALIDATE CONSTRAINT "price_list_items_price_list_id_company_fk";
-- ALTER TABLE "price_list_items" VALIDATE CONSTRAINT "price_list_items_product_id_company_fk";
-- ALTER TABLE "product_barcodes" VALIDATE CONSTRAINT "product_barcodes_product_id_company_fk";
-- ALTER TABLE "barcode_print_logs" VALIDATE CONSTRAINT "barcode_print_logs_product_id_company_fk";
-- ALTER TABLE "quotes" VALIDATE CONSTRAINT "quotes_warehouse_id_company_fk";
-- ALTER TABLE "quotes" VALIDATE CONSTRAINT "quotes_customer_id_company_fk";
-- ALTER TABLE "invoices" VALIDATE CONSTRAINT "invoices_warehouse_id_company_fk";
-- ALTER TABLE "invoices" VALIDATE CONSTRAINT "invoices_customer_id_company_fk";
-- ALTER TABLE "invoices" VALIDATE CONSTRAINT "invoices_cash_session_id_company_fk";
-- ALTER TABLE "invoices" VALIDATE CONSTRAINT "invoices_quote_id_company_fk";
-- ALTER TABLE "credit_debit_notes" VALIDATE CONSTRAINT "credit_debit_notes_invoice_id_company_fk";
-- ALTER TABLE "delivery_notes" VALIDATE CONSTRAINT "delivery_notes_invoice_id_company_fk";
-- ALTER TABLE "dgii_submissions" VALIDATE CONSTRAINT "dgii_submissions_invoice_id_company_fk";
