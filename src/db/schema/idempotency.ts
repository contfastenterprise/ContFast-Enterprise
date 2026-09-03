import { pgTable, uuid, varchar, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { environmentMode } from './system';

/**
 * Claves de idempotencia para rutas POST criticas.
 *
 * Auditoria P1-11 (2026-09-03). El indice unico de financial_movements
 * (migracion 0050) solo protege el caso donde un reintento reutiliza un
 * documentId YA EXISTENTE. No protege el caso, mas comun, de que un
 * reintento de red o un doble clic vuelva a llamar a la ruta completa y
 * cree una fila (pago, cobro, factura) NUEVA con un id distinto cada vez
 * -- eso ninguna restriccion de esquema lo puede detectar por si sola.
 *
 * Ver `src/lib/idempotency.ts` (withIdempotency) para el uso: el cliente
 * envia un header `Idempotency-Key`; si no lo envia, la ruta funciona
 * igual que antes de este cambio (proteccion opcional, no rompe clientes
 * existentes).
 */
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  modo: environmentMode('modo').default('PRODUCCION').notNull(),
  // Identifica la ruta (ej. 'POST /api/v1/ap/payments') para que la misma
  // clave en dos rutas distintas no colisione.
  route: varchar('route', { length: 100 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).default('processing').notNull(), // processing | completed
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  companyModoRouteKeyIdx: uniqueIndex('idem_keys_company_modo_route_key_idx').on(table.companyId, table.modo, table.route, table.idempotencyKey),
  createdAtIdx: index('idem_keys_created_at_idx').on(table.createdAt),
}));
