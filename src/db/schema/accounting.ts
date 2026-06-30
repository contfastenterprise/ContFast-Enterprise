import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, date, index, uniqueIndex, integer } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers, suppliers } from './contacts';
import { invoices } from './invoices';
import { bankAccounts } from './bank';
import { warehouses } from './inventory';
import { products } from './products';
import { users } from './auth';

export const chartOfAccounts = pgTable('chart_of_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  code: varchar('code', { length: 100 }).notNull(), // 1, 1.1, 1.1.01, etc.
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // asset | liability | equity | revenue | expense
  nature: varchar('nature', { length: 20 }).default('debit').notNull(), // debit | credit
  level: integer('level').default(1).notNull(),
  isTransactional: boolean('is_transactional').default(true).notNull(),
  parentId: uuid('parent_id').references((): any => chartOfAccounts.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyCodeIdx: uniqueIndex('chart_accounts_company_code_idx').on(table.companyId, table.code),
  statusIdx: index('chart_accounts_status_idx').on(table.status),
}));

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  reference: varchar('reference', { length: 255 }), // Invoice ID, check ID, etc.
  date: date('date').notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('posted').notNull(), // draft | posted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('journal_entries_company_idx').on(table.companyId),
  dateIdx: index('journal_entries_date_idx').on(table.date),
  companyStatusDateIdx: index('journal_entries_comp_status_date_idx').on(table.companyId, table.status, table.date),
}));

export const journalEntryLines = pgTable('journal_entry_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id),
  accountId: uuid('account_id').notNull().references(() => chartOfAccounts.id),
  debit: decimal('debit', { precision: 15, scale: 2 }).default('0.00').notNull(),
  credit: decimal('credit', { precision: 15, scale: 2 }).default('0.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  entryIdx: index('journal_lines_entry_idx').on(table.journalEntryId),
  accountIdx: index('journal_lines_account_idx').on(table.accountId),
  companyIdx: index('journal_entry_lines_company_idx').on(table.companyId),
  companyAccountIdx: index('journal_entry_lines_comp_acc_idx').on(table.companyId, table.accountId),
  accCreatedIdx: index('journal_entry_lines_acc_created_idx').on(table.accountId, table.createdAt),
}));

export const accountsReceivable = pgTable('accounts_receivable', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull(),
  dueDate: date('due_date').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | paid | overdue
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('ar_company_idx').on(table.companyId),
  customerIdx: index('ar_customer_idx').on(table.customerId),
  invoiceIdx: index('ar_invoice_idx').on(table.invoiceId),
}));

export const customerReceipts = pgTable('customer_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  date: date('date').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // cash | bank | check
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 255 }), // transfer number, check number, etc.
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('cust_receipts_company_idx').on(table.companyId),
  customerIdx: index('cust_receipts_customer_idx').on(table.customerId),
  dateIdx: index('cust_receipts_date_idx').on(table.date),
}));

export const customerReceiptApplied = pgTable('customer_receipt_applied', {
  id: uuid('id').defaultRandom().primaryKey(),
  receiptId: uuid('receipt_id').notNull().references(() => customerReceipts.id),
  arId: uuid('ar_id').notNull().references(() => accountsReceivable.id),
  amountApplied: decimal('amount_applied', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  receiptIdx: index('cra_receipt_idx').on(table.receiptId),
  arIdx: index('cra_ar_idx').on(table.arId),
}));

export const accountsPayable = pgTable('accounts_payable', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull(),
  dueDate: date('due_date').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | paid | overdue
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('ap_company_idx').on(table.companyId),
  supplierIdx: index('ap_supplier_idx').on(table.supplierId),
}));

export const supplierPayments = pgTable('supplier_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  date: date('date').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // cash | bank | check
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 255 }), // transfer number, check number, etc.
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('supp_pay_company_idx').on(table.companyId),
  supplierIdx: index('supp_pay_supplier_idx').on(table.supplierId),
  dateIdx: index('supp_pay_date_idx').on(table.date),
}));

export const supplierPaymentApplied = pgTable('supplier_payment_applied', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id').notNull().references(() => supplierPayments.id),
  apId: uuid('ap_id').notNull().references(() => accountsPayable.id),
  amountApplied: decimal('amount_applied', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  paymentIdx: index('spa_payment_idx').on(table.paymentId),
  apIdx: index('spa_ap_idx').on(table.apId),
}));

export const checks = pgTable('checks', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  checkNumber: varchar('check_number', { length: 100 }).notNull(),
  payee: varchar('payee', { length: 255 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  issueDate: date('issue_date').notNull(),
  dueDate: date('due_date'),
  isGuarantee: boolean('is_guarantee').default(false).notNull(),
  apId: uuid('ap_id').references(() => accountsPayable.id),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | cleared | voided
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyCheckIdx: uniqueIndex('checks_company_num_idx').on(table.companyId, table.checkNumber),
  statusIdx: index('checks_status_idx').on(table.status),
  apIdx: index('checks_ap_idx').on(table.apId),
}));

export const apPayments = pgTable('ap_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  apId: uuid('ap_id').notNull().references(() => accountsPayable.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // cash | transfer | check
  checkId: uuid('check_id').references(() => checks.id),
  debitAccountId: uuid('debit_account_id').notNull().references(() => chartOfAccounts.id),
  creditAccountId: uuid('credit_account_id').notNull().references(() => chartOfAccounts.id),
  paymentDate: date('payment_date').notNull(),
  status: varchar('status', { length: 50 }).default('applied').notNull(), // pending_guarantee | applied | voided
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('ap_payments_company_idx').on(table.companyId),
  apIdx: index('ap_payments_ap_idx').on(table.apId),
  statusIdx: index('ap_payments_status_idx').on(table.status),
}));

export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  supplierId: uuid('supplier_id').references(() => suppliers.id), // Made nullable for minor expenses without supplier
  expenseType: varchar('expense_type', { length: 2 }).notNull(), // '01' to '11'
  isMinorExpense: boolean('is_minor_expense').default(false).notNull(), // TRUE if it's a petty cash / minor expense
  ncf: varchar('ncf', { length: 19 }), // Nullable for informal minor expenses
  ncfModified: varchar('ncf_modified', { length: 19 }),
  issueDate: date('issue_date').notNull(),
  paymentDate: date('payment_date'),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  itbis: decimal('itbis', { precision: 15, scale: 2 }).default('0.00').notNull(),
  itbisRetained: decimal('itbis_retained', { precision: 15, scale: 2 }).default('0.00').notNull(),
  itbisProportionality: decimal('itbis_proportionality', { precision: 15, scale: 2 }).default('0.00').notNull(),
  isrRetained: decimal('isr_retained', { precision: 15, scale: 2 }).default('0.00').notNull(),
  isc: decimal('isc', { precision: 15, scale: 2 }).default('0.00').notNull(),
  otherTaxes: decimal('other_taxes', { precision: 15, scale: 2 }).default('0.00').notNull(),
  tip: decimal('tip', { precision: 15, scale: 2 }).default('0.00').notNull(),
  paymentMethod: varchar('payment_method', { length: 2 }).notNull(), // '01' to '07'
  description: text('description'), // Optional general description
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('expense_company_idx').on(table.companyId),
  supplierIdx: index('expense_supplier_idx').on(table.supplierId),
  issueDateIdx: index('expense_issue_date_idx').on(table.issueDate),
  companyIssueDateIdx: index('expense_comp_issue_date_idx').on(table.companyId, table.issueDate),
}));

export const expenseLines = pgTable('expense_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id), // Nullable for ad-hoc service lines
  description: text('description').notNull(), // Either product name or manual description
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal('unit_cost', { precision: 15, scale: 2 }).notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
  itbis: decimal('itbis', { precision: 15, scale: 2 }).default('0.00').notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  expenseIdx: index('expense_line_exp_idx').on(table.expenseId),
  productIdx: index('expense_line_prod_idx').on(table.productId),
}));

export const accountingPeriods = pgTable('accounting_periods', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('name', { length: 100 }).notNull(), // e.g. "Junio 2026"
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: varchar('status', { length: 50 }).default('open').notNull(), // open | closed
  closedAt: timestamp('closed_at'),
  closedBy: uuid('closed_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('accounting_periods_company_idx').on(table.companyId),
  statusIdx: index('accounting_periods_status_idx').on(table.status),
}));

export const accountingMappings = pgTable('accounting_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  mappingKey: varchar('mapping_key', { length: 100 }).notNull(), // e.g. "sales_revenue", "accounts_receivable"
  accountId: uuid('account_id').notNull().references(() => chartOfAccounts.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyKeyIdx: uniqueIndex('accounting_mappings_company_key_idx').on(table.companyId, table.mappingKey),
}));

export const financialMovements = pgTable('financial_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // 'customer' | 'supplier'
  customerId: uuid('customer_id').references(() => customers.id),
  supplierId: uuid('supplier_id').references(() => suppliers.id),
  date: date('date').notNull(),
  time: varchar('time', { length: 8 }).notNull(), // HH:MM:SS
  movementType: varchar('movement_type', { length: 50 }).notNull(), // 'invoice' | 'receipt' | 'payment' | 'credit_note' | 'debit_note' | 'retention' | 'advance' | 'void'
  documentId: uuid('document_id').notNull(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  originModule: varchar('origin_module', { length: 50 }).notNull(), // 'invoicing' | 'purchases' | 'cash' | 'bank' | 'accounting'
  debit: decimal('debit', { precision: 15, scale: 2 }).default('0.00').notNull(),
  credit: decimal('credit', { precision: 15, scale: 2 }).default('0.00').notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).default('0.00').notNull(),
  currency: varchar('currency', { length: 10 }).default('DOP').notNull(),
  userId: uuid('user_id').references(() => users.id),
  notes: text('notes'),
  status: varchar('status', { length: 50 }).default('active').notNull(), // active | voided
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('fin_mov_company_idx').on(table.companyId),
  customerIdx: index('fin_mov_customer_idx').on(table.companyId, table.customerId),
  supplierIdx: index('fin_mov_supplier_idx').on(table.companyId, table.supplierId),
  dateIdx: index('fin_mov_date_idx').on(table.date),
  createdAtIdx: index('fin_mov_created_at_idx').on(table.createdAt),
}));

