import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, index, uniqueIndex, pgView, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './auth';

export const productCategories = pgTable('product_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('prod_categories_company_idx').on(table.companyId),
  statusIdx: index('prod_categories_status_idx').on(table.status),
}));

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  categoryId: uuid('category_id').references(() => productCategories.id),
  sku: varchar('sku', { length: 100 }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 15, scale: 2 }).default('0.00').notNull(),
  cost: decimal('cost', { precision: 15, scale: 2 }).default('0.00').notNull(),
  unitOfMeasure: varchar('unit_of_measure', { length: 50 }).default('unidad').notNull(),
  priceConsumidor: decimal('price_consumidor', { precision: 15, scale: 2 }).default('0.00').notNull(),
  priceProveedor: decimal('price_proveedor', { precision: 15, scale: 2 }).default('0.00').notNull(),
  priceMayorista: decimal('price_mayorista', { precision: 15, scale: 2 }).default('0.00').notNull(),
  imageUrl: text('image_url'),
  barcode: varchar('barcode', { length: 100 }),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('products_company_idx').on(table.companyId),
  skuIdx: index('products_sku_idx').on(table.companyId, table.sku),
  statusIdx: index('products_status_idx').on(table.status),
  barcodeIdx: index('products_barcode_idx').on(table.companyId, table.barcode),
}));

export const priceLists = pgTable('price_lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: varchar('name', { length: 255 }).notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('price_lists_company_idx').on(table.companyId),
  isPublicIdx: index('price_lists_is_public_idx').on(table.isPublic),
  statusIdx: index('price_lists_status_idx').on(table.status),
}));

export const priceListItems = pgTable('price_list_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  priceListId: uuid('price_list_id').notNull().references(() => priceLists.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  price: decimal('price', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  listProductIdx: uniqueIndex('price_list_items_list_prod_idx').on(table.priceListId, table.productId),
  companyIdx: index('price_list_items_company_idx').on(table.companyId),
}));

export const vPublicPriceLists = pgView('v_public_price_lists', {
  id: uuid('id'),
  companyId: uuid('company_id'),
  name: varchar('name', { length: 255 }),
  isPublic: boolean('is_public'),
  status: varchar('status', { length: 50 }),
  deletedAt: timestamp('deleted_at'),
}).as(sql`
  SELECT id, company_id, name, is_public, status, deleted_at
  FROM price_lists
  WHERE is_public = true AND status = 'active' AND deleted_at IS NULL
`);

export const vPublicCategories = pgView('v_public_categories', {
  id: uuid('id'),
  companyId: uuid('company_id'),
  name: varchar('name', { length: 255 }),
  status: varchar('status', { length: 50 }),
  deletedAt: timestamp('deleted_at'),
}).as(sql`
  SELECT id, company_id, name, status, deleted_at
  FROM product_categories
  WHERE status = 'active' AND deleted_at IS NULL
`);

export const vPublicProducts = pgView('v_public_products', {
  id: uuid('id'),
  companyId: uuid('company_id'),
  categoryId: uuid('category_id'),
  sku: varchar('sku', { length: 100 }),
  name: varchar('name', { length: 255 }),
  description: text('description'),
  price: decimal('price', { precision: 15, scale: 2 }),
  status: varchar('status', { length: 50 }),
  deletedAt: timestamp('deleted_at'),
}).as(sql`
  SELECT p.id, p.company_id, p.category_id, p.sku, p.name, p.description, pli.price, p.status, p.deleted_at
  FROM products p
  JOIN price_list_items pli ON p.id = pli.product_id
  JOIN price_lists pl ON pli.price_list_id = pl.id
  WHERE p.status = 'active' AND p.deleted_at IS NULL
    AND pl.is_public = true AND pl.status = 'active' AND pl.deleted_at IS NULL
`);

export const productBarcodes = pgTable('product_barcodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  barcode: varchar('barcode', { length: 100 }).notNull(),
  barcodeType: varchar('barcode_type', { length: 30 }).notNull(),
  isPrimary: boolean('is_primary').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('prod_barcodes_company_idx').on(table.companyId),
  productIdx: index('prod_barcodes_product_idx').on(table.productId),
  barcodeIdx: uniqueIndex('prod_barcodes_barcode_idx').on(table.companyId, table.barcode),
}));

export const barcodePrintLogs = pgTable('barcode_print_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('barcode_print_logs_company_idx').on(table.companyId),
  productIdx: index('barcode_print_logs_product_idx').on(table.productId),
}));

