import { pgTable, uuid, timestamp, decimal, date, jsonb, index, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './auth';
import { products } from './products';

/**
 * Lote 247: precios atados al dolar (migracion 0017).
 *
 * Tablas APARTE, y ninguna columna nueva en `products`, a proposito: una columna
 * declarada aqui la pide toda consulta que lee la fila entera, y un despliegue
 * hecho antes de aplicar la migracion tumbaria el catalogo. Estas tablas solo
 * las lee `services/precios/preciosEnDolaresRepositorio.ts`.
 */

/** La tasa propia de la empresa, escrita a mano. Una por dia. */
export const tasasDeCambio = pgTable('tasas_de_cambio', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  /** El dia de RD al que corresponde la tasa. */
  fecha: date('fecha').notNull(),
  /** Pesos por un dolar. */
  tasa: decimal('tasa', { precision: 12, scale: 4 }).notNull(),
  registradaPor: uuid('registrada_por').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  unaPorDia: uniqueIndex('tasas_de_cambio_dia_idx').on(table.companyId, table.fecha),
}));

/** Los productos cuyo precio sigue al dolar. */
export const productosEnDolares = pgTable('productos_en_dolares', {
  productId: uuid('product_id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  costoUsd: decimal('costo_usd', { precision: 15, scale: 4 }).notNull(),
  /** La tasa con la que se calcularon sus precios la ultima vez; nula si nunca. */
  tasaAplicada: decimal('tasa_aplicada', { precision: 12, scale: 4 }),
  aplicadaEn: timestamp('aplicada_en'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyIdx: index('productos_en_dolares_company_idx').on(table.companyId),
  //  El producto, CON su empresa: no se puede atar el producto de otra.
  productoFk: foreignKey({
    name: 'productos_en_dolares_producto_fk',
    columns: [table.productId, table.companyId],
    foreignColumns: [products.id, products.companyId],
  }).onDelete('cascade'),
}));

/** Lo que cambio cada actualizacion de precios. */
export const cambiosDePrecio = pgTable('cambios_de_precio', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  productId: uuid('product_id').notNull(),
  tasa: decimal('tasa', { precision: 12, scale: 4 }).notNull(),
  costoUsd: decimal('costo_usd', { precision: 15, scale: 4 }).notNull(),
  antes: jsonb('antes').notNull(),
  despues: jsonb('despues').notNull(),
  aplicadoPor: uuid('aplicado_por').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  productoIdx: index('cambios_de_precio_producto_idx').on(table.companyId, table.productId, table.createdAt),
}));
