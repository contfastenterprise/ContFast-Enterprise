import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';
import { environmentMode } from './system';

export const agentProposals = pgTable('agent_proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  area: varchar('area', { length: 50 }).notNull(), // e.g., 'flujo_efectivo'
  summary: text('summary').notNull(),
  justification: text('justification').notNull(),
  confidenceLevel: varchar('confidence_level', { length: 20 }).notNull(), // alta | media | baja
  riskLevel: varchar('risk_level', { length: 20 }).notNull(), // bajo | medio | alto
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending | approved | rejected
  userId: uuid('user_id').references(() => users.id), // The user who approved/rejected it
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  companyModoIdx: index('agent_proposals_company_modo_idx').on(table.companyId, table.modo),
  areaIdx: index('agent_proposals_area_idx').on(table.area),
}));
