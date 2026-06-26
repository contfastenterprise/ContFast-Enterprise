import { pgTable, uuid, varchar, text, timestamp, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';
import { invoices } from './invoices';

export const cashRegisters = pgTable('cash_registers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyCodeIdx: uniqueIndex('cash_registers_company_code_idx').on(table.companyId, table.code),
  statusIdx: index('cash_registers_status_idx').on(table.status),
}));

export const cashSessions = pgTable('cash_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  cashRegisterId: uuid('cash_register_id').notNull().references(() => cashRegisters.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: varchar('status', { length: 50 }).default('open').notNull(), // open | closed
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
  initialBalance: decimal('initial_balance', { precision: 15, scale: 2 }).notNull(),
  expectedBalance: decimal('expected_balance', { precision: 15, scale: 2 }).default('0.00').notNull(),
  actualBalance: decimal('actual_balance', { precision: 15, scale: 2 }),
  difference: decimal('difference', { precision: 15, scale: 2 }),
  justification: text('justification'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('cash_sessions_company_idx').on(table.companyId),
  cashierActiveIdx: index('cash_sessions_cashier_active_idx').on(table.userId, table.status),
}));

export const cashMovements = pgTable('cash_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  cashSessionId: uuid('cash_session_id').notNull().references(() => cashSessions.id),
  invoiceId: uuid('invoice_id').references(() => invoices.id), // Nullable if manual input/output/conducto
  type: varchar('type', { length: 50 }).notNull(), // sale | refund | cash_in | cash_out
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  description: text('description'),
  reference: varchar('reference', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('cash_movements_company_idx').on(table.companyId),
  sessionIdx: index('cash_movements_session_idx').on(table.cashSessionId),
}));

export const cashSessionSummary = pgTable('cash_session_summary', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  cashSessionId: uuid('cash_session_id').notNull().references(() => cashSessions.id),
  initialBalance: decimal('initial_balance', { precision: 15, scale: 2 }).notNull(),
  totalCashIn: decimal('total_cash_in', { precision: 15, scale: 2 }).default('0.00').notNull(),
  totalCashOut: decimal('total_cash_out', { precision: 15, scale: 2 }).default('0.00').notNull(),
  expectedBalance: decimal('expected_balance', { precision: 15, scale: 2 }).notNull(),
  actualBalance: decimal('actual_balance', { precision: 15, scale: 2 }).notNull(),
  difference: decimal('difference', { precision: 15, scale: 2 }).notNull(),
  justification: text('justification'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('cash_session_summary_company_idx').on(table.companyId),
  sessionIdx: uniqueIndex('cash_session_summary_sess_idx').on(table.cashSessionId),
}));
