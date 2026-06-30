import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex, decimal } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  rncCedula: varchar('rnc_cedula', { length: 15 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
  creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }).default('0.00').notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyCustomerIdx: uniqueIndex('customers_company_rnc_idx').on(table.companyId, table.rncCedula),
  statusIdx: index('customers_status_idx').on(table.status),
}));

export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  rnc: varchar('rnc', { length: 11 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companySupplierIdx: uniqueIndex('suppliers_company_rnc_idx').on(table.companyId, table.rnc),
  statusIdx: index('suppliers_status_idx').on(table.status),
}));
