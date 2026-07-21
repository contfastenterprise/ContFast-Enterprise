import { pgTable, uuid, varchar, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { suppliers } from './contacts';
import { users } from './auth';
import { products } from './products';
import { environmentMode } from './system';
import { warehouses } from './inventory';

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

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  orderNumber: varchar('order_number', { length: 50 }).notNull(), // LD-2026-0716
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  orderDate: timestamp('order_date').defaultNow().notNull(),
  expectedDate: timestamp('expected_date'),
  status: varchar('status', { length: 50 }).default('Draft').notNull(), // Draft | Sent | Partial | Received | Cancelled
  observations: text('observations'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companySeqIdx: uniqueIndex('purchase_orders_company_num_modo_idx').on(table.companyId, table.orderNumber, table.modo),
  statusIdx: index('purchase_orders_status_idx').on(table.status),
  supplierIdx: index('purchase_orders_supplier_idx').on(table.supplierId),
}));

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantityRequested: integer('quantity_requested').notNull(),
  quantityReceived: integer('quantity_received').default(0).notNull(),
  observations: text('observations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('purchase_order_items_order_idx').on(table.purchaseOrderId),
}));

export const purchaseOrderLogs = pgTable('purchase_order_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(), // e.g. "Pedido creado", "Pedido enviado"
  changeDetails: text('change_details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('purchase_order_logs_order_idx').on(table.purchaseOrderId),
}));
