import { pgTable, uuid, varchar, text, timestamp, jsonb, index, uniqueIndex, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';

export const environmentMode = pgEnum('environment_mode', ['PRODUCCION', 'PRUEBA']);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  userId: uuid('user_id').references(() => users.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  action: varchar('action', { length: 255 }).notNull(), // e.g. permission_change, login, invoice_sign
  entityType: varchar('entity_type', { length: 100 }).notNull(), // e.g. user_permissions, invoices
  entityId: uuid('entity_id'),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('audit_logs_company_idx').on(table.companyId),
  createdIdx: index('audit_logs_created_idx').on(table.createdAt),
  companyModoIdx: index('audit_logs_company_modo_idx').on(table.companyId, table.modo),
}));

/**
 * Los avisos del sistema, guardados.
 *
 * LOTE 160. La tabla existia desde el principio y estaba VACIA: nadie escribia
 * ni leia en ella (medido el 2026-09-18: 0 filas, y la unica referencia en todo
 * `src/` era este esquema). Los avisos se calculaban al vuelo en el panel y
 * morian ahi: no habia forma de saber desde cuando llevaba avisando algo, ni de
 * quitarse de encima uno ya atendido.
 *
 * Lo que le faltaba para servir, y se añade aqui (migracion 0010):
 *  · `modo`: sin el, un aviso de PRUEBA sale entre los reales.
 *  · `clave`: la identidad ESTABLE del aviso ("declaracion-606-202608",
 *    "caja-<id>"). Sin ella, cada calculo del panel insertaria otra fila del
 *    mismo aviso. Con ella hay UNA por empresa, modo y clave.
 *  · `actionLink` / `actionText`: el aviso lleva a donde se resuelve.
 *  · `resolvedAt`: cuando dejo de aplicar. Un aviso resuelto no se borra --
 *    saber que el 606 de agosto estuvo avisando tres semanas es informacion.
 *  · `userId` pasa a OPCIONAL: estos avisos son de la EMPRESA, no de una
 *    persona. Se conserva para un aviso dirigido a alguien en concreto.
 *
 * DECIDIDO por el dueño el 2026-09-18: "leida" es de la empresa, no de cada
 * persona. Si alguien marca leido "el 607 de agosto vence", desaparece para
 * todos. Si algun dia hace falta por persona, es una tabla puente aparte.
 */
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  /** Identidad estable del aviso: una fila por empresa, modo y clave. */
  clave: varchar('clave', { length: 120 }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).default('info').notNull(), // info | warning | error | success
  actionText: varchar('action_text', { length: 80 }),
  actionLink: varchar('action_link', { length: 255 }),
  readAt: timestamp('read_at'),
  /** Cuando el aviso dejo de aplicar (el cheque se cobro, la caja se cerro...). */
  resolvedAt: timestamp('resolved_at'),
  // Lote 178: cuando se mando por WhatsApp. Es lo que impide repetirlo: el
  // panel recalcula sus avisos en CADA carga, asi que sin esta marca el mismo
  // cheque se anunciaria cada vez que alguien abre el inicio. Se pone a null
  // si el aviso se cierra y vuelve a aparecer, porque eso si es noticia nueva.
  whatsappEnviadoAt: timestamp('whatsapp_enviado_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('notifications_company_idx').on(table.companyId),
  userReadIdx: index('notifications_user_read_idx').on(table.userId, table.readAt),
  //  Lo que impide duplicar el mismo aviso en cada calculo del panel.
  claveUq: uniqueIndex('notifications_clave_idx').on(table.companyId, table.modo, table.clave),
  vivosIdx: index('notifications_vivos_idx').on(table.companyId, table.modo, table.resolvedAt),
}));

export const routeMappings = pgTable('route_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  routePattern: varchar('route_pattern', { length: 255 }).notNull(), // ej. '/dashboard/accounting%'
  module: varchar('module', { length: 100 }).notNull(), // ej. 'contabilidad'
  action: varchar('action', { length: 50 }), // read | write | delete | null (dinámico por método HTTP)
  isMenuItem: boolean('is_menu_item').default(false).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  groupName: varchar('group_name', { length: 100 }),
  iconName: varchar('icon_name', { length: 100 }),
  orderIndex: integer('order_index'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  patternIdx: index('route_mappings_pattern_idx').on(table.routePattern),
}));

export const auditPermissions = pgTable('audit_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id),
  userId: uuid('user_id').references(() => users.id),
  ipAddress: varchar('ip_address', { length: 45 }),
  route: text('route').notNull(),
  method: varchar('method', { length: 10 }).notNull(),
  allowed: boolean('allowed').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('audit_permissions_company_idx').on(table.companyId),
  userIdIdx: index('audit_permissions_user_idx').on(table.userId),
  createdAtIdx: index('audit_permissions_created_idx').on(table.createdAt),
}));

export const systemEmailLogs = pgTable('system_email_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  context: varchar('context', { length: 50 }).notNull(), // 'invoice', 'supplier_order', 'system', etc.
  referenceId: varchar('reference_id', { length: 128 }), // ID of invoice, order, etc.
  userId: uuid('user_id').references(() => users.id),
  toEmail: varchar('to_email', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // 'pending' | 'sent' | 'failed'
  subject: varchar('subject', { length: 255 }).notNull(),
  attachmentNames: jsonb('attachment_names'), // array of attachment names if multiple
  errorMessage: text('error_message'),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('system_email_logs_company_idx').on(table.companyId),
  contextIdx: index('system_email_logs_context_idx').on(table.context),
  statusIdx: index('system_email_logs_status_idx').on(table.status),
}));
