import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, date, jsonb, integer, index, uniqueIndex, pgView } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ==========================================
// 1. TENANCY & SECURITY MODULE
// ==========================================

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  rnc: varchar('rnc', { length: 11 }).notNull(), // RNC is 9 or 11 digits in DR
  businessActivity: varchar('business_activity', { length: 255 }),
  address: varchar('address', { length: 255 }),
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

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id), // Nullable for system-wide roles
  name: varchar('name', { length: 100 }).notNull(), // sistemas | administracion | contabilidad | facturacion | banco | cajero
  description: text('description'),
  isFixed: boolean('is_fixed').default(false).notNull(), // sistemas and administracion are fixed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyNameIdx: index('roles_company_name_idx').on(table.companyId, table.name),
}));

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  companyIdx: index('users_company_idx').on(table.companyId),
  statusIdx: index('users_status_idx').on(table.status),
}));

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  module: varchar('module', { length: 100 }).notNull(), // caja | facturacion | contabilidad | banco | clientes | proveedores | catalogo | reportes | administracion
  action: varchar('action', { length: 100 }).notNull(), // read | write | delete | execute
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  moduleActionIdx: uniqueIndex('permissions_module_action_idx').on(table.module, table.action),
}));

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
  granted: boolean('granted').default(true).notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  rolePermissionIdx: uniqueIndex('role_permissions_role_perm_idx').on(table.roleId, table.permissionId),
  companyIdx: index('role_permissions_company_idx').on(table.companyId),
}));

export const userPermissions = pgTable('user_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
  granted: boolean('granted').default(true).notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userPermissionIdx: uniqueIndex('user_permissions_user_perm_idx').on(table.userId, table.permissionId),
  companyIdx: index('user_permissions_company_idx').on(table.companyId),
}));

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  refreshHash: varchar('refresh_hash', { length: 255 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  invalidatedAt: timestamp('invalidated_at'),
}, (table) => ({
  refreshIdx: uniqueIndex('sessions_refresh_idx').on(table.refreshHash),
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
  companyIdx: index('sessions_company_idx').on(table.companyId),
}));

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  usedAt: timestamp('used_at'),
}, (table) => ({
  tokenIdx: uniqueIndex('password_resets_token_idx').on(table.tokenHash),
  companyIdx: index('password_resets_company_idx').on(table.companyId),
}));

// ==========================================
// 2. CATALOG & INVENTORY MODULE
// ==========================================

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

// ==========================================
// 2.5 WAREHOUSES & INVENTORY TRACKING MODULE
// ==========================================

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

// ==========================================
// 3. CUSTOMERS & SUPPLIERS MODULE
// ==========================================

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  rncCedula: varchar('rnc_cedula', { length: 15 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
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

// ==========================================
// 4. CASH REGISTER MODULE (CAJA)
// ==========================================

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

// ==========================================
// 5. INVOICES & e-CF MODULE
// ==========================================

export const ecfSequences = pgTable('ecf_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  ecfType: varchar('ecf_type', { length: 5 }).notNull(), // 31 (Fiscal), 32 (Consumo), 33 (ND), 34 (NC), etc.
  prefix: varchar('prefix', { length: 5 }).default('E').notNull(), // Always starts with E in DR
  currentSequence: integer('current_sequence').notNull(),
  maxSequence: integer('max_sequence').notNull(),
  expiryDate: date('expiry_date'),
  sequenceExpiry: varchar('sequence_expiry', { length: 10 }), // formato dd-MM-yyyy para DGII
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companySeqIdx: index('ecf_seq_company_type_idx').on(table.companyId, table.ecfType),
  statusIdx: index('ecf_seq_status_idx').on(table.status),
}));

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  customerId: uuid('customer_id').references(() => customers.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  cashSessionId: uuid('cash_session_id').references(() => cashSessions.id), // If processed in cashier terminal
  ncf: varchar('ncf', { length: 13 }).notNull(), // E310000000001
  ecfType: varchar('ecf_type', { length: 5 }).notNull(), // 31 | 32 | etc.
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft | signed | submitted | accepted | rejected | void
  paymentStatus: varchar('payment_status', { length: 50 }).default('unpaid').notNull(), // unpaid | partial | paid
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).default('0.00').notNull(),
  discount: decimal('discount', { precision: 15, scale: 2 }).default('0.00').notNull(),
  totalTaxes: decimal('total_taxes', { precision: 15, scale: 2 }).default('0.00').notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).default('0.00').notNull(),
  xmlPath: text('xml_path'),
  signedXmlPath: text('signed_xml_path'),
  pdfPath: text('pdf_path'),
  msellerTrackId: varchar('mseller_track_id', { length: 255 }),
  buyerRnc: varchar('buyer_rnc', { length: 15 }),
  buyerName: varchar('buyer_name', { length: 255 }),
  dgiiMessage: text('dgii_message'),
  notes: text('notes'),
  paymentType: varchar('payment_type', { length: 50 }).default('cash').notNull(),
  bankName: varchar('bank_name', { length: 100 }),
  transactionNumber: varchar('transaction_number', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyNcfIdx: uniqueIndex('invoices_company_ncf_idx').on(table.companyId, table.ncf),
  statusIdx: index('invoices_status_idx').on(table.status),
  createdIdx: index('invoices_created_idx').on(table.createdAt),
}));

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: decimal('quantity', { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  discount: decimal('discount', { precision: 15, scale: 2 }).default('0.00').notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  invoiceIdx: index('invoice_lines_invoice_idx').on(table.invoiceId),
}));

export const invoiceTaxes = pgTable('invoice_taxes', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  taxType: varchar('tax_type', { length: 50 }).notNull(), // ITBIS | ISC | CDT
  rate: decimal('rate', { precision: 5, scale: 2 }).notNull(), // 18.00 | 16.00 | etc.
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  invoiceIdx: index('invoice_taxes_invoice_idx').on(table.invoiceId),
}));

export const creditDebitNotes = pgTable('credit_debit_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 5 }).notNull(), // 33 (Debit), 34 (Credit)
  ncf: varchar('ncf', { length: 13 }).notNull(), // E33 / E34 sequence
  reason: text('reason').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending_approval').notNull(), // pending_approval | approved | rejected | submitted
  approvedBy: uuid('approved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('credit_debit_notes_company_idx').on(table.companyId),
  invoiceIdx: index('credit_debit_notes_invoice_idx').on(table.invoiceId),
}));

export const deliveryNotes = pgTable('delivery_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  deliveryDate: date('delivery_date').notNull(),
  driverName: varchar('driver_name', { length: 255 }),
  driverLicense: varchar('driver_license', { length: 50 }),
  vehiclePlate: varchar('vehicle_plate', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('delivery_notes_company_idx').on(table.companyId),
  invoiceIdx: index('delivery_notes_invoice_idx').on(table.invoiceId),
}));

export const deliveryNoteLines = pgTable('delivery_note_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  deliveryNoteId: uuid('delivery_note_id').notNull().references(() => deliveryNotes.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: decimal('quantity', { precision: 15, scale: 4 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  deliveryNoteIdx: index('delivery_note_lines_note_idx').on(table.deliveryNoteId),
}));

// ==========================================
// 6. BANKING & MOVEMENTS MODULE
// ==========================================

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

// ==========================================
// 7. GENERAL LEDGER & ACCOUNTING MODULE
// ==========================================

export const chartOfAccounts = pgTable('chart_of_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  code: varchar('code', { length: 100 }).notNull(), // 1, 1.1, 1.1.01, etc.
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // asset | liability | equity | revenue | expense
  parentId: uuid('parent_id'), // Self-reference is handled logically or via DB FK if ordered
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyCodeIdx: uniqueIndex('chart_accounts_company_code_idx').on(table.companyId, table.code),
  statusIdx: index('chart_accounts_status_idx').on(table.status),
}));

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  reference: varchar('reference', { length: 255 }), // Invoice ID, check ID, etc.
  date: date('date').notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('posted').notNull(), // draft | posted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('journal_entries_company_idx').on(table.companyId),
  dateIdx: index('journal_entries_date_idx').on(table.date),
}));

export const journalEntryLines = pgTable('journal_entry_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id),
  accountId: uuid('account_id').notNull().references(() => chartOfAccounts.id),
  debit: decimal('debit', { precision: 15, scale: 2 }).default('0.00').notNull(),
  credit: decimal('credit', { precision: 15, scale: 2 }).default('0.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  entryIdx: index('journal_lines_entry_idx').on(table.journalEntryId),
  accountIdx: index('journal_lines_account_idx').on(table.accountId),
  companyIdx: index('journal_entry_lines_company_idx').on(table.companyId),
}));

export const accountsReceivable = pgTable('accounts_receivable', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull(),
  dueDate: date('due_date').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | paid | overdue
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('ar_company_idx').on(table.companyId),
  customerIdx: index('ar_customer_idx').on(table.customerId),
  invoiceIdx: index('ar_invoice_idx').on(table.invoiceId),
}));

export const customerReceipts = pgTable('customer_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  date: date('date').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // cash | bank | check
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 255 }), // transfer number, check number, etc.
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('cust_receipts_company_idx').on(table.companyId),
  customerIdx: index('cust_receipts_customer_idx').on(table.customerId),
  dateIdx: index('cust_receipts_date_idx').on(table.date),
}));

export const customerReceiptApplied = pgTable('customer_receipt_applied', {
  id: uuid('id').defaultRandom().primaryKey(),
  receiptId: uuid('receipt_id').notNull().references(() => customerReceipts.id),
  arId: uuid('ar_id').notNull().references(() => accountsReceivable.id),
  amountApplied: decimal('amount_applied', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  receiptIdx: index('cra_receipt_idx').on(table.receiptId),
  arIdx: index('cra_ar_idx').on(table.arId),
}));

export const accountsPayable = pgTable('accounts_payable', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull(),
  dueDate: date('due_date').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | paid | overdue
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('ap_company_idx').on(table.companyId),
  supplierIdx: index('ap_supplier_idx').on(table.supplierId),
}));

export const supplierPayments = pgTable('supplier_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  date: date('date').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // cash | bank | check
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 255 }), // transfer number, check number, etc.
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('supp_pay_company_idx').on(table.companyId),
  supplierIdx: index('supp_pay_supplier_idx').on(table.supplierId),
  dateIdx: index('supp_pay_date_idx').on(table.date),
}));

export const supplierPaymentApplied = pgTable('supplier_payment_applied', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id').notNull().references(() => supplierPayments.id),
  apId: uuid('ap_id').notNull().references(() => accountsPayable.id),
  amountApplied: decimal('amount_applied', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  paymentIdx: index('spa_payment_idx').on(table.paymentId),
  apIdx: index('spa_ap_idx').on(table.apId),
}));

export const checks = pgTable('checks', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  checkNumber: varchar('check_number', { length: 100 }).notNull(),
  payee: varchar('payee', { length: 255 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  issueDate: date('issue_date').notNull(),
  dueDate: date('due_date'),
  isGuarantee: boolean('is_guarantee').default(false).notNull(),
  apId: uuid('ap_id').references(() => accountsPayable.id),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | cleared | voided
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyCheckIdx: uniqueIndex('checks_company_num_idx').on(table.companyId, table.checkNumber),
  statusIdx: index('checks_status_idx').on(table.status),
  apIdx: index('checks_ap_idx').on(table.apId),
}));

export const apPayments = pgTable('ap_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  apId: uuid('ap_id').notNull().references(() => accountsPayable.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // cash | transfer | check
  checkId: uuid('check_id').references(() => checks.id),
  debitAccountId: uuid('debit_account_id').notNull().references(() => chartOfAccounts.id),
  creditAccountId: uuid('credit_account_id').notNull().references(() => chartOfAccounts.id),
  paymentDate: date('payment_date').notNull(),
  status: varchar('status', { length: 50 }).default('applied').notNull(), // pending_guarantee | applied | voided
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('ap_payments_company_idx').on(table.companyId),
  apIdx: index('ap_payments_ap_idx').on(table.apId),
  statusIdx: index('ap_payments_status_idx').on(table.status),
}));


// ==========================================
// 8. LOGS, QUEUES & NOTIFICATIONS MODULE
// ==========================================

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 255 }).notNull(), // e.g. permission_change, login, invoice_sign
  entityType: varchar('entity_type', { length: 100 }).notNull(), // e.g. user_permissions, invoices
  entityId: uuid('entity_id'),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('audit_logs_company_idx').on(table.companyId),
  createdIdx: index('audit_logs_created_idx').on(table.createdAt),
}));

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).default('info').notNull(), // info | warning | error | success
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('notifications_company_idx').on(table.companyId),
  userReadIdx: index('notifications_user_read_idx').on(table.userId, table.readAt),
}));

export const dgiiSubmissions = pgTable('dgii_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  trackId: varchar('track_id', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | processing | accepted | rejected | failed
  responseCode: varchar('response_code', { length: 50 }),
  responseMessage: text('response_message'),
  xmlPayload: text('xml_payload'),
  responsePayload: text('response_payload'),
  retryCount: integer('retry_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('dgii_submissions_company_idx').on(table.companyId),
  invoiceIdx: index('dgii_submissions_invoice_idx').on(table.invoiceId),
  statusIdx: index('dgii_submissions_status_idx').on(table.status),
}));

// ==========================================
// 9. CASH REGISTER MOVEMENTS & SUMMARIES
// ==========================================

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

export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  supplierId: uuid('supplier_id').references(() => suppliers.id), // Made nullable for minor expenses without supplier
  expenseType: varchar('expense_type', { length: 2 }).notNull(), // '01' to '11'
  isMinorExpense: boolean('is_minor_expense').default(false).notNull(), // TRUE if it's a petty cash / minor expense
  ncf: varchar('ncf', { length: 19 }), // Nullable for informal minor expenses
  ncfModified: varchar('ncf_modified', { length: 19 }),
  issueDate: date('issue_date').notNull(),
  paymentDate: date('payment_date'),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  itbis: decimal('itbis', { precision: 15, scale: 2 }).default('0.00').notNull(),
  itbisRetained: decimal('itbis_retained', { precision: 15, scale: 2 }).default('0.00').notNull(),
  itbisProportionality: decimal('itbis_proportionality', { precision: 15, scale: 2 }).default('0.00').notNull(),
  isrRetained: decimal('isr_retained', { precision: 15, scale: 2 }).default('0.00').notNull(),
  isc: decimal('isc', { precision: 15, scale: 2 }).default('0.00').notNull(),
  otherTaxes: decimal('other_taxes', { precision: 15, scale: 2 }).default('0.00').notNull(),
  tip: decimal('tip', { precision: 15, scale: 2 }).default('0.00').notNull(),
  paymentMethod: varchar('payment_method', { length: 2 }).notNull(), // '01' to '07'
  description: text('description'), // Optional general description
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('expense_company_idx').on(table.companyId),
  supplierIdx: index('expense_supplier_idx').on(table.supplierId),
  issueDateIdx: index('expense_issue_date_idx').on(table.issueDate),
}));

export const expenseLines = pgTable('expense_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id), // Nullable for ad-hoc service lines
  description: text('description').notNull(), // Either product name or manual description
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal('unit_cost', { precision: 15, scale: 2 }).notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
  itbis: decimal('itbis', { precision: 15, scale: 2 }).default('0.00').notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  expenseIdx: index('expense_line_exp_idx').on(table.expenseId),
  productIdx: index('expense_line_prod_idx').on(table.productId),
}));

// ==========================================
// 10. PUBLIC DATA VIEWS
// ==========================================

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

