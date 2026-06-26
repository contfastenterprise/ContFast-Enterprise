import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, index, uniqueIndex, integer } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  rnc: varchar('rnc', { length: 11 }).notNull(), // RNC is 9 or 11 digits in DR
  businessActivity: varchar('business_activity', { length: 255 }),
  address: varchar('address', { length: 255 }),
  email: varchar('email', { length: 255 }),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  rncIdx: uniqueIndex('companies_rnc_idx').on(table.rnc),
  statusIdx: index('companies_status_idx').on(table.status),
}));

export const companySettings = pgTable('company_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  dgiiEnv: varchar('dgii_env', { length: 50 }).default('test').notNull(), // test | production
  certP12Encrypted: text('cert_p12_encrypted'), // Encrypted base64 of .p12 certificate
  certPasswordEncrypted: text('cert_password_encrypted'), // Encrypted certificate password
  logoUrl: text('logo_url'),
  msellerUrl: text('mseller_url').default('https://ecf.api.mseller.app/v1').notNull(),
  msellerApiKeyEncrypted: text('mseller_api_key_encrypted'),
  msellerEntorno: varchar('mseller_entorno', { length: 50 }).default('test').notNull(),
  msellerEmail: varchar('mseller_email', { length: 255 }),
  msellerPasswordEncrypted: text('mseller_password_encrypted'),
  printLayout: varchar('print_layout', { length: 50 }).default('carta').notNull(), // carta | 80mm | 58mm
  autoDeliveryNotes: boolean('auto_delivery_notes').default(false).notNull(),
  maxCreditNoteApprovalAmount: decimal('max_credit_note_approval_amount', { precision: 15, scale: 2 }).default('10000.00').notNull(),
  maxCashOutApprovalAmount: decimal('max_cash_out_approval_amount', { precision: 15, scale: 2 }).default('5000.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('company_settings_company_idx').on(table.companyId),
}));

export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 15, scale: 2 }).default('0.00').notNull(),
  maxEcfLimit: integer('max_ecf_limit').default(100).notNull(), // Maximum e-CFs per month (-1 for unlimited)
  maxUsers: integer('max_users').default(5).notNull(), // Maximum users (-1 for unlimited)
  maxWarehouses: integer('max_warehouses').default(1).notNull(), // Maximum warehouses
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: varchar('status', { length: 50 }).default('active').notNull(), // active | past_due | canceled | trialing
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('subscriptions_company_idx').on(table.companyId),
}));
