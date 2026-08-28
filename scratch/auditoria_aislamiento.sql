-- auditoria_aislamiento.sql
--
-- Busca filas que apunten a datos de OTRA empresa. Ejecutalo contra la base
-- real ANTES de aplicar la migracion 0032: si alguna consulta devuelve filas,
-- hay que decidir que hacer con ellas antes de validar las claves foraneas.
--
-- No modifica nada.

SELECT 'cash_sessions.cash_register_id -> cash_registers' AS relacion, count(*) AS filas_ajenas
  FROM "cash_sessions" t JOIN "cash_registers" d ON d.id = t."cash_register_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'cash_movements.cash_session_id -> cash_sessions' AS relacion, count(*) AS filas_ajenas
  FROM "cash_movements" t JOIN "cash_sessions" d ON d.id = t."cash_session_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'cash_movements.invoice_id -> invoices' AS relacion, count(*) AS filas_ajenas
  FROM "cash_movements" t JOIN "invoices" d ON d.id = t."invoice_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'cash_session_summary.cash_session_id -> cash_sessions' AS relacion, count(*) AS filas_ajenas
  FROM "cash_session_summary" t JOIN "cash_sessions" d ON d.id = t."cash_session_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'bank_transactions.bank_account_id -> bank_accounts' AS relacion, count(*) AS filas_ajenas
  FROM "bank_transactions" t JOIN "bank_accounts" d ON d.id = t."bank_account_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'bank_reconciliations.bank_account_id -> bank_accounts' AS relacion, count(*) AS filas_ajenas
  FROM "bank_reconciliations" t JOIN "bank_accounts" d ON d.id = t."bank_account_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'employees.department_id -> departments' AS relacion, count(*) AS filas_ajenas
  FROM "employees" t JOIN "departments" d ON d.id = t."department_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'employees.position_id -> positions' AS relacion, count(*) AS filas_ajenas
  FROM "employees" t JOIN "positions" d ON d.id = t."position_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'payroll_details.payroll_id -> payrolls' AS relacion, count(*) AS filas_ajenas
  FROM "payroll_details" t JOIN "payrolls" d ON d.id = t."payroll_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'payroll_details.employee_id -> employees' AS relacion, count(*) AS filas_ajenas
  FROM "payroll_details" t JOIN "employees" d ON d.id = t."employee_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'overtime_records.employee_id -> employees' AS relacion, count(*) AS filas_ajenas
  FROM "overtime_records" t JOIN "employees" d ON d.id = t."employee_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'employee_income.employee_id -> employees' AS relacion, count(*) AS filas_ajenas
  FROM "employee_income" t JOIN "employees" d ON d.id = t."employee_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'employee_deductions.employee_id -> employees' AS relacion, count(*) AS filas_ajenas
  FROM "employee_deductions" t JOIN "employees" d ON d.id = t."employee_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'employee_vacations.employee_id -> employees' AS relacion, count(*) AS filas_ajenas
  FROM "employee_vacations" t JOIN "employees" d ON d.id = t."employee_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'employee_leaves.employee_id -> employees' AS relacion, count(*) AS filas_ajenas
  FROM "employee_leaves" t JOIN "employees" d ON d.id = t."employee_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'employee_settlements.employee_id -> employees' AS relacion, count(*) AS filas_ajenas
  FROM "employee_settlements" t JOIN "employees" d ON d.id = t."employee_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'journal_entry_lines.journal_entry_id -> journal_entries' AS relacion, count(*) AS filas_ajenas
  FROM "journal_entry_lines" t JOIN "journal_entries" d ON d.id = t."journal_entry_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'journal_entry_lines.account_id -> chart_of_accounts' AS relacion, count(*) AS filas_ajenas
  FROM "journal_entry_lines" t JOIN "chart_of_accounts" d ON d.id = t."account_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'accounts_receivable.customer_id -> customers' AS relacion, count(*) AS filas_ajenas
  FROM "accounts_receivable" t JOIN "customers" d ON d.id = t."customer_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'accounts_receivable.invoice_id -> invoices' AS relacion, count(*) AS filas_ajenas
  FROM "accounts_receivable" t JOIN "invoices" d ON d.id = t."invoice_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'customer_receipts.customer_id -> customers' AS relacion, count(*) AS filas_ajenas
  FROM "customer_receipts" t JOIN "customers" d ON d.id = t."customer_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'accounts_payable.supplier_id -> suppliers' AS relacion, count(*) AS filas_ajenas
  FROM "accounts_payable" t JOIN "suppliers" d ON d.id = t."supplier_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'accounts_payable.purchase_order_id -> purchase_orders' AS relacion, count(*) AS filas_ajenas
  FROM "accounts_payable" t JOIN "purchase_orders" d ON d.id = t."purchase_order_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'supplier_payments.supplier_id -> suppliers' AS relacion, count(*) AS filas_ajenas
  FROM "supplier_payments" t JOIN "suppliers" d ON d.id = t."supplier_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'checks.bank_account_id -> bank_accounts' AS relacion, count(*) AS filas_ajenas
  FROM "checks" t JOIN "bank_accounts" d ON d.id = t."bank_account_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'checks.ap_id -> accounts_payable' AS relacion, count(*) AS filas_ajenas
  FROM "checks" t JOIN "accounts_payable" d ON d.id = t."ap_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'ap_payments.ap_id -> accounts_payable' AS relacion, count(*) AS filas_ajenas
  FROM "ap_payments" t JOIN "accounts_payable" d ON d.id = t."ap_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'ap_payments.check_id -> checks' AS relacion, count(*) AS filas_ajenas
  FROM "ap_payments" t JOIN "checks" d ON d.id = t."check_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'ap_payments.debit_account_id -> chart_of_accounts' AS relacion, count(*) AS filas_ajenas
  FROM "ap_payments" t JOIN "chart_of_accounts" d ON d.id = t."debit_account_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'ap_payments.credit_account_id -> chart_of_accounts' AS relacion, count(*) AS filas_ajenas
  FROM "ap_payments" t JOIN "chart_of_accounts" d ON d.id = t."credit_account_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'expenses.warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "expenses" t JOIN "warehouses" d ON d.id = t."warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'expenses.supplier_id -> suppliers' AS relacion, count(*) AS filas_ajenas
  FROM "expenses" t JOIN "suppliers" d ON d.id = t."supplier_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'financial_movements.customer_id -> customers' AS relacion, count(*) AS filas_ajenas
  FROM "financial_movements" t JOIN "customers" d ON d.id = t."customer_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'financial_movements.supplier_id -> suppliers' AS relacion, count(*) AS filas_ajenas
  FROM "financial_movements" t JOIN "suppliers" d ON d.id = t."supplier_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'purchase_orders.supplier_id -> suppliers' AS relacion, count(*) AS filas_ajenas
  FROM "purchase_orders" t JOIN "suppliers" d ON d.id = t."supplier_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'purchase_orders.warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "purchase_orders" t JOIN "warehouses" d ON d.id = t."warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'user_warehouses.warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "user_warehouses" t JOIN "warehouses" d ON d.id = t."warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'inventory_levels.product_id -> products' AS relacion, count(*) AS filas_ajenas
  FROM "inventory_levels" t JOIN "products" d ON d.id = t."product_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'inventory_levels.warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "inventory_levels" t JOIN "warehouses" d ON d.id = t."warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'inventory_movements.product_id -> products' AS relacion, count(*) AS filas_ajenas
  FROM "inventory_movements" t JOIN "products" d ON d.id = t."product_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'inventory_movements.warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "inventory_movements" t JOIN "warehouses" d ON d.id = t."warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'inventory_transfers.source_warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "inventory_transfers" t JOIN "warehouses" d ON d.id = t."source_warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'inventory_transfers.destination_warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "inventory_transfers" t JOIN "warehouses" d ON d.id = t."destination_warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'products.category_id -> product_categories' AS relacion, count(*) AS filas_ajenas
  FROM "products" t JOIN "product_categories" d ON d.id = t."category_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'price_list_items.price_list_id -> price_lists' AS relacion, count(*) AS filas_ajenas
  FROM "price_list_items" t JOIN "price_lists" d ON d.id = t."price_list_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'price_list_items.product_id -> products' AS relacion, count(*) AS filas_ajenas
  FROM "price_list_items" t JOIN "products" d ON d.id = t."product_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'product_barcodes.product_id -> products' AS relacion, count(*) AS filas_ajenas
  FROM "product_barcodes" t JOIN "products" d ON d.id = t."product_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'barcode_print_logs.product_id -> products' AS relacion, count(*) AS filas_ajenas
  FROM "barcode_print_logs" t JOIN "products" d ON d.id = t."product_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'quotes.warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "quotes" t JOIN "warehouses" d ON d.id = t."warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'quotes.customer_id -> customers' AS relacion, count(*) AS filas_ajenas
  FROM "quotes" t JOIN "customers" d ON d.id = t."customer_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'invoices.warehouse_id -> warehouses' AS relacion, count(*) AS filas_ajenas
  FROM "invoices" t JOIN "warehouses" d ON d.id = t."warehouse_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'invoices.customer_id -> customers' AS relacion, count(*) AS filas_ajenas
  FROM "invoices" t JOIN "customers" d ON d.id = t."customer_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'invoices.cash_session_id -> cash_sessions' AS relacion, count(*) AS filas_ajenas
  FROM "invoices" t JOIN "cash_sessions" d ON d.id = t."cash_session_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'invoices.quote_id -> quotes' AS relacion, count(*) AS filas_ajenas
  FROM "invoices" t JOIN "quotes" d ON d.id = t."quote_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'credit_debit_notes.invoice_id -> invoices' AS relacion, count(*) AS filas_ajenas
  FROM "credit_debit_notes" t JOIN "invoices" d ON d.id = t."invoice_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'delivery_notes.invoice_id -> invoices' AS relacion, count(*) AS filas_ajenas
  FROM "delivery_notes" t JOIN "invoices" d ON d.id = t."invoice_id"
 WHERE d.company_id <> t.company_id
UNION ALL
SELECT 'dgii_submissions.invoice_id -> invoices' AS relacion, count(*) AS filas_ajenas
  FROM "dgii_submissions" t JOIN "invoices" d ON d.id = t."invoice_id"
 WHERE d.company_id <> t.company_id
 ORDER BY 2 DESC, 1;
