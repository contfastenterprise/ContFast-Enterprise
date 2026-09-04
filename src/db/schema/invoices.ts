import { pgTable, uuid, varchar, text, timestamp, decimal, date, integer, index, uniqueIndex, boolean, unique, foreignKey } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { warehouses } from './inventory';
import { customers } from './contacts';
import { users } from './auth';
import { cashSessions } from './cash';
import { products } from './products';
import { environmentMode } from './system';

export const ecfSequences = pgTable('ecf_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
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
  companySeqIdx: uniqueIndex('ecf_seq_company_type_modo_idx').on(table.companyId, table.ecfType, table.modo),
  statusIdx: index('ecf_seq_status_idx').on(table.status),
}));

export const quoteSequences = pgTable('quote_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  currentYear: integer('current_year').notNull(),
  currentSequence: integer('current_sequence').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyYearIdx: uniqueIndex('quote_seq_company_year_modo_idx').on(table.companyId, table.currentYear, table.modo),
}));

/**
 * Numeracion interna del documento (`invoices.codigo_factura`).
 *
 * Antes se generaba contando: SELECT count(*) ... LIKE 'FAC-2026-%' y sumar uno.
 * COUNT(*) no bloquea nada, asi que dos facturas simultaneas se llevaban el
 * mismo numero. El avance ahora es un INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING, una sola sentencia y por tanto atomica.
 *
 * `prefix` es FAC, NC o ND: son series distintas y cada una lleva su cuenta.
 * Misma forma que quote_sequences y supplier_order_sequences.
 */
export const invoiceSequences = pgTable('invoice_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  prefix: varchar('prefix', { length: 8 }).notNull(),
  currentYear: integer('current_year').notNull(),
  currentSequence: integer('current_sequence').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyPrefixYearIdx: uniqueIndex('invoice_seq_company_prefix_year_modo_idx')
    .on(table.companyId, table.prefix, table.currentYear, table.modo),
}));

export const quotes = pgTable('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
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
  companySeqIdx: uniqueIndex('quotes_company_seq_modo_idx').on(table.companyId, table.sequenceNumber, table.modo),
  statusIdx: index('quotes_status_idx').on(table.status),
  // P1-19 / migracion 0032: aislamiento estructural.
  idCompanyUq: unique('quotes_id_company_uq').on(table.id, table.companyId),
  warehouseCompanyFk: foreignKey({
    columns: [table.warehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
    name: 'quotes_warehouse_id_company_fk',
  }),
  customerCompanyFk: foreignKey({
    columns: [table.customerId, table.companyId],
    foreignColumns: [customers.id, customers.companyId],
    name: 'quotes_customer_id_company_fk',
  }),
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
  // Tasa de ITBIS de la linea, como FRACCION (0.1800 = 18%). Ver migracion 0040.
  // Sin ella, al pasar la cotizacion a factura no habia de donde sacar la tasa
  // y el formulario ponia 0.18 a pelo. `quoteTaxes.rate` va en PORCENTAJE.
  taxRate: decimal('tax_rate', { precision: 6, scale: 4 }),
  // Categoria de ITBIS de la linea (0042). Solo tiene sentido con tasa 0, y la
  // restriccion CHECK lo obliga. La DGII distingue dos ceros que no son lo
  // mismo: 'exento' (indicador 4, no se recupera el ITBIS de insumos) y
  // 'tasa_cero' (indicador 3, exportaciones, si se recupera). NULO significa
  // "no se dijo" y se deduce: tasa > 0 -> gravado, tasa 0 -> exento.
  taxCategory: varchar('tax_category', { length: 16 }),
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
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
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
  msellerXmlPath: text('mseller_xml_path'),
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
  // La firma del comprobante, tal y como la devuelve mSeller. Las columnas
  // existen en la base desde las migraciones 0042 y 0043, pero el esquema no
  // las declaraba: para drizzle no existian, asi que nadie podia escribirlas ni
  // leerlas y se quedaron con lo que les puso el relleno de la migracion.
  //
  // Viven en la FACTURA y no solo dentro de `dgii_submissions.response_payload`
  // porque cada consulta de estado reescribia ese JSON con una respuesta que no
  // trae la firma: sincronizar una factura aceptada le borraba los dos datos.
  //
  // NULO significa "no consta", nunca "todavia no lo hemos calculado": la firma
  // no se fabrica. Un comprobante sin ella se imprime como pendiente.
  securityCode: varchar('security_code', { length: 64 }),
  // Texto, no timestamp: se guarda tal cual lo manda mSeller (dd-MM-yyyy con
  // hora). Es lo que la DGII compara contra lo suyo, y reformatearlo seria
  // arriesgarse a cambiarlo.
  signatureDate: varchar('signature_date', { length: 40 }),
  // El enlace del codigo QR lo da mSeller. No se arma a mano: la URL que se
  // construia por nuestra cuenta no era el endpoint de consulta de la DGII y el
  // QR impreso llevaba a una direccion que no existe.
  qrUrl: text('qr_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyNcfIdx: uniqueIndex('invoices_company_ncf_modo_idx').on(table.companyId, table.ncf, table.modo),
  statusIdx: index('invoices_status_idx').on(table.status),
  createdIdx: index('invoices_created_idx').on(table.createdAt),
  // La unicidad del numero interno es POR EMPRESA. Antes era
  // (codigo_factura, modo) a secas, sin empresa: como cada empresa arranca su
  // numeracion en FAC-AAAA-000001, la segunda que emitiera su primera factura
  // del anio chocaba contra la primera. Ver drizzle/0034.
  codigoFacturaIdx: uniqueIndex('invoices_company_codigo_factura_modo_idx')
    .on(table.companyId, table.codigoFactura, table.modo),
  companyStatusCreatedIdx: index('invoices_comp_status_created_modo_idx').on(table.companyId, table.status, table.createdAt, table.modo),
  // P1-19 / migracion 0032: aislamiento estructural.
  idCompanyUq: unique('invoices_id_company_uq').on(table.id, table.companyId),
  warehouseCompanyFk: foreignKey({
    columns: [table.warehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
    name: 'invoices_warehouse_id_company_fk',
  }),
  customerCompanyFk: foreignKey({
    columns: [table.customerId, table.companyId],
    foreignColumns: [customers.id, customers.companyId],
    name: 'invoices_customer_id_company_fk',
  }),
  cashSessionCompanyFk: foreignKey({
    columns: [table.cashSessionId, table.companyId],
    foreignColumns: [cashSessions.id, cashSessions.companyId],
    name: 'invoices_cash_session_id_company_fk',
  }),
  quoteCompanyFk: foreignKey({
    columns: [table.quoteId, table.companyId],
    foreignColumns: [quotes.id, quotes.companyId],
    name: 'invoices_quote_id_company_fk',
  }),
}));

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  quantity: decimal('quantity', { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  discount: decimal('discount', { precision: 15, scale: 2 }).default('0.00').notNull(),
  subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).notNull(),
  // Tasa de ITBIS de ESTA linea, como FRACCION: 0.1800 = 18%.
  //
  // OJO CON LAS UNIDADES: `invoiceTaxes.rate` (mas abajo) va en PORCENTAJE
  // (18.00). Son distintas a proposito -- ver la migracion 0039 -- y hay una
  // comprobacion que fija las dos para que nadie las mezcle.
  //
  // Sin valor por defecto: un `DEFAULT 0.18` seria el mismo silencio que hizo
  // que una factura exenta saliera al 18%. Quien inserta una linea dice la
  // tasa. Admite NULO solo por las facturas anteriores a la 0039 cuya tasa no
  // se puede deducir (varias tasas en la misma factura); NULO significa "no
  // consta", no "18%".
  taxRate: decimal('tax_rate', { precision: 6, scale: 4 }),
  // Categoria de ITBIS de la linea (0042). Solo tiene sentido con tasa 0, y la
  // restriccion CHECK lo obliga. La DGII distingue dos ceros que no son lo
  // mismo: 'exento' (indicador 4, no se recupera el ITBIS de insumos) y
  // 'tasa_cero' (indicador 3, exportaciones, si se recupera). NULO significa
  // "no se dijo" y se deduce: tasa > 0 -> gravado, tasa 0 -> exento.
  taxCategory: varchar('tax_category', { length: 16 }),
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
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
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
  companyModoIdx: index('credit_debit_notes_company_modo_idx').on(table.companyId, table.modo),
  // P1-19 / migracion 0032: aislamiento estructural.
  invoiceCompanyFk: foreignKey({
    columns: [table.invoiceId, table.companyId],
    foreignColumns: [invoices.id, invoices.companyId],
    name: 'credit_debit_notes_invoice_id_company_fk',
  }),
}));

export const deliveryNotes = pgTable('delivery_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
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
  deliveryNumIdx: uniqueIndex('delivery_notes_num_modo_idx').on(table.companyId, table.deliveryNumber, table.modo),
  // P1-19 / migracion 0032: aislamiento estructural.
  invoiceCompanyFk: foreignKey({
    columns: [table.invoiceId, table.companyId],
    foreignColumns: [invoices.id, invoices.companyId],
    name: 'delivery_notes_invoice_id_company_fk',
  }),
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
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  trackId: varchar('track_id', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending | processing | accepted | rejected | failed
  responseCode: varchar('response_code', { length: 50 }),
  responseMessage: text('response_message'),
  xmlPayload: text('xml_payload'),
  responsePayload: text('response_payload'),
  // El codigo de seguridad de la DGII, en su propia columna (0041). Vivia solo
  // dentro de `response_payload`, y las rutas de sincronizacion pisaban ese
  // JSON con la respuesta de la consulta de estado, que no lo lleva. NULL
  // significa "no consta": nunca se rellena con uno fabricado.
  securityCode: varchar('security_code', { length: 64 }),
  retryCount: integer('retry_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('dgii_submissions_company_idx').on(table.companyId),
  invoiceIdx: index('dgii_submissions_invoice_idx').on(table.invoiceId),
  statusIdx: index('dgii_submissions_status_idx').on(table.status),
  companyModoIdx: index('dgii_submissions_company_modo_idx').on(table.companyId, table.modo),
  // P1-19 / migracion 0032: aislamiento estructural.
  invoiceCompanyFk: foreignKey({
    columns: [table.invoiceId, table.companyId],
    foreignColumns: [invoices.id, invoices.companyId],
    name: 'dgii_submissions_invoice_id_company_fk',
  }),
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
}, (table) => ({
  companyActiveIdx: index('retentions_company_active_idx').on(table.companyId, table.active),
}));

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
