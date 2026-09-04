import { db } from '@/db';
import { suppliers } from '@/db/schema';
import { eq, and, or, ilike, desc, sql, isNull, exists, type SQL } from 'drizzle-orm';
import { accountsPayable } from '@/db/schema';

type Modo = 'PRODUCCION' | 'PRUEBA';

/**
 * `suppliers` es catalogo y no tiene columna `modo`. El unico sitio que depende
 * del entorno es el filtro de deuda pendiente, que cruza a accounts_payable.
 */
export class SupplierRepository {
  static async findAll(companyId: string, modo: Modo, search?: string, limit: number = 50, offset: number = 0, hasDebt?: boolean) {
    let conditions: SQL[] = [
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

    if (hasDebt) {
      conditions.push(
        exists(
          db.select()
            .from(accountsPayable)
            .where(
              and(
                eq(accountsPayable.supplierId, suppliers.id),
                eq(accountsPayable.companyId, companyId),
                // Sin el entorno, un suplidor sin deuda real salia como
                // pendiente de pago por una compra de practicas.
                eq(accountsPayable.modo, modo),
                sql`${accountsPayable.balance} > 0`,
                isNull(accountsPayable.deletedAt)
              )
            )
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
    if (!rnc) return null;
    const cleanRnc = rnc.replace(/[\s-]/g, '');
    if (!cleanRnc) return null;
    const result = await db.select()
      .from(suppliers)
      .where(and(
        eq(suppliers.rnc, cleanRnc),
        eq(suppliers.companyId, companyId),
        isNull(suppliers.deletedAt)
      ))
      .limit(1);
    
    return result[0] || null;
  }

  static async create(data: {
    companyId: string;
    rnc?: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: string;
  }) {
    const cleanRnc = data.rnc ? data.rnc.replace(/[\s-]/g, '') : '';
    if (cleanRnc) {
      const existing = await this.findByRnc(cleanRnc, data.companyId);
      if (existing) {
        throw new Error('Un proveedor con este RNC ya existe en su empresa.');
      }
    }

    const [newSupplier] = await db.insert(suppliers)
      .values({
        companyId: data.companyId,
        rnc: cleanRnc || null,
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
    const cleanRnc = data.rnc !== undefined ? (data.rnc ? data.rnc.replace(/[\s-]/g, '') : '') : undefined;
    // Check if RNC is changed and if it conflicts
    if (cleanRnc) {
      const existing = await this.findByRnc(cleanRnc, companyId);
      if (existing && existing.id !== id) {
        throw new Error('El RNC ingresado ya está en uso por otro proveedor.');
      }
    }

    const [updatedSupplier] = await db.update(suppliers)
      .set({
        ...data,
        ...(data.rnc !== undefined ? { rnc: cleanRnc || null } : {}),
        updatedAt: new Date()
      })
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
