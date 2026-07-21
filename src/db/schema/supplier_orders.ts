import { pgTable, uuid, varchar, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { suppliers } from './contacts';
import { users } from './auth';
import { products } from './products';
import { environmentMode } from './system';

export const supplierOrderSequences = pgTable('supplier_order_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  currentYear: integer('current_year').notNull(),
  currentSequence: integer('current_sequence').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyYearIdx: uniqueIndex('supplier_order_seq_company_year_modo_idx').on(table.companyId, table.currentYear, table.modo),
}));

export const supplierOrders = pgTable('supplier_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  orderNumber: varchar('order_number', { length: 50 }).notNull(), // e.g. LD-2026-0716
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | sent | completed | cancelled
  orderDate: timestamp('order_date').defaultNow().notNull(),
  observations: text('observations'),
  generalConditions: text('general_conditions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companySeqIdx: uniqueIndex('supplier_orders_company_num_modo_idx').on(table.companyId, table.orderNumber, table.modo),
  statusIdx: index('supplier_orders_status_idx').on(table.status),
  supplierIdx: index('supplier_orders_supplier_idx').on(table.supplierId),
}));

export const supplierOrderLines = pgTable('supplier_order_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => supplierOrders.id),
  productId: uuid('product_id').references(() => products.id),
  modelo: varchar('modelo', { length: 255 }),
  medida: varchar('medida', { length: 100 }),
  colorAcabado: varchar('color_acabado', { length: 100 }),
  linea: varchar('linea', { length: 255 }),
  numHuecosCerradura: varchar('num_huecos_cerradura', { length: 50 }), // e.g. 2H, 1H
  cantidad: integer('cantidad').notNull(),
  observaciones: text('observaciones'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('supplier_order_lines_order_idx').on(table.orderId),
}));
