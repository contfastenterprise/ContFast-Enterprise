import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';
import { environmentMode } from './system';

export const documentEmailLogs = pgTable('document_email_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  documentId: uuid('document_id').notNull(), // ID of invoice, quote, etc.
  documentType: varchar('document_type', { length: 50 }).notNull(), // e.g. 'invoice', 'quote'
  userId: uuid('user_id').references(() => users.id),
  toEmail: varchar('to_email', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // 'pending' | 'sent' | 'failed'
  subject: varchar('subject', { length: 255 }).notNull(),
  attachmentName: varchar('attachment_name', { length: 255 }),
  errorMessage: text('error_message'),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentShares = pgTable('document_shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  documentId: uuid('document_id').notNull(),
  documentType: varchar('document_type', { length: 50 }).notNull(),
  token: varchar('token', { length: 128 }).notNull().unique(),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
