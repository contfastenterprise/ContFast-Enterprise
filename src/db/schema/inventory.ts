import { pgTable, uuid, varchar, text, timestamp, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';
import { products } from './products';

export const warehouses = pgTable('warehouses', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull(), // Ej. ALM-01
  address: text('address'),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('warehouses_company_idx').on(table.companyId),
  codeIdx: uniqueIndex('warehouses_company_code_idx').on(table.companyId, table.code),
}));

export const userWarehouses = pgTable('user_warehouses', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userWarehouseIdx: uniqueIndex('user_warehouses_user_wh_idx').on(table.userId, table.warehouseId),
  companyIdx: index('user_warehouses_company_idx').on(table.companyId),
}));

export const inventoryLevels = pgTable('inventory_levels', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  quantity: decimal('quantity', { precision: 15, scale: 4 }).default('0.0000').notNull(),
  minStock: decimal('min_stock', { precision: 15, scale: 4 }).default('0.0000').notNull(),
  maxStock: decimal('max_stock', { precision: 15, scale: 4 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  prodWhIdx: uniqueIndex('inventory_levels_prod_wh_idx').on(table.productId, table.warehouseId),
  companyIdx: index('inventory_levels_company_idx').on(table.companyId),
}));

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 50 }).notNull(), // sale | purchase | return | adjustment | transfer_in | transfer_out
  quantity: decimal('quantity', { precision: 15, scale: 4 }).notNull(), // Positive or negative
  balanceAfter: decimal('balance_after', { precision: 15, scale: 4 }).notNull(),
  referenceId: uuid('reference_id'), // invoice_id, expense_id, transfer_id, etc.
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('inv_movements_company_idx').on(table.companyId),
  prodWhIdx: index('inv_movements_prod_wh_idx').on(table.productId, table.warehouseId),
  createdIdx: index('inv_movements_created_idx').on(table.createdAt),
}));

export const inventoryTransfers = pgTable('inventory_transfers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  sourceWarehouseId: uuid('source_warehouse_id').notNull().references(() => warehouses.id),
  destinationWarehouseId: uuid('destination_warehouse_id').notNull().references(() => warehouses.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: varchar('status', { length: 50 }).default('completed').notNull(), // pending | completed | cancelled
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('inv_transfers_company_idx').on(table.companyId),
}));

export const inventoryTransferLines = pgTable('inventory_transfer_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  transferId: uuid('transfer_id').notNull().references(() => inventoryTransfers.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: decimal('quantity', { precision: 15, scale: 4 }).notNull(),
}, (table) => ({
  transferIdx: index('inv_trans_lines_transfer_idx').on(table.transferId),
}));
