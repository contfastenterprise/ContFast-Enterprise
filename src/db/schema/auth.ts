import { pgTable, uuid, varchar, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';

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
  avatarUrl: text('avatar_url'),
  avatarPath: text('avatar_path'),
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
