import { pgTable, uuid, varchar, text, boolean, timestamp, decimal, index, uniqueIndex, integer } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  rnc: varchar('rnc', { length: 11 }).notNull(), // RNC is 9 or 11 digits in DR
  businessActivity: varchar('business_activity', { length: 255 }),
  address: varchar('address', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
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
  // EL MODO DEL SISTEMA. Un solo interruptor (migracion 0047).
  //
  // Guardaba el ambiente de la DGII ('test' | 'production') y era una SEGUNDA
  // decision junto al modo, con lo que podian contradecirse -- y se resolvia en
  // silencio hacia pruebas. Ahora guarda el modo, y el ambiente se deduce con
  // `entornoDgii()`: PRUEBA -> TesteCF, CERTIFICACION -> CerteCF,
  // PRODUCCION -> eCF. Nunca al reves.
  //
  // La restriccion `company_settings_dgii_env_modo_ck` lo limita a esos tres.
  dgiiEnv: varchar('dgii_env', { length: 50 }).default('PRUEBA').notNull(), // PRODUCCION | PRUEBA | CERTIFICACION

  logoUrl: text('logo_url'),
  msellerUrl: text('mseller_url').default('https://ecf.api.mseller.app/v1').notNull(),
  msellerApiKeyEncrypted: text('mseller_api_key_encrypted'),
  msellerEmail: varchar('mseller_email', { length: 255 }),
  msellerPasswordEncrypted: text('mseller_password_encrypted'),
  printLayout: varchar('print_layout', { length: 50 }).default('carta').notNull(), // carta | 80mm | 58mm
  printCopies: integer('print_copies').default(2).notNull(),
  autoDeliveryNotes: boolean('auto_delivery_notes').default(false).notNull(),
  maxCreditNoteApprovalAmount: decimal('max_credit_note_approval_amount', { precision: 15, scale: 2 }).default('10000.00').notNull(),
  maxCashOutApprovalAmount: decimal('max_cash_out_approval_amount', { precision: 15, scale: 2 }).default('5000.00').notNull(),
  barcodeDefaultType: varchar('barcode_default_type', { length: 30 }).default('code128').notNull(),
  barcodePrefix: varchar('barcode_prefix', { length: 20 }).default('COD').notNull(),
  barcodeLength: integer('barcode_length').default(9).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyIdx: index('company_settings_company_idx').on(table.companyId),
}));

/**
 * La clave de API de mSeller, UNA POR ENTORNO.
 *
 * --- POR QUE (hallazgo ISO-16) --------------------------------------------
 *
 * De las tres credenciales de mSeller, solo la CLAVE DE API cambia entre
 * ambientes. El correo y la contrasena son los mismos y se quedan donde estaban,
 * en `company_settings`: duplicarlos por ambiente los expondria a
 * desincronizarse, y un cambio de contrasena aplicado en dos ambientes de tres
 * deja el tercero roto sin que nadie se entere. Un dato, un sitio.
 *
 * Antes habia una sola clave por empresa. El dia que una pasaba a produccion
 * tenia que sustituir la de pruebas, y a partir de ahi el modo PRUEBA se quedaba
 * sin clave valida: `entornoDgii` lo mandaba a TesteCF, que es lo correcto, pero
 * con la clave de produccion. Toda la separacion por modo se quedaba sin efecto
 * justo el dia del arranque real.
 *
 * Tabla y no tres columnas: asi entra `CerteCF` sin tocar el esquema, y cada
 * clave lleva su fecha de cambio, que para algo que hay que rotar viene bien.
 */
export const msellerApiKeys = pgTable('mseller_api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  /** TesteCF | CerteCF | eCF -- los mismos valores que devuelve `entornoDgii`. */
  entorno: varchar('entorno', { length: 20 }).notNull(),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Una clave por empresa y entorno, y no mas: dos filas para el mismo entorno
  // dejarian la eleccion al orden en que Postgres devuelva las filas.
  companyEntornoIdx: uniqueIndex('mseller_api_keys_company_entorno_idx')
    .on(table.companyId, table.entorno),
  companyIdx: index('mseller_api_keys_company_idx').on(table.companyId),
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
