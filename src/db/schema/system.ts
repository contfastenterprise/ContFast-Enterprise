import { pgTable, uuid, varchar, text, timestamp, jsonb, index, boolean } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';

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

export const routeMappings = pgTable('route_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  routePattern: varchar('route_pattern', { length: 255 }).notNull(), // ej. '/dashboard/accounting%'
  module: varchar('module', { length: 100 }).notNull(), // ej. 'contabilidad'
  action: varchar('action', { length: 50 }), // read | write | delete | null (dinámico por método HTTP)
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
