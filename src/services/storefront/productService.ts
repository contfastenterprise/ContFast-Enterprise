import { db } from '@/db';
import { products, productCategories } from '@/db/schema/products';
import { eq, and, isNull, ilike } from 'drizzle-orm';

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  price: number;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export interface StorefrontCategory {
  id: string;
  name: string;
  slug: string;
}

/**
 * Normaliza un string para usarlo como slug
 */
function createSlug(text: string, id: string): string {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return `${normalized}-${id.slice(0, 8)}`;
}

export const StorefrontProductService = {
  /**
   * Obtiene todos los productos activos, devolviendo únicamente el precio consumidor.
   */
  async getActiveProducts(categoryId?: string, search?: string): Promise<StorefrontProduct[]> {
    let conditions = [
      eq(products.status, 'active'),
      isNull(products.deletedAt)
    ];

    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    if (search) {
      conditions.push(ilike(products.name, `%${search}%`));
    }

    const results = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceConsumidor: products.priceConsumidor,
        imageUrl: products.imageUrl,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
      })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(and(...conditions));

    return results.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      // Forzamos que la tienda solo vea este precio
      price: Number(p.priceConsumidor),
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      slug: createSlug(p.name, p.id),
    }));
  },

  /**
   * Obtiene todas las categorías activas
   */
  async getActiveCategories(): Promise<StorefrontCategory[]> {
    const results = await db
      .select({
        id: productCategories.id,
        name: productCategories.name,
      })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.status, 'active'),
          isNull(productCategories.deletedAt)
        )
      );

    return results.map(c => ({
      id: c.id,
      name: c.name,
      slug: createSlug(c.name, c.id),
    }));
  }
};
