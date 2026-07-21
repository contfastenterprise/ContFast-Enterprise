import { db, products, productBarcodes, barcodePrintLogs, companySettings } from '@/db';
import { eq, and, isNull, desc, count, or, ilike, inArray, isNotNull } from 'drizzle-orm';

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
  secondaryBarcodes?: { barcode: string; barcodeType: string }[];
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
    let finalSku = data.sku;

    if (!finalSku || !finalSku.trim()) {
      const lastProducts = await db
        .select({ sku: products.sku })
        .from(products)
        .where(
          and(
            eq(products.companyId, data.companyId),
            ilike(products.sku, 'PROD-%'),
            isNull(products.deletedAt)
          )
        );

      let maxNum = 0;
      for (const p of lastProducts) {
        if (p.sku) {
          const match = p.sku.match(/^PROD-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) {
              maxNum = num;
            }
          }
        }
      }

      let collision = true;
      let nextNum = maxNum + 1;
      while (collision) {
        finalSku = `PROD-${String(nextNum).padStart(6, '0')}`;
        const [existing] = await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.companyId, data.companyId), eq(products.sku, finalSku)));

        if (!existing) {
          collision = false;
        } else {
          nextNum++;
        }
      }
    }

    const [product] = await db
      .insert(products)
      .values({
        companyId: data.companyId,
        categoryId: data.categoryId,
        sku: finalSku,
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

    if (product && data.secondaryBarcodes && data.secondaryBarcodes.length > 0) {
      await db.insert(productBarcodes).values(
        data.secondaryBarcodes.map((b) => ({
          companyId: data.companyId,
          productId: product.id,
          barcode: b.barcode,
          barcodeType: b.barcodeType,
          isPrimary: false,
        }))
      );
    }

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
    // 1. Search in products table first (primary barcode)
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.barcode, barcode), eq(products.companyId, companyId), isNull(products.deletedAt)))
      .limit(1);
    
    if (product) return product;

    // 2. If not found, search in product_barcodes (secondary barcodes)
    const [secBarcode] = await db
      .select({ productId: productBarcodes.productId })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.barcode, barcode), eq(productBarcodes.companyId, companyId)))
      .limit(1);

    if (secBarcode) {
      const [prod] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, secBarcode.productId), eq(products.companyId, companyId), isNull(products.deletedAt)))
        .limit(1);
      return prod || null;
    }

    return null;
  }

  static async list(companyId: string, page = 1, perPage = 20, search?: string, categoryId?: string, hasBarcode?: boolean) {
    const offset = (page - 1) * perPage;

    let searchFilter = and(eq(products.companyId, companyId), isNull(products.deletedAt));

    if (hasBarcode !== undefined) {
      if (hasBarcode) {
        searchFilter = and(searchFilter, isNotNull(products.barcode));
      } else {
        searchFilter = and(searchFilter, isNull(products.barcode));
      }
    }

    if (search) {
      // Find matching secondary barcodes to include their products
      const matchedBarcodes = await db
        .select({ productId: productBarcodes.productId })
        .from(productBarcodes)
        .where(and(eq(productBarcodes.companyId, companyId), ilike(productBarcodes.barcode, `%${search}%`)));

      const barcodeProductIds = matchedBarcodes.map(b => b.productId);

      const orConditions = [
        ilike(products.name, `%${search}%`),
        ilike(products.sku, `%${search}%`),
        ilike(products.barcode, `%${search}%`)
      ];

      if (barcodeProductIds.length > 0) {
        orConditions.push(inArray(products.id, barcodeProductIds));
      }

      searchFilter = and(
        searchFilter,
        or(...orConditions)
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

  static async getBarcodesByProductId(productId: string, companyId: string) {
    return await db
      .select()
      .from(productBarcodes)
      .where(and(eq(productBarcodes.productId, productId), eq(productBarcodes.companyId, companyId)))
      .orderBy(desc(productBarcodes.createdAt));
  }

  static async addBarcode(productId: string, companyId: string, barcode: string, barcodeType: string, isPrimary = false) {
    // Check duplicate in products
    const [existingProduct] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.barcode, barcode), eq(products.companyId, companyId), isNull(products.deletedAt)))
      .limit(1);

    // Check duplicate in productBarcodes
    const [existingSecBarcode] = await db
      .select({ id: productBarcodes.id })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.barcode, barcode), eq(productBarcodes.companyId, companyId)))
      .limit(1);

    if (existingProduct || existingSecBarcode) {
      throw new Error('El código de barras ya existe en el sistema.');
    }

    const [newBarcode] = await db
      .insert(productBarcodes)
      .values({
        productId,
        companyId,
        barcode,
        barcodeType,
        isPrimary
      })
      .returning();
    
    return newBarcode;
  }

  static async removeBarcode(barcodeId: string, companyId: string) {
    const [deleted] = await db
      .delete(productBarcodes)
      .where(and(eq(productBarcodes.id, barcodeId), eq(productBarcodes.companyId, companyId)))
      .returning();
    return deleted || null;
  }

  static async logBarcodePrint(productId: string, companyId: string, userId: string, quantity: number) {
    const [log] = await db
      .insert(barcodePrintLogs)
      .values({
        productId,
        companyId,
        userId,
        quantity
      })
      .returning();
    return log;
  }

  static async getBarcodePrintLogs(companyId: string, page = 1, perPage = 20) {
    const offset = (page - 1) * perPage;
    return await db
      .select({
        id: barcodePrintLogs.id,
        productId: barcodePrintLogs.productId,
        productName: products.name,
        quantity: barcodePrintLogs.quantity,
        createdAt: barcodePrintLogs.createdAt,
      })
      .from(barcodePrintLogs)
      .innerJoin(products, eq(barcodePrintLogs.productId, products.id))
      .where(eq(barcodePrintLogs.companyId, companyId))
      .orderBy(desc(barcodePrintLogs.createdAt))
      .limit(perPage)
      .offset(offset);
  }

  static async getNextBarcode(companyId: string) {
    const [settings] = await db
      .select({
        prefix: companySettings.barcodePrefix,
        length: companySettings.barcodeLength,
      })
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId))
      .limit(1);

    const prefix = settings?.prefix || 'COD';
    const length = settings?.length || 9;

    const allBarcodes = await db
      .select({ barcode: products.barcode })
      .from(products)
      .where(and(eq(products.companyId, companyId), ilike(products.barcode, `${prefix}-%`), isNull(products.deletedAt)));

    const secBarcodes = await db
      .select({ barcode: productBarcodes.barcode })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.companyId, companyId), ilike(productBarcodes.barcode, `${prefix}-%`)));

    const barcodes = [...allBarcodes.map(b => b.barcode), ...secBarcodes.map(b => b.barcode)];

    let maxNum = 0;
    const regex = new RegExp(`^${prefix}-(\\d+)$`);
    for (const code of barcodes) {
      if (code) {
        const match = code.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    }

    const nextNum = maxNum + 1;
    const nextBarcode = `${prefix}-${String(nextNum).padStart(length, '0')}`;
    return nextBarcode;
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
