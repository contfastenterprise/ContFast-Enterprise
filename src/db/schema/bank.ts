import { pgTable, uuid, varchar, text, timestamp, decimal, date, index, uniqueIndex, unique, foreignKey } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { chartOfAccounts } from './accounting';
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
  // cuenta bancaria (migracion 0039, 2026-09-01).
  //
  // Antes no existia y el codigo la adivinaba buscando la subcadena "banco" en
  // los nombres del catalogo, sin ORDER BY. "Efectivo en Caja y Bancos" -- una
  // cuenta de AGRUPACION -- tambien contiene "banco", asi que entraba en el
  // sorteo, y con varias cuentas bancarias todas acababan contra la misma.
  // Verificado en produccion el 29/08/2026, empresa 38a1a51e: dos ajustes del
  // mismo dia, de 352.460,96 y 1.015.727,93, fueron los dos a la agrupacion
  // 1.1.01.
  //
  // Es nullable porque las cuentas existentes no lo tienen y no se puede
  // deducir. Sin ella el movimiento NO se contabiliza: se rechaza con error.
  //
  // La FK es COMPUESTA (chart_account_id, company_id) -> chart_of_accounts(id,
  // company_id), no una FK simple: la migracion 0039 la declaro asi desde el
  // primer dia, dos dias antes de la auditoria del 2026-09-03, para que una
  // cuenta bancaria no pueda enlazar con la cuenta contable de OTRA empresa.
  // Ver `chartAccountCompanyFk` mas abajo. `restrict`: no se puede borrar una
  // cuenta del catalogo mientras una cuenta bancaria la siga usando.
  //
  // (La migracion 0052, del hallazgo P1-20, penso que esta FK faltaba y
  // anadio una version simple de una sola columna -- pero 0039 ya la tenia,
  // compuesta y mejor, desde antes. 0052 nunca se aplico contra la base real;
  // se dejo en drizzle/ solo como nota historica.)
  chartAccountId: uuid('chart_account_id'),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyAccIdx: uniqueIndex('bank_accounts_company_acc_idx').on(table.companyId, table.accountNumber),
  statusIdx: index('bank_accounts_status_idx').on(table.status),
  chartAccountIdx: index('bank_accounts_chart_account_idx').on(table.chartAccountId),
  // P1-19 / migracion 0032: aislamiento estructural.
  idCompanyUq: unique('bank_accounts_id_company_uq').on(table.id, table.companyId),
  // Migracion 0039 -- ver el comentario de chartAccountId mas arriba.
  chartAccountCompanyFk: foreignKey({
    columns: [table.chartAccountId, table.companyId],
    foreignColumns: [chartOfAccounts.id, chartOfAccounts.companyId],
    name: 'bank_accounts_chart_account_company_fk',
  }).onDelete('restrict'),
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
  // P1-19 / migracion 0032: aislamiento estructural.
  bankAccountCompanyFk: foreignKey({
    columns: [table.bankAccountId, table.companyId],
    foreignColumns: [bankAccounts.id, bankAccounts.companyId],
    name: 'bank_transactions_bank_account_id_company_fk',
  }),
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
  // P1-19 / migracion 0032: aislamiento estructural.
  bankAccountCompanyFk: foreignKey({
    columns: [table.bankAccountId, table.companyId],
    foreignColumns: [bankAccounts.id, bankAccounts.companyId],
    name: 'bank_reconciliations_bank_account_id_company_fk',
  }),
}));
