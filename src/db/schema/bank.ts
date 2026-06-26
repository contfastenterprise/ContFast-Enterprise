import { pgTable, uuid, varchar, text, timestamp, decimal, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  bankName: varchar('bank_name', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 100 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('DOP').notNull(), // DOP | USD | EUR
  type: varchar('type', { length: 50 }).default('corriente').notNull(), // corriente | ahorros
  color: varchar('color', { length: 50 }).default('#003366').notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).default('0.00').notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyAccIdx: uniqueIndex('bank_accounts_company_acc_idx').on(table.companyId, table.accountNumber),
  statusIdx: index('bank_accounts_status_idx').on(table.status),
}));

export const bankTransactions = pgTable('bank_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  date: date('date').notNull(),
  type: varchar('type', { length: 50 }).notNull(), // deposit | withdrawal | transfer_in | transfer_out | fee
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 100 }),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | reconciled
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('bank_txs_company_idx').on(table.companyId),
  accountIdx: index('bank_txs_account_idx').on(table.bankAccountId),
}));

export const bankReconciliations = pgTable('bank_reconciliations', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  openingBalance: decimal('opening_balance', { precision: 15, scale: 2 }).notNull(),
  closingBalance: decimal('closing_balance', { precision: 15, scale: 2 }).notNull(),
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft | posted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('bank_recon_company_idx').on(table.companyId),
  accountIdx: index('bank_recon_account_idx').on(table.bankAccountId),
}));
