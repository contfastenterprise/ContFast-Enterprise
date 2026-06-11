import { db, products } from '@/db';
import { eq, and, isNull, desc, count, or, ilike } from 'drizzle-orm';

export interface CreateProductInput {
  companyId: string;
  categoryId?: string | null;
  sku?: string | null;
  name: string;
  description?: string | null;
  price?: number;
  cost?: number;
  unitOfMeasure?: string;
  priceConsumidor?: number;
  priceProveedor?: number;
  priceMayorista?: number;
  imageUrl?: string | null;
  barcode?: string | null;
  status?: string;
}

export interface UpdateProductInput {
  categoryId?: string | null;
  sku?: string | null;
  name?: string;
  description?: string | null;
  price?: number;
  cost?: number;
  unitOfMeasure?: string;
  priceConsumidor?: number;
  priceProveedor?: number;
  priceMayorista?: number;
  imageUrl?: string | null;
  barcode?: string | null;
  status?: string;
}

export class ProductRepository {
  static async create(data: CreateProductInput) {
    const [product] = await db
      .insert(products)
      .values({
        companyId: data.companyId,
        categoryId: data.categoryId,
        sku: data.sku,
        name: data.name,
        description: data.description,
        price: data.price !== undefined ? data.price.toString() : '0.00',
        cost: data.cost !== undefined ? data.cost.toString() : '0.00',
        unitOfMeasure: data.unitOfMeasure || 'unidad',
        priceConsumidor: data.priceConsumidor !== undefined ? data.priceConsumidor.toString() : '0.00',
        priceProveedor: data.priceProveedor !== undefined ? data.priceProveedor.toString() : '0.00',
        priceMayorista: data.priceMayorista !== undefined ? data.priceMayorista.toString() : '0.00',
        imageUrl: data.imageUrl,
        barcode: data.barcode,
        status: data.status || 'active',
      })
      .returning();
    return product;
  }

  static async getById(id: string, companyId: string) {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.companyId, companyId), isNull(products.deletedAt)))
      .limit(1);
    return product || null;
  }

  static async getByBarcode(barcode: string, companyId: string) {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.barcode, barcode), eq(products.companyId, companyId), isNull(products.deletedAt)))
      .limit(1);
    return product || null;
  }

  static async list(companyId: string, page = 1, perPage = 20, search?: string, categoryId?: string) {
    const offset = (page - 1) * perPage;

    let searchFilter = and(eq(products.companyId, companyId), isNull(products.deletedAt));

    if (search) {
      searchFilter = and(
        searchFilter,
        or(
          ilike(products.name, `%${search}%`),
          ilike(products.sku, `%${search}%`),
          ilike(products.barcode, `%${search}%`)
        )
      );
    }

    if (categoryId) {
      searchFilter = and(searchFilter, eq(products.categoryId, categoryId));
    }

    const [totalResult] = await db
      .select({ value: count() })
      .from(products)
      .where(searchFilter);

    const data = await db
      .select()
      .from(products)
      .where(searchFilter)
      .orderBy(desc(products.createdAt))
      .limit(perPage)
      .offset(offset);

    const total = totalResult?.value || 0;

    return {
      data,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    };
  }

  static async update(id: string, companyId: string, data: UpdateProductInput) {
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (data.categoryId !== undefined) updateValues.categoryId = data.categoryId;
    if (data.sku !== undefined) updateValues.sku = data.sku;
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.price !== undefined) updateValues.price = data.price.toString();
    if (data.cost !== undefined) updateValues.cost = data.cost.toString();
    if (data.unitOfMeasure !== undefined) updateValues.unitOfMeasure = data.unitOfMeasure;
    if (data.priceConsumidor !== undefined) updateValues.priceConsumidor = data.priceConsumidor.toString();
    if (data.priceProveedor !== undefined) updateValues.priceProveedor = data.priceProveedor.toString();
    if (data.priceMayorista !== undefined) updateValues.priceMayorista = data.priceMayorista.toString();
    if (data.imageUrl !== undefined) updateValues.imageUrl = data.imageUrl;
    if (data.barcode !== undefined) updateValues.barcode = data.barcode;
    if (data.status !== undefined) updateValues.status = data.status;

    const [product] = await db
      .update(products)
      .set(updateValues)
      .where(and(eq(products.id, id), eq(products.companyId, companyId)))
      .returning();
    return product || null;
  }

  static async delete(id: string, companyId: string) {
    const [product] = await db
      .update(products)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.companyId, companyId)))
      .returning();
    return product || null;
  }
}
