import { db, purchaseOrders, purchaseOrderItems, purchaseOrderLogs, supplierOrderSequences, suppliers, users, products, warehouses } from '@/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { addStock } from '@/services/inventoryService';

export interface PurchaseOrderItemInput {
  productId: string;
  brand?: string | null;
  model?: string | null;
  quantityRequested: number;
  observations?: string | null;
}

export interface CreatePurchaseOrderInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  supplierId: string;
  warehouseId: string;
  expectedDate?: string | null;
  observations?: string;
  lines: PurchaseOrderItemInput[];
}

export class SupplierOrderService {
  /**
   * Generates a sequence number for a purchase order (e.g. LD-2026-0001)
   */
  static async generateSequence(companyId: string, modo: 'PRODUCCION' | 'PRUEBA', companyName: string): Promise<string> {
    const currentYear = new Date().getFullYear();
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
   * Creates a new purchase order
   */
  static async createOrder(input: CreatePurchaseOrderInput, userId: string, companyName: string) {
    if (!input.supplierId) throw new Error('El suplidor es obligatorio.');
    if (!input.warehouseId) throw new Error('El almacén es obligatorio.');
    if (!input.lines || input.lines.length === 0) throw new Error('El pedido debe contener al menos un producto.');

    // Check for duplicate products
    const productIds = input.lines.map(l => l.productId);
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      throw new Error('No se permiten productos duplicados en el mismo pedido.');
    }

    // Validate quantities
    for (const line of input.lines) {
      if (line.quantityRequested <= 0) {
        throw new Error('La cantidad solicitada debe ser mayor que cero.');
      }
    }

    return await db.transaction(async (tx) => {
      const orderNumber = await this.generateSequence(input.companyId, input.modo, companyName);
      const orderId = uuidv4();

      await tx.insert(purchaseOrders).values({
        id: orderId,
        companyId: input.companyId,
        modo: input.modo,
        orderNumber,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        orderDate: new Date(),
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        status: 'Draft',
        observations: input.observations || '',
        createdBy: userId,
      });

      const itemInserts = input.lines.map(line => ({
        id: uuidv4(),
        purchaseOrderId: orderId,
        productId: line.productId,
        brand: line.brand || '',
        model: line.model || '',
        quantityRequested: line.quantityRequested,
        quantityReceived: 0,
        observations: line.observations || '',
      }));

      await tx.insert(purchaseOrderItems).values(itemInserts);

      // Log action
      await tx.insert(purchaseOrderLogs).values({
        id: uuidv4(),
        purchaseOrderId: orderId,
        userId,
        action: 'Pedido creado',
        changeDetails: `Pedido ${orderNumber} creado en estado Draft.`,
      });

      return { id: orderId, orderNumber };
    });
  }

  /**
   * Retrieves a paginated list of purchase orders
   */
  static async getOrders(companyId: string, modo: 'PRODUCCION' | 'PRUEBA', page = 1, limit = 50, status?: string) {
    const offset = (page - 1) * limit;

    const conditions = [
      eq(purchaseOrders.companyId, companyId),
      eq(purchaseOrders.modo, modo),
      sql`purchase_orders.deleted_at IS NULL`
    ];

    if (status) {
      conditions.push(eq(purchaseOrders.status, status));
    }

    const whereClause = and(...conditions);

    // Get items with details
    const items = await db
      .select({
        id: purchaseOrders.id,
        orderNumber: purchaseOrders.orderNumber,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
        expectedDate: purchaseOrders.expectedDate,
        observations: purchaseOrders.observations,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
        userName: users.name,
        createdAt: purchaseOrders.createdAt,
        totalItemsCount: sql<number>`(SELECT COALESCE(SUM(quantity_requested), 0) FROM purchase_order_items WHERE purchase_order_items.purchase_order_id = purchase_orders.id)`
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .innerJoin(users, eq(purchaseOrders.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(purchaseOrders.orderDate))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrders)
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
   * Retrieves a single purchase order with details, lines, and logs
   */
  static async getOrderById(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    const [order] = await db
      .select({
        id: purchaseOrders.id,
        companyId: purchaseOrders.companyId,
        modo: purchaseOrders.modo,
        supplierId: purchaseOrders.supplierId,
        warehouseId: purchaseOrders.warehouseId,
        createdBy: purchaseOrders.createdBy,
        orderNumber: purchaseOrders.orderNumber,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
        expectedDate: purchaseOrders.expectedDate,
        observations: purchaseOrders.observations,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
        supplierEmail: suppliers.email,
        supplierPhone: suppliers.phone,
        supplierAddress: suppliers.address,
        warehouseName: warehouses.name,
        userName: users.name,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .innerJoin(users, eq(purchaseOrders.createdBy, users.id))
      .innerJoin(warehouses, eq(purchaseOrders.warehouseId, warehouses.id))
      .where(and(
        eq(purchaseOrders.id, id),
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.modo, modo),
        sql`purchase_orders.deleted_at IS NULL`
      ))
      .limit(1);

    if (!order) return null;

    const items = await db
      .select({
        id: purchaseOrderItems.id,
        productId: purchaseOrderItems.productId,
        brand: purchaseOrderItems.brand,
        model: purchaseOrderItems.model,
        quantityRequested: purchaseOrderItems.quantityRequested,
        quantityReceived: purchaseOrderItems.quantityReceived,
        observations: purchaseOrderItems.observations,
        productName: products.name,
        productSku: products.sku,
        barcode: products.barcode,
        unitOfMeasure: products.unitOfMeasure,
      })
      .from(purchaseOrderItems)
      .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
      .where(eq(purchaseOrderItems.purchaseOrderId, id));

    const logs = await db
      .select({
        id: purchaseOrderLogs.id,
        action: purchaseOrderLogs.action,
        changeDetails: purchaseOrderLogs.changeDetails,
        createdAt: purchaseOrderLogs.createdAt,
        userName: users.name,
      })
      .from(purchaseOrderLogs)
      .innerJoin(users, eq(purchaseOrderLogs.userId, users.id))
      .where(eq(purchaseOrderLogs.purchaseOrderId, id))
      .orderBy(desc(purchaseOrderLogs.createdAt));

    return {
      ...order,
      lines: items,
      logs,
    };
  }

  /**
   * Updates an existing purchase order (Only allowed in Draft state)
   */
  static async updateOrder(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', userId: string, input: Partial<CreatePurchaseOrderInput>) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.id, id),
          eq(purchaseOrders.companyId, companyId),
          eq(purchaseOrders.modo, modo)
        ))
        .limit(1);

      if (!existing) {
        throw new Error('Pedido no encontrado.');
      }

      if (existing.status !== 'Draft') {
        throw new Error('Solo se pueden modificar pedidos en estado borrador (Draft).');
      }

      if (input.lines && input.lines.length === 0) {
        throw new Error('El pedido debe contener al menos un producto.');
      }

      // Check for duplicates
      if (input.lines) {
        const productIds = input.lines.map(l => l.productId);
        const uniqueProductIds = new Set(productIds);
        if (uniqueProductIds.size !== productIds.length) {
          throw new Error('No se permiten productos duplicados en el mismo pedido.');
        }

        for (const line of input.lines) {
          if (line.quantityRequested <= 0) {
            throw new Error('La cantidad solicitada debe ser mayor que cero.');
          }
        }
      }

      await tx
        .update(purchaseOrders)
        .set({
          supplierId: input.supplierId || existing.supplierId,
          warehouseId: input.warehouseId || existing.warehouseId,
          expectedDate: input.expectedDate !== undefined ? (input.expectedDate ? new Date(input.expectedDate) : null) : existing.expectedDate,
          observations: input.observations !== undefined ? input.observations : existing.observations,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, id));

      if (input.lines) {
        await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));

        const itemInserts = input.lines.map(line => ({
          id: uuidv4(),
          purchaseOrderId: id,
          productId: line.productId,
          brand: line.brand || '',
          model: line.model || '',
          quantityRequested: line.quantityRequested,
          quantityReceived: 0,
          observations: line.observations || '',
        }));

        await tx.insert(purchaseOrderItems).values(itemInserts);
      }

      // Log action
      await tx.insert(purchaseOrderLogs).values({
        id: uuidv4(),
        purchaseOrderId: id,
        userId,
        action: 'Pedido editado',
        changeDetails: `Pedido ${existing.orderNumber} modificado.`,
      });

      return { id };
    });
  }

  /**
   * Sends the purchase order (Changes status to Sent)
   */
  static async sendOrder(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', userId: string) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.id, id),
          eq(purchaseOrders.companyId, companyId),
          eq(purchaseOrders.modo, modo)
        ))
        .limit(1);

      if (!existing) throw new Error('Pedido no encontrado.');
      if (existing.status !== 'Draft') throw new Error('Solo se pueden enviar pedidos en estado borrador (Draft).');

      await tx
        .update(purchaseOrders)
        .set({ status: 'Sent', updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id));

      await tx.insert(purchaseOrderLogs).values({
        id: uuidv4(),
        purchaseOrderId: id,
        userId,
        action: 'Pedido enviado',
        changeDetails: 'Pedido marcado como Enviado al suplidor.',
      });
    });
  }

  /**
   * Registers a reception of goods for the order
   */
  static async registerReception(
    id: string,
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    userId: string,
    receptions: { itemId: string; quantityToReceive: number }[]
  ) {
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.id, id),
          eq(purchaseOrders.companyId, companyId),
          eq(purchaseOrders.modo, modo)
        ))
        .limit(1)
        .for('update');

      if (!order) throw new Error('Pedido no encontrado.');
      if (order.status === 'Draft' || order.status === 'Cancelled' || order.status === 'Received') {
        throw new Error('No se pueden recibir mercancías para pedidos en este estado.');
      }

      let someReceived = false;
      const logDetails: string[] = [];

      for (const rec of receptions) {
        if (rec.quantityToReceive <= 0) continue;

        const [item] = await tx
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.id, rec.itemId))
          .limit(1)
          .for('update');

        if (!item) throw new Error('Artículo del pedido no encontrado.');

        const pending = item.quantityRequested - item.quantityReceived;
        if (rec.quantityToReceive > pending) {
          throw new Error(`La cantidad a recibir (${rec.quantityToReceive}) excede la cantidad pendiente (${pending}).`);
        }

        const newReceived = item.quantityReceived + rec.quantityToReceive;
        await tx
          .update(purchaseOrderItems)
          .set({ quantityReceived: newReceived, updatedAt: new Date() })
          .where(eq(purchaseOrderItems.id, rec.itemId));

        // Update inventory level ONLY at reception
        await addStock(
          companyId,
          item.productId,
          order.warehouseId,
          rec.quantityToReceive,
          userId,
          'purchase',
          order.id,
          `Recepcion de pedido ${order.orderNumber}`,
          tx,
          modo
        );

        someReceived = true;
        logDetails.push(`Recibidos ${rec.quantityToReceive} del producto ID: ${item.productId}.`);
      }

      if (!someReceived) {
        throw new Error('Debe especificar al menos una cantidad a recibir mayor a cero.');
      }

      // Re-evaluate order status
      const allItems = await tx
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, id));

      const allCompleted = allItems.every(i => i.quantityReceived === i.quantityRequested);
      const newStatus = allCompleted ? 'Received' : 'Partial';

      await tx
        .update(purchaseOrders)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id));

      await tx.insert(purchaseOrderLogs).values({
        id: uuidv4(),
        purchaseOrderId: id,
        userId,
        action: allCompleted ? 'Recepción total' : 'Recepción parcial',
        changeDetails: logDetails.join('\n'),
      });

      return { status: newStatus };
    });
  }

  /**
   * Cancels a purchase order
   */
  static async cancelOrder(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', userId: string) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.id, id),
          eq(purchaseOrders.companyId, companyId),
          eq(purchaseOrders.modo, modo)
        ))
        .limit(1);

      if (!existing) throw new Error('Pedido no encontrado.');
      if (existing.status === 'Received' || existing.status === 'Cancelled') {
        throw new Error('No se puede cancelar un pedido completado o ya cancelado.');
      }

      await tx
        .update(purchaseOrders)
        .set({ status: 'Cancelled', updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id));

      await tx.insert(purchaseOrderLogs).values({
        id: uuidv4(),
        purchaseOrderId: id,
        userId,
        action: 'Pedido cancelado',
        changeDetails: 'Pedido cancelado.',
      });
    });
  }

  /**
   * Duplicates a purchase order to Draft status
   */
  static async duplicateOrder(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA', userId: string, companyName: string) {
    return await db.transaction(async (tx) => {
      const orderData = await this.getOrderById(id, companyId, modo);
      if (!orderData) throw new Error('Pedido original no encontrado.');

      const orderNumber = await this.generateSequence(companyId, modo, companyName);
      const newOrderId = uuidv4();

      await tx.insert(purchaseOrders).values({
        id: newOrderId,
        companyId,
        modo,
        orderNumber,
        supplierId: orderData.supplierId,
        warehouseId: orderData.warehouseId,
        orderDate: new Date(),
        status: 'Draft',
        observations: orderData.observations || '',
        createdBy: userId,
      });

      const itemInserts = orderData.lines.map(line => ({
        id: uuidv4(),
        purchaseOrderId: newOrderId,
        productId: line.productId!,
        brand: line.brand || '',
        model: line.model || '',
        quantityRequested: line.quantityRequested,
        quantityReceived: 0,
        observations: line.observations || '',
      }));

      await tx.insert(purchaseOrderItems).values(itemInserts);

      await tx.insert(purchaseOrderLogs).values({
        id: uuidv4(),
        purchaseOrderId: newOrderId,
        userId,
        action: 'Pedido duplicado',
        changeDetails: `Pedido duplicado del pedido original ${orderData.orderNumber}.`,
      });

      return { id: newOrderId, orderNumber };
    });
  }

  /**
   * Soft deletes a purchase order
   */
  static async deleteOrder(id: string, companyId: string, modo: 'PRODUCCION' | 'PRUEBA') {
    return await db
      .update(purchaseOrders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(purchaseOrders.id, id),
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.modo, modo)
      ));
  }
}
