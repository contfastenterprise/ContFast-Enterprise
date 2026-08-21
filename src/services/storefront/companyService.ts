import { db } from '@/db';
import { companies, companySettings } from '@/db/schema/companies';
import { eq, isNull, and } from 'drizzle-orm';

export interface StorefrontCompany {
  id: string;
  name: string;
  rnc: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
}

/**
 * Normaliza un texto para generar un slug seguro para URLs, eliminando espacios y caracteres especiales.
 * Ejemplo: "Latin Doors R.S.L" -> "latindoorsrsl"
 */
export function generateCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]+/g, ''); // Eliminar todo lo que no sea letra o número (sin guiones ni espacios)
}

export const StorefrontCompanyService = {
  /**
   * Resuelve el ID de la empresa a partir de su slug dinámico.
   * Carga todas las empresas activas, genera el slug en memoria y retorna la coincidencia.
   * Esto evita modificar la tabla 'companies' agregando una columna 'slug'.
   */
  async resolveCompanyBySlug(slug: string): Promise<StorefrontCompany | null> {
    const activeCompanies = await db
      .select({
        id: companies.id,
        name: companies.name,
        rnc: companies.rnc,
        address: companies.address,
        phone: companies.phone,
        email: companies.email,
        logoUrl: companySettings.logoUrl,
      })
      .from(companies)
      .leftJoin(companySettings, eq(companies.id, companySettings.companyId))
      .where(
        and(
          eq(companies.status, 'active'),
          isNull(companies.deletedAt)
        )
      );

    const match = activeCompanies.find(c => generateCompanySlug(c.name) === slug);
    if (!match) return null;

    return {
      id: match.id,
      name: match.name,
      rnc: match.rnc,
      slug: generateCompanySlug(match.name),
      address: match.address,
      phone: match.phone,
      email: match.email,
      logoUrl: match.logoUrl,
    };
  }
};
