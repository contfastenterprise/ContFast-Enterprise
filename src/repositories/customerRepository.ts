import { db, customers } from '@/db';
import { eq, and, or, ilike, desc, sql, isNull } from 'drizzle-orm';

export interface CreateCustomerInput {
  companyId: string;
  rncCedula: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: string;
}

export interface UpdateCustomerInput {
  rncCedula?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: string;
}

export class CustomerRepository {
  /**
   * Find a customer by ID and companyId
   */
  static async findById(id: string, companyId: string) {
    const result = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.companyId, companyId),
          isNull(customers.deletedAt)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find a customer by RNC and companyId
   */
  static async findByRnc(rncCedula: string, companyId: string) {
    const result = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.rncCedula, rncCedula),
          eq(customers.companyId, companyId),
          isNull(customers.deletedAt)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Retrieve all customers for a company, with optional search and pagination
   */
  static async findAll(companyId: string, search?: string, limit = 50, offset = 0) {
    const filters = [
      eq(customers.companyId, companyId),
      isNull(customers.deletedAt)
    ];

    if (search) {
      filters.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.rncCedula, `%${search}%`)
        )!
      );
    }

    const data = await db
      .select()
      .from(customers)
      .where(and(...filters))
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(...filters));

    return {
      data,
      total: Number(countResult[0]?.count || 0)
    };
  }

  /**
   * Create a new customer
   */
  static async create(input: CreateCustomerInput) {
    // Check if RNC already exists
    const existing = await this.findByRnc(input.rncCedula, input.companyId);
    if (existing) {
      throw new Error('Ya existe un cliente con este RNC/Cédula');
    }

    const [customer] = await db
      .insert(customers)
      .values({
        companyId: input.companyId,
        rncCedula: input.rncCedula,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        status: input.status || 'active',
      })
      .returning();

    return customer;
  }

  /**
   * Update an existing customer
   */
  static async update(id: string, companyId: string, input: UpdateCustomerInput) {
    if (input.rncCedula) {
      const existing = await this.findByRnc(input.rncCedula, companyId);
      if (existing && existing.id !== id) {
        throw new Error('El RNC/Cédula proporcionado ya está en uso por otro cliente');
      }
    }

    const [customer] = await db
      .update(customers)
      .set({
        ...input,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.companyId, companyId),
          isNull(customers.deletedAt)
        )
      )
      .returning();

    return customer || null;
  }

  /**
   * Soft delete a customer
   */
  static async softDelete(id: string, companyId: string) {
    const [customer] = await db
      .update(customers)
      .set({
        status: 'inactive',
        deletedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.companyId, companyId)
        )
      )
      .returning();

    return !!customer;
  }
}
