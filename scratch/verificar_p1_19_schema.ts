/**
 * P1-19: alinear src/db/schema/*.ts con lo que la base de datos real ya tiene.
 *
 * Contexto (ver docs/auditoria/auditoria_2026-09-03.md, P1-19): drizzle-kit
 * tenia deriva entre las migraciones .sql y su propio journal/meta -- pero al
 * investigar se encontro algo mas grande: la migracion 0032
 * (aislamiento_estructural, aplicada en produccion el 2026-09-01, antes de
 * la auditoria) y la 0039 (cuenta_contable_del_banco) agregaron 20
 * restricciones UNIQUE(id, company_id) y 58 FOREIGN KEY compuestas
 * (columna_id, company_id) -> tabla_referenciada(id, company_id) contra la
 * base real -- pero schema.ts nunca las declaro. Drizzle no sabia que
 * existian: cualquier `drizzle-kit generate` a partir de schema.ts las
 * habria intentado borrar.
 *
 * Este lote NO cambia la base de datos -- las 78 restricciones ya existen
 * ahi, aplicadas por 0032/0039. Es documentacion: hace que schema.ts (y por
 * tanto cualquier introspeccion/generate futuro) reconozca lo que ya es
 * verdad en produccion. "Cerrar el hueco hacia adelante": nada de esto
 * valida datos historicos ni corre contra la base real.
 *
 * Los datos exactos (20 unicos, 58 fks, con su tabla/columna/nombre) se
 * extrajeron leyendo linea por linea drizzle/0032_aislamiento_estructural.sql
 * y drizzle/0039_cuenta_contable_del_banco.sql -- no de la introspeccion,
 * que es la fuente derivada.
 *
 * Ademas: bank.ts tenia una FK simple + un comentario en chartAccountId que
 * decian "esto lo agrego la migracion 0052" -- pero 0039 (dos dias antes de
 * la auditoria que genero el hallazgo P1-20 de esa 0052) ya habia agregado
 * la FK compuesta real. Se corrigio el comentario y se reemplazo la FK
 * simple por la compuesta verdadera; 0052 se deja en drizzle/ sin aplicar,
 * con una nota explicando que quedo superada.
 *
 * Banco de solo-codigo (no toca la base de datos).
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const accounting = fuente('src/db/schema/accounting.ts');
const accountingCrudo = crudo('src/db/schema/accounting.ts');
const bank = fuente('src/db/schema/bank.ts');
const bankCrudo = crudo('src/db/schema/bank.ts');
const cash = fuente('src/db/schema/cash.ts');
const cashCrudo = crudo('src/db/schema/cash.ts');
const contacts = fuente('src/db/schema/contacts.ts');
const contactsCrudo = crudo('src/db/schema/contacts.ts');
const hr = fuente('src/db/schema/hr.ts');
const hrCrudo = crudo('src/db/schema/hr.ts');
const inventory = fuente('src/db/schema/inventory.ts');
const inventoryCrudo = crudo('src/db/schema/inventory.ts');
const invoices = fuente('src/db/schema/invoices.ts');
const invoicesCrudo = crudo('src/db/schema/invoices.ts');
const products = fuente('src/db/schema/products.ts');
const productsCrudo = crudo('src/db/schema/products.ts');
const supplierOrders = fuente('src/db/schema/supplier_orders.ts');
const supplierOrdersCrudo = crudo('src/db/schema/supplier_orders.ts');

console.log('\n=== 20 UNIQUE(id, company_id) + 58 FOREIGN KEY compuestas (migracion 0032/0039) ===\n');

// == src/db/schema/accounting.ts ==
ok('src/db/schema/accounting.ts: importa unique y foreignKey', accountingCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('accounts_payable: unique(id, companyId) -> accounts_payable_id_company_uq', /idCompanyUq: unique\('accounts_payable_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(accounting));
ok('chart_of_accounts: unique(id, companyId) -> chart_of_accounts_id_company_uq', /idCompanyUq: unique\('chart_of_accounts_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(accounting));
ok('checks: unique(id, companyId) -> checks_id_company_uq', /idCompanyUq: unique\('checks_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(accounting));
ok('journal_entries: unique(id, companyId) -> journal_entries_id_company_uq', /idCompanyUq: unique\('journal_entries_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(accounting));
ok('journal_entry_lines.journal_entry_id: FK compuesta -> journal_entries (journal_entry_lines_journal_entry_id_company_fk)', /journalEntryCompanyFk: foreignKey\(\{\s*columns: \[table\.journalEntryId, table\.companyId\],\s*foreignColumns: \[journalEntries\.id, journalEntries\.companyId\],\s*name: 'journal_entry_lines_journal_entry_id_company_fk',\s*\}\)/.test(accounting));
ok('journal_entry_lines.account_id: FK compuesta -> chart_of_accounts (journal_entry_lines_account_id_company_fk)', /accountCompanyFk: foreignKey\(\{\s*columns: \[table\.accountId, table\.companyId\],\s*foreignColumns: \[chartOfAccounts\.id, chartOfAccounts\.companyId\],\s*name: 'journal_entry_lines_account_id_company_fk',\s*\}\)/.test(accounting));
ok('accounts_receivable.customer_id: FK compuesta -> customers (accounts_receivable_customer_id_company_fk)', /customerCompanyFk: foreignKey\(\{\s*columns: \[table\.customerId, table\.companyId\],\s*foreignColumns: \[customers\.id, customers\.companyId\],\s*name: 'accounts_receivable_customer_id_company_fk',\s*\}\)/.test(accounting));
ok('accounts_receivable.invoice_id: FK compuesta -> invoices (accounts_receivable_invoice_id_company_fk)', /invoiceCompanyFk: foreignKey\(\{\s*columns: \[table\.invoiceId, table\.companyId\],\s*foreignColumns: \[invoices\.id, invoices\.companyId\],\s*name: 'accounts_receivable_invoice_id_company_fk',\s*\}\)/.test(accounting));
ok('customer_receipts.customer_id: FK compuesta -> customers (customer_receipts_customer_id_company_fk)', /customerCompanyFk: foreignKey\(\{\s*columns: \[table\.customerId, table\.companyId\],\s*foreignColumns: \[customers\.id, customers\.companyId\],\s*name: 'customer_receipts_customer_id_company_fk',\s*\}\)/.test(accounting));
ok('accounts_payable.supplier_id: FK compuesta -> suppliers (accounts_payable_supplier_id_company_fk)', /supplierCompanyFk: foreignKey\(\{\s*columns: \[table\.supplierId, table\.companyId\],\s*foreignColumns: \[suppliers\.id, suppliers\.companyId\],\s*name: 'accounts_payable_supplier_id_company_fk',\s*\}\)/.test(accounting));
ok('accounts_payable.purchase_order_id: FK compuesta -> purchase_orders (accounts_payable_purchase_order_id_company_fk)', /purchaseOrderCompanyFk: foreignKey\(\{\s*columns: \[table\.purchaseOrderId, table\.companyId\],\s*foreignColumns: \[purchaseOrders\.id, purchaseOrders\.companyId\],\s*name: 'accounts_payable_purchase_order_id_company_fk',\s*\}\)/.test(accounting));
ok('supplier_payments.supplier_id: FK compuesta -> suppliers (supplier_payments_supplier_id_company_fk)', /supplierCompanyFk: foreignKey\(\{\s*columns: \[table\.supplierId, table\.companyId\],\s*foreignColumns: \[suppliers\.id, suppliers\.companyId\],\s*name: 'supplier_payments_supplier_id_company_fk',\s*\}\)/.test(accounting));
ok('checks.bank_account_id: FK compuesta -> bank_accounts (checks_bank_account_id_company_fk)', /bankAccountCompanyFk: foreignKey\(\{\s*columns: \[table\.bankAccountId, table\.companyId\],\s*foreignColumns: \[bankAccounts\.id, bankAccounts\.companyId\],\s*name: 'checks_bank_account_id_company_fk',\s*\}\)/.test(accounting));
ok('checks.ap_id: FK compuesta -> accounts_payable (checks_ap_id_company_fk)', /apCompanyFk: foreignKey\(\{\s*columns: \[table\.apId, table\.companyId\],\s*foreignColumns: \[accountsPayable\.id, accountsPayable\.companyId\],\s*name: 'checks_ap_id_company_fk',\s*\}\)/.test(accounting));
ok('ap_payments.ap_id: FK compuesta -> accounts_payable (ap_payments_ap_id_company_fk)', /apCompanyFk: foreignKey\(\{\s*columns: \[table\.apId, table\.companyId\],\s*foreignColumns: \[accountsPayable\.id, accountsPayable\.companyId\],\s*name: 'ap_payments_ap_id_company_fk',\s*\}\)/.test(accounting));
ok('ap_payments.check_id: FK compuesta -> checks (ap_payments_check_id_company_fk)', /checkCompanyFk: foreignKey\(\{\s*columns: \[table\.checkId, table\.companyId\],\s*foreignColumns: \[checks\.id, checks\.companyId\],\s*name: 'ap_payments_check_id_company_fk',\s*\}\)/.test(accounting));
ok('ap_payments.debit_account_id: FK compuesta -> chart_of_accounts (ap_payments_debit_account_id_company_fk)', /debitAccountCompanyFk: foreignKey\(\{\s*columns: \[table\.debitAccountId, table\.companyId\],\s*foreignColumns: \[chartOfAccounts\.id, chartOfAccounts\.companyId\],\s*name: 'ap_payments_debit_account_id_company_fk',\s*\}\)/.test(accounting));
ok('ap_payments.credit_account_id: FK compuesta -> chart_of_accounts (ap_payments_credit_account_id_company_fk)', /creditAccountCompanyFk: foreignKey\(\{\s*columns: \[table\.creditAccountId, table\.companyId\],\s*foreignColumns: \[chartOfAccounts\.id, chartOfAccounts\.companyId\],\s*name: 'ap_payments_credit_account_id_company_fk',\s*\}\)/.test(accounting));
ok('expenses.warehouse_id: FK compuesta -> warehouses (expenses_warehouse_id_company_fk)', /warehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.warehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'expenses_warehouse_id_company_fk',\s*\}\)/.test(accounting));
ok('expenses.supplier_id: FK compuesta -> suppliers (expenses_supplier_id_company_fk)', /supplierCompanyFk: foreignKey\(\{\s*columns: \[table\.supplierId, table\.companyId\],\s*foreignColumns: \[suppliers\.id, suppliers\.companyId\],\s*name: 'expenses_supplier_id_company_fk',\s*\}\)/.test(accounting));
ok('financial_movements.customer_id: FK compuesta -> customers (financial_movements_customer_id_company_fk)', /customerCompanyFk: foreignKey\(\{\s*columns: \[table\.customerId, table\.companyId\],\s*foreignColumns: \[customers\.id, customers\.companyId\],\s*name: 'financial_movements_customer_id_company_fk',\s*\}\)/.test(accounting));
ok('financial_movements.supplier_id: FK compuesta -> suppliers (financial_movements_supplier_id_company_fk)', /supplierCompanyFk: foreignKey\(\{\s*columns: \[table\.supplierId, table\.companyId\],\s*foreignColumns: \[suppliers\.id, suppliers\.companyId\],\s*name: 'financial_movements_supplier_id_company_fk',\s*\}\)/.test(accounting));

// == src/db/schema/bank.ts ==
ok('src/db/schema/bank.ts: importa unique y foreignKey', bankCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('bank_accounts: unique(id, companyId) -> bank_accounts_id_company_uq', /idCompanyUq: unique\('bank_accounts_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(bank));
ok('bank_transactions.bank_account_id: FK compuesta -> bank_accounts (bank_transactions_bank_account_id_company_fk)', /bankAccountCompanyFk: foreignKey\(\{\s*columns: \[table\.bankAccountId, table\.companyId\],\s*foreignColumns: \[bankAccounts\.id, bankAccounts\.companyId\],\s*name: 'bank_transactions_bank_account_id_company_fk',\s*\}\)/.test(bank));
ok('bank_reconciliations.bank_account_id: FK compuesta -> bank_accounts (bank_reconciliations_bank_account_id_company_fk)', /bankAccountCompanyFk: foreignKey\(\{\s*columns: \[table\.bankAccountId, table\.companyId\],\s*foreignColumns: \[bankAccounts\.id, bankAccounts\.companyId\],\s*name: 'bank_reconciliations_bank_account_id_company_fk',\s*\}\)/.test(bank));
ok('bank_accounts.chart_account_id: FK compuesta -> chart_of_accounts (bank_accounts_chart_account_company_fk)', /chartAccountCompanyFk: foreignKey\(\{\s*columns: \[table\.chartAccountId, table\.companyId\],\s*foreignColumns: \[chartOfAccounts\.id, chartOfAccounts\.companyId\],\s*name: 'bank_accounts_chart_account_company_fk',\s*\}\)/.test(bank));

// == src/db/schema/cash.ts ==
ok('src/db/schema/cash.ts: importa unique y foreignKey', cashCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('cash_registers: unique(id, companyId) -> cash_registers_id_company_uq', /idCompanyUq: unique\('cash_registers_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(cash));
ok('cash_sessions: unique(id, companyId) -> cash_sessions_id_company_uq', /idCompanyUq: unique\('cash_sessions_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(cash));
ok('cash_sessions.cash_register_id: FK compuesta -> cash_registers (cash_sessions_cash_register_id_company_fk)', /cashRegisterCompanyFk: foreignKey\(\{\s*columns: \[table\.cashRegisterId, table\.companyId\],\s*foreignColumns: \[cashRegisters\.id, cashRegisters\.companyId\],\s*name: 'cash_sessions_cash_register_id_company_fk',\s*\}\)/.test(cash));
ok('cash_movements.cash_session_id: FK compuesta -> cash_sessions (cash_movements_cash_session_id_company_fk)', /cashSessionCompanyFk: foreignKey\(\{\s*columns: \[table\.cashSessionId, table\.companyId\],\s*foreignColumns: \[cashSessions\.id, cashSessions\.companyId\],\s*name: 'cash_movements_cash_session_id_company_fk',\s*\}\)/.test(cash));
ok('cash_movements.invoice_id: FK compuesta -> invoices (cash_movements_invoice_id_company_fk)', /invoiceCompanyFk: foreignKey\(\{\s*columns: \[table\.invoiceId, table\.companyId\],\s*foreignColumns: \[invoices\.id, invoices\.companyId\],\s*name: 'cash_movements_invoice_id_company_fk',\s*\}\)/.test(cash));
ok('cash_session_summary.cash_session_id: FK compuesta -> cash_sessions (cash_session_summary_cash_session_id_company_fk)', /cashSessionCompanyFk: foreignKey\(\{\s*columns: \[table\.cashSessionId, table\.companyId\],\s*foreignColumns: \[cashSessions\.id, cashSessions\.companyId\],\s*name: 'cash_session_summary_cash_session_id_company_fk',\s*\}\)/.test(cash));

// == src/db/schema/contacts.ts ==
ok('src/db/schema/contacts.ts: importa unique (no foreignKey -- no tiene FKs compuestas)', contactsCrudo.includes(", unique } from 'drizzle-orm/pg-core';") && !contactsCrudo.includes('foreignKey'));
ok('customers: unique(id, companyId) -> customers_id_company_uq', /idCompanyUq: unique\('customers_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(contacts));
ok('suppliers: unique(id, companyId) -> suppliers_id_company_uq', /idCompanyUq: unique\('suppliers_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(contacts));

// == src/db/schema/hr.ts ==
ok('src/db/schema/hr.ts: importa unique y foreignKey', hrCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('departments: unique(id, companyId) -> departments_id_company_uq', /idCompanyUq: unique\('departments_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(hr));
ok('employees: unique(id, companyId) -> employees_id_company_uq', /idCompanyUq: unique\('employees_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(hr));
ok('payrolls: unique(id, companyId) -> payrolls_id_company_uq', /idCompanyUq: unique\('payrolls_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(hr));
ok('positions: unique(id, companyId) -> positions_id_company_uq', /idCompanyUq: unique\('positions_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(hr));
ok('employees.department_id: FK compuesta -> departments (employees_department_id_company_fk)', /departmentCompanyFk: foreignKey\(\{\s*columns: \[table\.departmentId, table\.companyId\],\s*foreignColumns: \[departments\.id, departments\.companyId\],\s*name: 'employees_department_id_company_fk',\s*\}\)/.test(hr));
ok('employees.position_id: FK compuesta -> positions (employees_position_id_company_fk)', /positionCompanyFk: foreignKey\(\{\s*columns: \[table\.positionId, table\.companyId\],\s*foreignColumns: \[positions\.id, positions\.companyId\],\s*name: 'employees_position_id_company_fk',\s*\}\)/.test(hr));
ok('payroll_details.payroll_id: FK compuesta -> payrolls (payroll_details_payroll_id_company_fk)', /payrollCompanyFk: foreignKey\(\{\s*columns: \[table\.payrollId, table\.companyId\],\s*foreignColumns: \[payrolls\.id, payrolls\.companyId\],\s*name: 'payroll_details_payroll_id_company_fk',\s*\}\)/.test(hr));
ok('payroll_details.employee_id: FK compuesta -> employees (payroll_details_employee_id_company_fk)', /employeeCompanyFk: foreignKey\(\{\s*columns: \[table\.employeeId, table\.companyId\],\s*foreignColumns: \[employees\.id, employees\.companyId\],\s*name: 'payroll_details_employee_id_company_fk',\s*\}\)/.test(hr));
ok('overtime_records.employee_id: FK compuesta -> employees (overtime_records_employee_id_company_fk)', /employeeCompanyFk: foreignKey\(\{\s*columns: \[table\.employeeId, table\.companyId\],\s*foreignColumns: \[employees\.id, employees\.companyId\],\s*name: 'overtime_records_employee_id_company_fk',\s*\}\)/.test(hr));
ok('employee_income.employee_id: FK compuesta -> employees (employee_income_employee_id_company_fk)', /employeeCompanyFk: foreignKey\(\{\s*columns: \[table\.employeeId, table\.companyId\],\s*foreignColumns: \[employees\.id, employees\.companyId\],\s*name: 'employee_income_employee_id_company_fk',\s*\}\)/.test(hr));
ok('employee_deductions.employee_id: FK compuesta -> employees (employee_deductions_employee_id_company_fk)', /employeeCompanyFk: foreignKey\(\{\s*columns: \[table\.employeeId, table\.companyId\],\s*foreignColumns: \[employees\.id, employees\.companyId\],\s*name: 'employee_deductions_employee_id_company_fk',\s*\}\)/.test(hr));
ok('employee_vacations.employee_id: FK compuesta -> employees (employee_vacations_employee_id_company_fk)', /employeeCompanyFk: foreignKey\(\{\s*columns: \[table\.employeeId, table\.companyId\],\s*foreignColumns: \[employees\.id, employees\.companyId\],\s*name: 'employee_vacations_employee_id_company_fk',\s*\}\)/.test(hr));
ok('employee_leaves.employee_id: FK compuesta -> employees (employee_leaves_employee_id_company_fk)', /employeeCompanyFk: foreignKey\(\{\s*columns: \[table\.employeeId, table\.companyId\],\s*foreignColumns: \[employees\.id, employees\.companyId\],\s*name: 'employee_leaves_employee_id_company_fk',\s*\}\)/.test(hr));
ok('employee_settlements.employee_id: FK compuesta -> employees (employee_settlements_employee_id_company_fk)', /employeeCompanyFk: foreignKey\(\{\s*columns: \[table\.employeeId, table\.companyId\],\s*foreignColumns: \[employees\.id, employees\.companyId\],\s*name: 'employee_settlements_employee_id_company_fk',\s*\}\)/.test(hr));

// == src/db/schema/inventory.ts ==
ok('src/db/schema/inventory.ts: importa unique y foreignKey', inventoryCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('warehouses: unique(id, companyId) -> warehouses_id_company_uq', /idCompanyUq: unique\('warehouses_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(inventory));
ok('user_warehouses.warehouse_id: FK compuesta -> warehouses (user_warehouses_warehouse_id_company_fk)', /warehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.warehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'user_warehouses_warehouse_id_company_fk',\s*\}\)/.test(inventory));
ok('inventory_levels.product_id: FK compuesta -> products (inventory_levels_product_id_company_fk)', /productCompanyFk: foreignKey\(\{\s*columns: \[table\.productId, table\.companyId\],\s*foreignColumns: \[products\.id, products\.companyId\],\s*name: 'inventory_levels_product_id_company_fk',\s*\}\)/.test(inventory));
ok('inventory_levels.warehouse_id: FK compuesta -> warehouses (inventory_levels_warehouse_id_company_fk)', /warehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.warehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'inventory_levels_warehouse_id_company_fk',\s*\}\)/.test(inventory));
ok('inventory_movements.product_id: FK compuesta -> products (inventory_movements_product_id_company_fk)', /productCompanyFk: foreignKey\(\{\s*columns: \[table\.productId, table\.companyId\],\s*foreignColumns: \[products\.id, products\.companyId\],\s*name: 'inventory_movements_product_id_company_fk',\s*\}\)/.test(inventory));
ok('inventory_movements.warehouse_id: FK compuesta -> warehouses (inventory_movements_warehouse_id_company_fk)', /warehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.warehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'inventory_movements_warehouse_id_company_fk',\s*\}\)/.test(inventory));
ok('inventory_transfers.source_warehouse_id: FK compuesta -> warehouses (inventory_transfers_source_warehouse_id_company_fk)', /sourceWarehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.sourceWarehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'inventory_transfers_source_warehouse_id_company_fk',\s*\}\)/.test(inventory));
ok('inventory_transfers.destination_warehouse_id: FK compuesta -> warehouses (inventory_transfers_destination_warehouse_id_company_fk)', /destinationWarehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.destinationWarehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'inventory_transfers_destination_warehouse_id_company_fk',\s*\}\)/.test(inventory));

// == src/db/schema/invoices.ts ==
ok('src/db/schema/invoices.ts: importa unique y foreignKey', invoicesCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('invoices: unique(id, companyId) -> invoices_id_company_uq', /idCompanyUq: unique\('invoices_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(invoices));
ok('quotes: unique(id, companyId) -> quotes_id_company_uq', /idCompanyUq: unique\('quotes_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(invoices));
ok('quotes.warehouse_id: FK compuesta -> warehouses (quotes_warehouse_id_company_fk)', /warehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.warehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'quotes_warehouse_id_company_fk',\s*\}\)/.test(invoices));
ok('quotes.customer_id: FK compuesta -> customers (quotes_customer_id_company_fk)', /customerCompanyFk: foreignKey\(\{\s*columns: \[table\.customerId, table\.companyId\],\s*foreignColumns: \[customers\.id, customers\.companyId\],\s*name: 'quotes_customer_id_company_fk',\s*\}\)/.test(invoices));
ok('invoices.warehouse_id: FK compuesta -> warehouses (invoices_warehouse_id_company_fk)', /warehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.warehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'invoices_warehouse_id_company_fk',\s*\}\)/.test(invoices));
ok('invoices.customer_id: FK compuesta -> customers (invoices_customer_id_company_fk)', /customerCompanyFk: foreignKey\(\{\s*columns: \[table\.customerId, table\.companyId\],\s*foreignColumns: \[customers\.id, customers\.companyId\],\s*name: 'invoices_customer_id_company_fk',\s*\}\)/.test(invoices));
ok('invoices.cash_session_id: FK compuesta -> cash_sessions (invoices_cash_session_id_company_fk)', /cashSessionCompanyFk: foreignKey\(\{\s*columns: \[table\.cashSessionId, table\.companyId\],\s*foreignColumns: \[cashSessions\.id, cashSessions\.companyId\],\s*name: 'invoices_cash_session_id_company_fk',\s*\}\)/.test(invoices));
ok('invoices.quote_id: FK compuesta -> quotes (invoices_quote_id_company_fk)', /quoteCompanyFk: foreignKey\(\{\s*columns: \[table\.quoteId, table\.companyId\],\s*foreignColumns: \[quotes\.id, quotes\.companyId\],\s*name: 'invoices_quote_id_company_fk',\s*\}\)/.test(invoices));
ok('credit_debit_notes.invoice_id: FK compuesta -> invoices (credit_debit_notes_invoice_id_company_fk)', /invoiceCompanyFk: foreignKey\(\{\s*columns: \[table\.invoiceId, table\.companyId\],\s*foreignColumns: \[invoices\.id, invoices\.companyId\],\s*name: 'credit_debit_notes_invoice_id_company_fk',\s*\}\)/.test(invoices));
ok('delivery_notes.invoice_id: FK compuesta -> invoices (delivery_notes_invoice_id_company_fk)', /invoiceCompanyFk: foreignKey\(\{\s*columns: \[table\.invoiceId, table\.companyId\],\s*foreignColumns: \[invoices\.id, invoices\.companyId\],\s*name: 'delivery_notes_invoice_id_company_fk',\s*\}\)/.test(invoices));
ok('dgii_submissions.invoice_id: FK compuesta -> invoices (dgii_submissions_invoice_id_company_fk)', /invoiceCompanyFk: foreignKey\(\{\s*columns: \[table\.invoiceId, table\.companyId\],\s*foreignColumns: \[invoices\.id, invoices\.companyId\],\s*name: 'dgii_submissions_invoice_id_company_fk',\s*\}\)/.test(invoices));

// == src/db/schema/products.ts ==
ok('src/db/schema/products.ts: importa unique y foreignKey', productsCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('price_lists: unique(id, companyId) -> price_lists_id_company_uq', /idCompanyUq: unique\('price_lists_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(products));
ok('product_categories: unique(id, companyId) -> product_categories_id_company_uq', /idCompanyUq: unique\('product_categories_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(products));
ok('products: unique(id, companyId) -> products_id_company_uq', /idCompanyUq: unique\('products_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(products));
ok('products.category_id: FK compuesta -> product_categories (products_category_id_company_fk)', /categoryCompanyFk: foreignKey\(\{\s*columns: \[table\.categoryId, table\.companyId\],\s*foreignColumns: \[productCategories\.id, productCategories\.companyId\],\s*name: 'products_category_id_company_fk',\s*\}\)/.test(products));
ok('price_list_items.price_list_id: FK compuesta -> price_lists (price_list_items_price_list_id_company_fk)', /priceListCompanyFk: foreignKey\(\{\s*columns: \[table\.priceListId, table\.companyId\],\s*foreignColumns: \[priceLists\.id, priceLists\.companyId\],\s*name: 'price_list_items_price_list_id_company_fk',\s*\}\)/.test(products));
ok('price_list_items.product_id: FK compuesta -> products (price_list_items_product_id_company_fk)', /productCompanyFk: foreignKey\(\{\s*columns: \[table\.productId, table\.companyId\],\s*foreignColumns: \[products\.id, products\.companyId\],\s*name: 'price_list_items_product_id_company_fk',\s*\}\)/.test(products));
ok('product_barcodes.product_id: FK compuesta -> products (product_barcodes_product_id_company_fk)', /productCompanyFk: foreignKey\(\{\s*columns: \[table\.productId, table\.companyId\],\s*foreignColumns: \[products\.id, products\.companyId\],\s*name: 'product_barcodes_product_id_company_fk',\s*\}\)/.test(products));
ok('barcode_print_logs.product_id: FK compuesta -> products (barcode_print_logs_product_id_company_fk)', /productCompanyFk: foreignKey\(\{\s*columns: \[table\.productId, table\.companyId\],\s*foreignColumns: \[products\.id, products\.companyId\],\s*name: 'barcode_print_logs_product_id_company_fk',\s*\}\)/.test(products));

// == src/db/schema/supplier_orders.ts ==
ok('src/db/schema/supplier_orders.ts: importa unique y foreignKey', supplierOrdersCrudo.includes(", unique, foreignKey } from 'drizzle-orm/pg-core';"));
ok('purchase_orders: unique(id, companyId) -> purchase_orders_id_company_uq', /idCompanyUq: unique\('purchase_orders_id_company_uq'\)\.on\(table\.id, table\.companyId\),/.test(supplierOrders));
ok('purchase_orders.supplier_id: FK compuesta -> suppliers (purchase_orders_supplier_id_company_fk)', /supplierCompanyFk: foreignKey\(\{\s*columns: \[table\.supplierId, table\.companyId\],\s*foreignColumns: \[suppliers\.id, suppliers\.companyId\],\s*name: 'purchase_orders_supplier_id_company_fk',\s*\}\)/.test(supplierOrders));
ok('purchase_orders.warehouse_id: FK compuesta -> warehouses (purchase_orders_warehouse_id_company_fk)', /warehouseCompanyFk: foreignKey\(\{\s*columns: \[table\.warehouseId, table\.companyId\],\s*foreignColumns: \[warehouses\.id, warehouses\.companyId\],\s*name: 'purchase_orders_warehouse_id_company_fk',\s*\}\)/.test(supplierOrders));

// ═══════════════════ Checks manuales adicionales ═══════════════════
console.log('\n=== Correccion del comentario/FK erroneo en bank.ts (chartAccountId) ===\n');

ok('bank.ts: chartAccountId ya NO tiene la FK simple inline (.references(...))',
  !bankCrudo.includes("chartAccountId: uuid('chart_account_id').references(() => chartOfAccounts.id"));
ok('bank.ts: chartAccountId es ahora una columna plana (la FK compuesta va en el extraConfig)',
  /chartAccountId: uuid\('chart_account_id'\),/.test(bank));
ok('bank.ts: chartAccountCompanyFk lleva .onDelete(\'restrict\') (igual que la FK simple que reemplaza)',
  /chartAccountCompanyFk: foreignKey\(\{[\s\S]*?name: 'bank_accounts_chart_account_company_fk',\s*\}\)\.onDelete\('restrict'\),/.test(bank));
ok('bank.ts: el comentario ya no atribuye la FK a la migracion 0052',
  !bankCrudo.includes('Auditoria P1-20 (2026-09-03), migracion 0052. Antes no tenia FK'));
ok('bank.ts: el comentario explica que 0039 (2026-09-01) es la fuente real, y que 0052 nunca se aplico',
  bankCrudo.includes('la migracion 0039 la declaro asi desde el') &&
  bankCrudo.includes('0052 nunca se aplico contra la base real'));

console.log('\n=== Nota historica en drizzle/0052 (superada por 0039, no aplicada) ===\n');

const nota0052 = crudo('drizzle/0052_fk_bank_accounts_chart_account.sql');
ok('0052: lleva la nota (P1-19) al inicio explicando que quedo superada por 0039',
  nota0052.startsWith('-- ====') && nota0052.includes('NOTA (P1-19, 2026-09-04)') &&
  nota0052.includes('es REDUNDANTE'));
ok('0052: el contenido original de la migracion sigue intacto debajo de la nota (no se borro nada)',
  nota0052.includes('-- 0052 — FK ausente en bank_accounts.chart_account_id (P1-20).') &&
  nota0052.includes('ADD CONSTRAINT bank_accounts_chart_account_id_chart_of_accounts_id_fk'));

console.log('\n=== Conteo global: exactamente 20 unique( y 58 foreignKey({ en los 9 archivos ===\n');

const todosCrudo = [accountingCrudo, bankCrudo, cashCrudo, contactsCrudo, hrCrudo, inventoryCrudo, invoicesCrudo, productsCrudo, supplierOrdersCrudo].join('\n');
const totalUnique = (todosCrudo.match(/unique\(/g) || []).length;
const totalFk = (todosCrudo.match(/foreignKey\(\{/g) || []).length;
ok(`exactamente 20 "unique(" en total (hallados ${totalUnique})`, totalUnique === 20);
ok(`exactamente 58 "foreignKey({" en total (hallados ${totalFk})`, totalFk === 58);

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
