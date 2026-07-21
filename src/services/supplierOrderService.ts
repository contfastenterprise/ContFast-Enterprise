import { db, supplierOrders, supplierOrderLines, supplierOrderSequences, suppliers, users, products } from '@/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface SupplierOrderLineInput {
  productId?: string | null;
  modelo?: string | null;
  medida?: string | null;
  colorAcabado?: string | null;
  linea?: string | null;
  numHuecosCerradura?: string | null;
  cantidad: number;
  observaciones?: string | null;
}

export interface CreateSupplierOrderInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  supplierId: string;
  userId: string;
  observations?: string;
  generalConditions?: string;
  lines: SupplierOrderLineInput[];
}

export class SupplierOrderService {
  /**
   * Generates a sequence number for a supplier order (e.g. LD-2026-0001)
   */
  static async generateSequence(companyId: string, modo: 'PRODUCCION' | 'PRUEBA', companyName: string): Promise<string> {
    const currentYear = new Date().getFullYear();

    // Derive prefix from company name (e.g., Latin Doors -> LD)
    let prefix = 'PED';
    if (companyName) {
      const cleanName = companyName.replace(/s\.r\.l\.?/gi, '').replace(/srl/gi, '').trim();
      const words = cleanName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2) {
        prefix = words.map(w => w[0]).join('').toUpperCase().substring(0, 3);
      } else if (words.length === 1 && words[0].length >= 2) {
        prefix = words[0].substring(0, 3).toUpperCase();
      }
    }

    return await db.transaction(async (tx) => {
      const [seqRecord] = await tx
        .select()
        .from(supplierOrderSequences)
        .where(and(
          eq(supplierOrderSequences.companyId, companyId),
          eq(supplierOrderSequences.currentYear, currentYear),
          eq(supplierOrderSequences.modo, modo)
        ))
        .limit(1)
        .for('update');

      let nextSeqNumber = 1;

      if (seqRecord) {
        nextSeqNumber = seqRecord.currentSequence + 1;
        await tx
          .update(supplierOrderSequences)
          .set({ currentSequence: nextSeqNumber, updatedAt: new Date() })
          .where(eq(supplierOrderSequences.id, seqRecord.id));
      } else {
        await tx.insert(supplierOrderSequences).values({
          id: uuidv4(),
          companyId,
          modo,
          currentYear,
          currentSequence: nextSeqNumber,
        });
      }

      const paddedSeq = String(nextSeqNumber).padStart(4, '0');
      return `${prefix}-${currentYear}-${paddedSeq}`;
    });
  }

  /**
   * Creates a new supplier order
   */
  static async createOrder(input: CreateSupplierOrderInput, companyName: string) {
    return await db.transaction(async (tx) => {
      const orderNumber = await this.generateSequence(input.companyId, input.modo, companyName);
      const orderId = uuidv4();

      await tx.insert(supplierOrders).values({
        id: orderId,
        companyId: input.companyId,
        modo: input.modo,
        supplierId: input.supplierId,
        userId: input.userId,
        orderNumber,
        status: 'pending',
        orderDate: new Date(),
        observations: input.observations || '',
        generalConditions: input.generalConditions || '',
      });

      if (input.lines && input.lines.length > 0) {
        const lineInserts = input.lines.map(line => ({
          id: uuidv4(),
          orderId,
          productId: line.productId || null,
          modelo: line.modelo || '',
          medida: line.medida || '',
          colorAcabado: line.colorAcabado || '',
          linea: line.linea || '',
          numHuecosCerradura: line.numHuecosCerradura || '',
          cantidad: line.cantidad,
          observaciones: line.observaciones || '',
        }));

        await tx.insert(supplierOrderLines).values(lineInserts);
      }

      return { id: orderId, orderNumber };
    });
  }

  /**
   * Retrieves a paginated list of supplier orders
   */
  static async getOrders(companyId: string, modo: 'PRODUCCION' | 'PRUEBA', page = 1, limit = 50, status?: string) {
    const offset = (page - 1) * limit;

    const conditions = [
      eq(supplierOrders.companyId, companyId),
      eq(supplierOrders.modo, modo),
      sql`supplier_orders.deleted_at IS NULL`
    ];

    if (status) {
      conditions.push(eq(supplierOrders.status, status));
    }

    const whereClause = and(...conditions);

    // Get items with supplier and user details
    const items = await db
      .select({
        id: supplierOrders.id,
        orderNumber: supplierOrders.orderNumber,
        status: supplierOrders.status,
        orderDate: supplierOrders.orderDate,
        observations: supplierOrders.observations,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
        userName: users.name,
        createdAt: supplierOrders.createdAt,
      })
      .from(supplierOrders)
      .innerJoin(suppliers, eq(supplierOrders.supplierId, suppliers.id))
      .innerJoin(users, eq(supplierOrders.userId, users.id))
      .where(whereClause)
      .orderBy(desc(supplierOrders.orderDate))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(supplierOrders)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves a single supplier order with details and lines
   */
  static async getOrderById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const [order] = await db
      .select({
        id: supplierOrders.id,
        companyId: supplierOrders.companyId,
        modo: supplierOrders.modo,
        supplierId: supplierOrders.supplierId,
        userId: supplierOrders.userId,
        orderNumber: supplierOrders.orderNumber,
        status: supplierOrders.status,
        orderDate: supplierOrders.orderDate,
        observations: supplierOrders.observations,
        generalConditions: supplierOrders.generalConditions,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
        supplierEmail: suppliers.email,
        supplierPhone: suppliers.phone,
        supplierAddress: suppliers.address,
        userName: users.name,
        createdAt: supplierOrders.createdAt,
      })
      .from(supplierOrders)
      .innerJoin(suppliers, eq(supplierOrders.supplierId, suppliers.id))
      .innerJoin(users, eq(supplierOrders.userId, users.id))
      .where(and(
        eq(supplierOrders.id, id),
        eq(supplierOrders.companyId, companyId),
        eq(supplierOrders.modo, modo),
        sql`supplier_orders.deleted_at IS NULL`
      ))
      .limit(1);

    if (!order) return null;

    const lines = await db
      .select({
        id: supplierOrderLines.id,
        productId: supplierOrderLines.productId,
        modelo: supplierOrderLines.modelo,
        medida: supplierOrderLines.medida,
        colorAcabado: supplierOrderLines.colorAcabado,
        linea: supplierOrderLines.linea,
        numHuecosCerradura: supplierOrderLines.numHuecosCerradura,
        cantidad: supplierOrderLines.cantidad,
        observaciones: supplierOrderLines.observaciones,
        productName: products.name,
        productSku: products.sku,
      })
      .from(supplierOrderLines)
      .leftJoin(products, eq(supplierOrderLines.productId, products.id))
      .where(eq(supplierOrderLines.orderId, id));

    return {
      ...order,
      lines,
    };
  }

  /**
   * Updates an existing supplier order
   */
  static async updateOrder(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', input: Partial<CreateSupplierOrderInput>) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(supplierOrders)
        .where(and(
          eq(supplierOrders.id, id),
          eq(supplierOrders.companyId, companyId),
          eq(supplierOrders.modo, modo)
        ))
        .limit(1);

      if (!existing) {
        throw new Error('Pedido no encontrado');
      }

      await tx
        .update(supplierOrders)
        .set({
          supplierId: input.supplierId || existing.supplierId,
          observations: input.observations !== undefined ? input.observations : existing.observations,
          generalConditions: input.generalConditions !== undefined ? input.generalConditions : existing.generalConditions,
          status: input.lines ? existing.status : (input as any).status || existing.status,
          updatedAt: new Date(),
        })
        .where(eq(supplierOrders.id, id));

      if (input.lines) {
        // Simple strategy: delete existing lines and insert new ones
        await tx.delete(supplierOrderLines).where(eq(supplierOrderLines.orderId, id));

        if (input.lines.length > 0) {
          const lineInserts = input.lines.map(line => ({
            id: uuidv4(),
            orderId: id,
            productId: line.productId || null,
            modelo: line.modelo || '',
            medida: line.medida || '',
            colorAcabado: line.colorAcabado || '',
            linea: line.linea || '',
            numHuecosCerradura: line.numHuecosCerradura || '',
            cantidad: line.cantidad,
            observaciones: line.observaciones || '',
          }));

          await tx.insert(supplierOrderLines).values(lineInserts);
        }
      }

      return { id };
    });
  }

  /**
   * Soft deletes a supplier order
   */
  static async deleteOrder(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    return await db
      .update(supplierOrders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(supplierOrders.id, id),
        eq(supplierOrders.companyId, companyId),
        eq(supplierOrders.modo, modo)
      ));
  }
}
