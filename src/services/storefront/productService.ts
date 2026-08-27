import { db } from '@/db';
import { products, productCategories } from '@/db/schema/products';
import { eq, and, isNull, ilike } from 'drizzle-orm';

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  price: number;
  isOnSale: boolean;
  promotionalPrice: number;
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
 * Normaliza un string para usarlo como slug y le adjunta el UUID completo
 * para poder recuperar el producto sin crear columnas nuevas en la base de datos.
 */
function createSlug(text: string, id: string): string {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return `${normalized}--${id}`;
}

export const StorefrontProductService = {
  /**
   * Extrae el UUID de un slug generado por createSlug
   */
  getIdFromSlug(slug: string): string | null {
    const parts = slug.split('--');
    if (parts.length < 2) return null;
    const id = parts[parts.length - 1]; // El UUID es la última parte
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(id) ? id : null;
  },

  /**
   * Obtiene un producto individual por su slug (extrayendo el ID)
   */
  /**
   * Ficha de producto de la tienda publica.
   *
   * El companyId es OBLIGATORIO. Antes la consulta se identificaba solo por el
   * UUID que va dentro del slug, y ese slug lo escribe el visitante: entrando a
   * /<empresaA>/productos/loquesea--<uuid-de-un-producto-de-empresaB> se
   * renderizaba el producto de la empresa B dentro de la tienda de la A, con su
   * nombre, descripcion, precio de venta y precio promocional. Y como
   * generateMetadata usa lo mismo para el <title>, quedaba indexable.
   *
   * Es superficie publica y sin autenticar, asi que el filtro va aqui y no en
   * la pagina.
   */
  async getProductBySlug(slug: string, companyId: string): Promise<StorefrontProduct | null> {
    const id = this.getIdFromSlug(slug);
    if (!id) return null;

    const results = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceConsumidor: products.priceConsumidor,
        isOnSale: products.isOnSale,
        promotionalPrice: products.promotionalPrice,
        imageUrl: products.imageUrl,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
      })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(
        and(
          eq(products.id, id),
          eq(products.companyId, companyId),
          eq(products.status, 'active'),
          isNull(products.deletedAt)
        )
      );

    if (results.length === 0) return null;
    const p = results[0];

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.priceConsumidor),
      isOnSale: p.isOnSale,
      promotionalPrice: Number(p.promotionalPrice),
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      slug: createSlug(p.name, p.id),
    };
  },

  /**
   * Obtiene todos los productos activos de una empresa, devolviendo únicamente el precio consumidor.
   */
  async getActiveProducts(companyId: string, categoryId?: string, search?: string): Promise<StorefrontProduct[]> {
    let conditions = [
      eq(products.companyId, companyId),
      eq(products.status, 'active'),
      isNull(products.deletedAt)
    ];

    if (categoryId) {
      // Validate UUID format to prevent Postgres crash on invalid input
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (uuidRegex.test(categoryId)) {
        conditions.push(eq(products.categoryId, categoryId));
      } else {
        // If an invalid category UUID is passed, return empty to prevent crash
        return [];
      }
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
        isOnSale: products.isOnSale,
        promotionalPrice: products.promotionalPrice,
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
      isOnSale: p.isOnSale,
      promotionalPrice: Number(p.promotionalPrice),
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      slug: createSlug(p.name, p.id),
    }));
  },

  /**
   * Obtiene todos los productos que están en oferta
   */
  async getPromotionalProducts(companyId: string): Promise<StorefrontProduct[]> {
    const results = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceConsumidor: products.priceConsumidor,
        isOnSale: products.isOnSale,
        promotionalPrice: products.promotionalPrice,
        imageUrl: products.imageUrl,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
      })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(
        and(
          eq(products.companyId, companyId),
          eq(products.status, 'active'),
          eq(products.isOnSale, true),
          isNull(products.deletedAt)
        )
      );

    return results.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.priceConsumidor),
      isOnSale: p.isOnSale,
      promotionalPrice: Number(p.promotionalPrice),
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      slug: createSlug(p.name, p.id),
    }));
  },

  /**
   * Obtiene todas las categorías activas de una empresa
   */
  async getActiveCategories(companyId: string): Promise<StorefrontCategory[]> {
    const results = await db
      .select({
        id: productCategories.id,
        name: productCategories.name,
      })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.companyId, companyId),
          eq(productCategories.status, 'active'),
          isNull(productCategories.deletedAt)
        )
      );

    return results.map(c => ({
      id: c.id,
      name: c.name,
      slug: createSlug(c.name, c.id),
    }));
  },

  /**
   * Obtiene productos recomendados de una empresa (Fase 5). 
   */
  async getRecommendations(companyId: string, limitNum: number = 4, excludeProductId?: string, preferredCategoryId?: string): Promise<StorefrontProduct[]> {
    let conditions = [
      eq(products.companyId, companyId),
      eq(products.status, 'active'),
      isNull(products.deletedAt)
    ];

    const results = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceConsumidor: products.priceConsumidor,
        imageUrl: products.imageUrl,
        isOnSale: products.isOnSale,
        promotionalPrice: products.promotionalPrice,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
      })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(and(...conditions))
      .limit(20); // Buscamos un pool más grande para filtrar en memoria (por simplicidad y compatibilidad)

    // Filtramos el excluido
    let filtered = results.filter(p => p.id !== excludeProductId);

    // Si hay categoría preferida, tratamos de poner esos primero
    if (preferredCategoryId) {
      filtered.sort((a, b) => {
        if (a.categoryId === preferredCategoryId && b.categoryId !== preferredCategoryId) return -1;
        if (a.categoryId !== preferredCategoryId && b.categoryId === preferredCategoryId) return 1;
        return 0;
      });
    }

    // Tomamos los primeros N
    const finalSet = filtered.slice(0, limitNum);

    return finalSet.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.priceConsumidor),
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      slug: createSlug(p.name, p.id),
      isOnSale: p.isOnSale ?? false,
      promotionalPrice: p.promotionalPrice ? Number(p.promotionalPrice) : 0,
    }));
  }
};
