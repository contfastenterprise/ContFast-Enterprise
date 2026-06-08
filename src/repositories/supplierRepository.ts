import { db } from '@/db';
import { suppliers } from '@/db/schema';
import { eq, and, or, ilike, desc, sql, isNull } from 'drizzle-orm';

export class SupplierRepository {
  static async findAll(companyId: string, search?: string, limit: number = 50, offset: number = 0) {
    let conditions: any[] = [
      eq(suppliers.companyId, companyId),
      isNull(suppliers.deletedAt)
    ];

    if (search) {
      conditions.push(
        or(
          ilike(suppliers.name, `%${search}%`),
          ilike(suppliers.rnc, `%${search}%`)
        )
      );
    }

    const whereClause = and(...conditions);

    const [data, totalCount] = await Promise.all([
      db.select()
        .from(suppliers)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(suppliers.createdAt)),
      db.select({ count: sql`count(*)` })
        .from(suppliers)
        .where(whereClause)
    ]);

    return {
      data,
      total: Number(totalCount[0]?.count || 0)
    };
  }

  static async findById(id: string, companyId: string) {
    const result = await db.select()
      .from(suppliers)
      .where(and(
        eq(suppliers.id, id),
        eq(suppliers.companyId, companyId),
        isNull(suppliers.deletedAt)
      ))
      .limit(1);
    
    return result[0] || null;
  }

  static async findByRnc(rnc: string, companyId: string) {
    const result = await db.select()
      .from(suppliers)
      .where(and(
        eq(suppliers.rnc, rnc),
        eq(suppliers.companyId, companyId),
        isNull(suppliers.deletedAt)
      ))
      .limit(1);
    
    return result[0] || null;
  }

  static async create(data: {
    companyId: string;
    rnc: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: string;
  }) {
    const existing = await this.findByRnc(data.rnc, data.companyId);
    if (existing) {
      throw new Error('Un proveedor con este RNC ya existe en su empresa.');
    }

    const [newSupplier] = await db.insert(suppliers)
      .values({
        companyId: data.companyId,
        rnc: data.rnc,
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        status: data.status || 'active',
      })
      .returning();

    return newSupplier;
  }

  static async update(id: string, companyId: string, data: Partial<typeof suppliers.$inferInsert>) {
    // Check if RNC is changed and if it conflicts
    if (data.rnc) {
      const existing = await this.findByRnc(data.rnc, companyId);
      if (existing && existing.id !== id) {
        throw new Error('El RNC ingresado ya está en uso por otro proveedor.');
      }
    }

    const [updatedSupplier] = await db.update(suppliers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(suppliers.id, id),
        eq(suppliers.companyId, companyId)
      ))
      .returning();

    return updatedSupplier;
  }

  static async softDelete(id: string, companyId: string) {
    const [deleted] = await db.update(suppliers)
      .set({ deletedAt: new Date(), status: 'inactive' })
      .where(and(
        eq(suppliers.id, id),
        eq(suppliers.companyId, companyId)
      ))
      .returning();

    return deleted;
  }
}
