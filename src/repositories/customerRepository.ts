import { db, customers, invoices, accountsReceivable, cashMovements } from '@/db';
import { eq, and, or, ilike, desc, sql, isNull, inArray } from 'drizzle-orm';

export interface CreateCustomerInput {
  companyId: string;
  rncCedula: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  creditLimit?: string;
  status?: string;
}

export interface UpdateCustomerInput {
  rncCedula?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  creditLimit?: string;
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
    if (!rncCedula) return null;
    const cleanRnc = rncCedula.replace(/[\s-]/g, '');
    if (!cleanRnc) return null;
    const result = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.rncCedula, cleanRnc),
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
    const cleanRnc = input.rncCedula ? input.rncCedula.replace(/[\s-]/g, '') : '';
    // Check if RNC already exists (only if a non-empty value was provided)
    if (cleanRnc) {
      const existing = await this.findByRnc(cleanRnc, input.companyId);
      if (existing) {
        throw new Error('Ya existe un cliente con este RNC/Cédula');
      }
    }

    const [customer] = await db
      .insert(customers)
      .values({
        companyId: input.companyId,
        rncCedula: cleanRnc || null,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        creditLimit: input.creditLimit || '0.00',
        status: input.status || 'active',
      })
      .returning();

    return customer;
  }

  /**
   * Update an existing customer
   */
  static async update(id: string, companyId: string, input: UpdateCustomerInput) {
    const cleanRnc = input.rncCedula !== undefined ? input.rncCedula.replace(/[\s-]/g, '') : undefined;
    if (cleanRnc) {
      const existing = await this.findByRnc(cleanRnc, companyId);
      if (existing && existing.id !== id) {
        throw new Error('El RNC/Cédula proporcionado ya está en uso por otro cliente');
      }
    }

    const [customer] = await db
      .update(customers)
      .set({
        ...input,
        ...(input.rncCedula !== undefined ? { rncCedula: cleanRnc || null } : {}),
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
  /**
   * Obtiene el historial financiero de un cliente (Métricas + Facturas + Pagos)
   */
  static async getCustomerHistory(id: string, companyId: string) {
    // 1. Obtener datos del cliente
    const customer = await this.findById(id, companyId);
    if (!customer) throw new Error('Cliente no encontrado');

    // 2. Obtener sumatorias
    const [invoiceSum] = await db
      .select({ total: sql<number>`COALESCE(SUM(${invoices.total}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.customerId, id), eq(invoices.companyId, companyId), isNull(invoices.deletedAt)));

    const [arSum] = await db
      .select({ balance: sql<number>`COALESCE(SUM(${accountsReceivable.balance}), 0)` })
      .from(accountsReceivable)
      .where(and(eq(accountsReceivable.customerId, id), eq(accountsReceivable.companyId, companyId), isNull(accountsReceivable.deletedAt)));

    const totalInvoiced = Number(invoiceSum?.total || 0);
    const currentBalance = Number(arSum?.balance || 0);
    const totalPaid = totalInvoiced - currentBalance;

    // 3. Obtener facturas recientes
    const recentInvoices = await db
      .select({
        id: invoices.id,
        ncf: invoices.ncf,
        date: invoices.createdAt,
        amount: invoices.total,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.customerId, id), eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
      .orderBy(desc(invoices.createdAt))
      .limit(10);

    // 4. Obtener pagos recientes (movimientos de caja asociados a sus facturas)
    // Primero obtener IDs de facturas del cliente
    const customerInvoiceIds = recentInvoices.map(i => i.id);
    let recentPayments: any[] = [];
    
    if (customerInvoiceIds.length > 0) {
      recentPayments = await db
        .select({
          id: cashMovements.id,
          reference: cashMovements.reference,
          date: cashMovements.createdAt,
          amount: cashMovements.amount,
          method: cashMovements.type, // Usamos type como method temporalmente
        })
        .from(cashMovements)
        .where(and(
          eq(cashMovements.companyId, companyId),
          inArray(cashMovements.invoiceId, customerInvoiceIds),
          eq(cashMovements.type, 'sale')
        ))
        .orderBy(desc(cashMovements.createdAt))
        .limit(10);
    }

    return {
      customer,
      metrics: {
        totalInvoiced,
        currentBalance,
        totalPaid
      },
      recentInvoices,
      recentPayments
    };
  }
}
