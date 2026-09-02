import { pgTable, uuid, varchar, text, timestamp, decimal, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { environmentMode } from './system';

export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  bankName: varchar('bank_name', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 100 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('DOP').notNull(), // DOP | USD | EUR
  type: varchar('type', { length: 50 }).default('corriente').notNull(), // corriente | ahorros
  color: varchar('color', { length: 50 }).default('#003366').notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).default('0.00').notNull(),
  // Cuenta del plan contable contra la que se asientan los movimientos de esta
  // cuenta bancaria (migracion 0039).
  //
  // Antes no existia y el codigo la adivinaba buscando la subcadena "banco" en
  // los nombres del catalogo, sin ORDER BY. "Efectivo en Caja y Bancos" -- una
  // cuenta de AGRUPACION -- tambien contiene "banco", asi que entraba en el
  // sorteo, y con varias cuentas bancarias todas acababan contra la misma.
  // Verificado en produccion: dos ajustes del mismo dia, de 352.460,96 y
  // 1.015.727,93, fueron los dos a la agrupacion 1.1.01.
  //
  // Es nullable porque las cuentas existentes no lo tienen y no se puede
  // deducir. Sin ella el movimiento NO se contabiliza: se rechaza con error.
  chartAccountId: uuid('chart_account_id'),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyAccIdx: uniqueIndex('bank_accounts_company_acc_idx').on(table.companyId, table.accountNumber),
  statusIdx: index('bank_accounts_status_idx').on(table.status),
  chartAccountIdx: index('bank_accounts_chart_account_idx').on(table.chartAccountId),
}));

/**
 * El saldo de una cuenta bancaria, POR ENTORNO.
 *
 * `bank_accounts` es catalogo -- la cuenta del banco es la misma para todos --
 * pero su `balance` no lo es: se mueve. Teniendolo dentro del catalogo, una
 * transaccion de PRUEBA bajaba el saldo REAL. Se separa igual que ya estaba
 * separado el inventario: `products` es catalogo y `inventory_levels` lleva el
 * modo.
 *
 * Ver migracion 0036.
 */
export const bankAccountBalances = pgTable('bank_account_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).default('0.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  cuentaModoIdx: uniqueIndex('bank_account_balances_cuenta_modo_idx').on(table.bankAccountId, table.modo),
  companyModoIdx: index('bank_account_balances_company_modo_idx').on(table.companyId, table.modo),
}));

export const bankTransactions = pgTable('bank_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
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
  companyModoIdx: index('bank_txs_company_modo_idx').on(table.companyId, table.modo),
}));

export const bankReconciliations = pgTable('bank_reconciliations', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
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
  companyModoIdx: index('bank_recon_company_modo_idx').on(table.companyId, table.modo),
}));
