import { and, eq } from 'drizzle-orm';

export interface RepositoryContext {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
}

/**
 * Automatically applies company_id and modo (environment) filters to Drizzle queries.
 * Inspects the table metadata to see if it supports tenancy (companyId) and environment isolation (modo).
 * 
 * @param table The Drizzle table object
 * @param ctx The repository context containing companyId and modo
 * @param conditions Additional query conditions
 * @returns Combined SQL conditions
 */
export function withTenantMode(table: any, ctx: RepositoryContext, ...conditions: any[]) {
  const baseFilters = [];

  // Apply tenant isolation if the table has a companyId column
  if ('companyId' in table) {
    baseFilters.push(eq(table.companyId, ctx.companyId));
  }

  // Apply environment mode isolation if the table has a modo column
  if ('modo' in table) {
    baseFilters.push(eq(table.modo, ctx.modo));
  }

  // Filter out any undefined/null conditions
  const cleanConditions = conditions.filter(Boolean);

  return and(...baseFilters, ...cleanConditions);
}
