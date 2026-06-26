import { pgTable, uuid, varchar, text, timestamp, decimal, date, integer, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { warehouses } from './inventory';
import { customers } from './contacts';
import { users } from './auth';
import { cashSessions } from './cash';
import { products } from './products';

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

export const quoteSequences = pgTable('quote_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  currentYear: integer('current_year').notNull(),
  currentSequence: integer('current_sequence').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyYearIdx: uniqueIndex('quote_seq_company_year_idx').on(table.companyId, table.currentYear),
}));

export const quotes = pgTable('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  customerId: uuid('customer_id').references(() => customers.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  sequenceNumber: varchar('sequence_number', { length: 20 }).notNull(), // COT-2026-000001
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | invoiced | cancelled
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).default('0.00').notNull(),
  discount: decimal('discount', { precision: 15, scale: 2 }).default('0.00').notNull(),
  totalTaxes: decimal('total_taxes', { precision: 15, scale: 2 }).default('0.00').notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).default('0.00').notNull(),
  notes: text('notes'),
  validUntil: timestamp('valid_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companySeqIdx: uniqueIndex('quotes_company_seq_idx').on(table.companyId, table.sequenceNumber),
  statusIdx: index('quotes_status_idx').on(table.status),
}));

export const quoteLines = pgTable('quote_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: decimal('quantity', { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  discount: decimal('discount', { precision: 15, scale: 2 }).default('0.00').notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  quoteIdx: index('quote_lines_quote_idx').on(table.quoteId),
}));

export const quoteTaxes = pgTable('quote_taxes', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id),
  taxType: varchar('tax_type', { length: 50 }).notNull(), // ITBIS | ISC | CDT
  rate: decimal('rate', { precision: 5, scale: 2 }).notNull(), // 18.00 | 16.00 | etc.
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  quoteIdx: index('quote_taxes_quote_idx').on(table.quoteId),
}));

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  customerId: uuid('customer_id').references(() => customers.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  cashSessionId: uuid('cash_session_id').references(() => cashSessions.id), // If processed in cashier terminal
  quoteId: uuid('quote_id').references(() => quotes.id),
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
  modifiedNcf: varchar('modified_ncf', { length: 13 }),
  modifiedInvoiceId: uuid('modified_invoice_id').references((): any => invoices.id, { onDelete: 'restrict' }),
  indicadorNotaCredito: integer('indicador_nota_credito'),
  codigoFactura: varchar('codigo_factura', { length: 50 }),
  deliveryStatus: varchar('delivery_status', { length: 50 }).default('pending').notNull(),
  totalRetained: decimal('total_retained', { precision: 15, scale: 2 }).default('0.00').notNull(),
  totalNet: decimal('total_net', { precision: 15, scale: 2 }).default('0.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyNcfIdx: uniqueIndex('invoices_company_ncf_idx').on(table.companyId, table.ncf),
  statusIdx: index('invoices_status_idx').on(table.status),
  createdIdx: index('invoices_created_idx').on(table.createdAt),
  codigoFacturaIdx: uniqueIndex('invoices_codigo_factura_idx').on(table.codigoFactura),
  companyStatusCreatedIdx: index('invoices_comp_status_created_idx').on(table.companyId, table.status, table.createdAt),
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
  deliveryNumber: varchar('delivery_number', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft | approved | voided
  deliveryDate: date('delivery_date').notNull(),
  driverName: varchar('driver_name', { length: 255 }),
  driverLicense: varchar('driver_license', { length: 50 }),
  vehiclePlate: varchar('vehicle_plate', { length: 50 }),
  dispatcherName: varchar('dispatcher_name', { length: 255 }),
  notes: text('notes'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  voidedBy: uuid('voided_by').references(() => users.id),
  voidedAt: timestamp('voided_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('delivery_notes_company_idx').on(table.companyId),
  invoiceIdx: index('delivery_notes_invoice_idx').on(table.invoiceId),
  deliveryNumIdx: uniqueIndex('delivery_notes_num_idx').on(table.companyId, table.deliveryNumber),
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

export const retentions = pgTable('retentions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id),
  name: varchar('name', { length: 255 }).notNull(),
  percentage: decimal('percentage', { precision: 5, scale: 2 }).notNull(), // e.g. 30.00
  type: varchar('type', { length: 20 }).notNull(), // ITBIS | ISR | OTRA
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const invoiceRetentions = pgTable('invoice_retentions', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  retentionId: uuid('retention_id').references(() => retentions.id),
  retentionName: varchar('retention_name', { length: 255 }).notNull(),
  retentionType: varchar('retention_type', { length: 20 }).notNull(), // ITBIS | ISR | OTRA
  retentionPercentage: decimal('retention_percentage', { precision: 5, scale: 2 }).notNull(),
  retentionAmount: decimal('retention_amount', { precision: 15, scale: 2 }).notNull(),
  agentRnc: varchar('agent_rnc', { length: 15 }),
  retentionDate: date('retention_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  invoiceIdx: index('invoice_retentions_invoice_idx').on(table.invoiceId),
}));
