import { db } from '@/db';
import { 
  inventoryLevels, 
  inventoryMovements, 
  inventoryTransfers, 
  inventoryTransferLines, 
  products, 
  warehouses,
  invoices,
  invoiceLines,
  deliveryNotes,
  deliveryNoteLines
} from '@/db/schema';
import { eq, and, sql, inArray, not, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function getProvisionalStock(productId: string, warehouseId: string, tx: any = db, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'): Promise<number> {
  // 1. Get physical stock
  const [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.productId, productId), 
      eq(inventoryLevels.warehouseId, warehouseId),
      eq(inventoryLevels.modo, modo)
    )
  );
  const physicalStock = level ? Number(level.quantity) : 0;

  // 2. Find all active invoices in this warehouse that are not fully delivered
  const activeInvoices = await tx
    .select({
      id: invoices.id,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.warehouseId, warehouseId),
        eq(invoices.modo, modo),
        inArray(invoices.status, ['signed', 'submitted', 'accepted']),
        inArray(invoices.ecfType, ['31', '32', '45']),
        not(eq(invoices.deliveryStatus, 'delivered')),
        isNull(invoices.deletedAt)
      )
    );

  if (activeInvoices.length === 0) {
    return physicalStock;
  }

  const invoiceIds = activeInvoices.map((inv: any) => inv.id);

  // 3. Sum invoiced quantities for this product on these invoices
  const lines = await tx
    .select({
      quantity: invoiceLines.quantity,
    })
    .from(invoiceLines)
    .where(
      and(
        inArray(invoiceLines.invoiceId, invoiceIds),
        eq(invoiceLines.productId, productId)
      )
    );
  const totalInvoiced = lines.reduce((acc: number, line: any) => acc + Number(line.quantity), 0);

  // 4. Find all approved delivery notes associated with these invoices
  const approvedNotes = await tx
    .select({
      id: deliveryNotes.id,
    })
    .from(deliveryNotes)
    .where(
      and(
        inArray(deliveryNotes.invoiceId, invoiceIds),
        eq(deliveryNotes.status, 'approved'),
        isNull(deliveryNotes.deletedAt)
      )
    );

  let totalDelivered = 0;
  if (approvedNotes.length > 0) {
    const noteIds = approvedNotes.map((note: any) => note.id);
    const delLines = await tx
      .select({
        quantity: deliveryNoteLines.quantity,
      })
      .from(deliveryNoteLines)
      .where(
        and(
          inArray(deliveryNoteLines.deliveryNoteId, noteIds),
          eq(deliveryNoteLines.productId, productId)
        )
      );
    totalDelivered = delLines.reduce((acc: number, line: any) => acc + Number(line.quantity), 0);
  }

  const reservedQty = Math.max(0, totalInvoiced - totalDelivered);
  return Math.max(0, physicalStock - reservedQty);
}

export async function checkStock(
  productId: string,
  warehouseId: string,
  quantityNeeded: number,
  tx: any = db,
  useProvisional = false,
  modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
): Promise<boolean> {
  if (useProvisional) {
    const provStock = await getProvisionalStock(productId, warehouseId, tx, modo);
    return provStock >= quantityNeeded;
  }

  const [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.productId, productId), 
      eq(inventoryLevels.warehouseId, warehouseId),
      eq(inventoryLevels.modo, modo)
    )
  );

  if (!level) return false;
  return Number(level.quantity) >= quantityNeeded;
}

export async function addStock(
  companyId: string,
  productId: string,
  warehouseId: string,
  quantity: number,
  userId: string,
  type: string,
  referenceId?: string,
  description?: string,
  tx: any = db,
  modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
) {
  // Ensure level exists
  let [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.productId, productId), 
      eq(inventoryLevels.warehouseId, warehouseId),
      eq(inventoryLevels.modo, modo)
    )
  );

  if (!level) {
    const newLevel = await tx.insert(inventoryLevels).values({
      id: uuidv4(),
      companyId,
      productId,
      warehouseId,
      modo,
      quantity: '0.0000',
    }).returning();
    level = newLevel[0];
  }

  const newQuantity = Number(level.quantity) + quantity;

  // Update level
  await tx.update(inventoryLevels)
    .set({ quantity: newQuantity.toString(), updatedAt: new Date() })
    .where(eq(inventoryLevels.id, level.id));

  // Record movement
  await tx.insert(inventoryMovements).values({
    id: uuidv4(),
    companyId,
    productId,
    warehouseId,
    userId,
    type,
    modo,
    quantity: quantity.toString(),
    balanceAfter: newQuantity.toString(),
    referenceId,
    description,
  });
}

export async function deductStock(
  companyId: string,
  productId: string,
  warehouseId: string,
  quantity: number,
  userId: string,
  type: string,
  referenceId?: string,
  description?: string,
  tx: any = db,
  modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
) {
  await addStock(companyId, productId, warehouseId, -quantity, userId, type, referenceId, description, tx, modo);
}

export async function transferStock(
  companyId: string,
  sourceWarehouseId: string,
  destinationWarehouseId: string,
  items: { productId: string, quantity: number }[],
  userId: string,
  reason?: string,
  modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
) {
  return await db.transaction(async (tx) => {
    const transferId = uuidv4();

    // Create transfer record
    await tx.insert(inventoryTransfers).values({
      id: transferId,
      companyId,
      sourceWarehouseId,
      destinationWarehouseId,
      userId,
      status: 'completed',
      reason,
      modo,
    });

    for (const item of items) {
      // 1. Check stock
      const [sourceLevel] = await tx.select().from(inventoryLevels).where(
        and(
          eq(inventoryLevels.productId, item.productId), 
          eq(inventoryLevels.warehouseId, sourceWarehouseId),
          eq(inventoryLevels.modo, modo)
        )
      );

      if (!sourceLevel || Number(sourceLevel.quantity) < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.productId} in source warehouse`);
      }

      // 2. Insert transfer line
      await tx.insert(inventoryTransferLines).values({
        id: uuidv4(),
        transferId,
        productId: item.productId,
        quantity: item.quantity.toString(),
      });

      // 3. Deduct from source
      const newSourceQuantity = Number(sourceLevel.quantity) - item.quantity;
      await tx.update(inventoryLevels)
        .set({ quantity: newSourceQuantity.toString(), updatedAt: new Date() })
        .where(eq(inventoryLevels.id, sourceLevel.id));

      await tx.insert(inventoryMovements).values({
        id: uuidv4(),
        companyId,
        productId: item.productId,
        warehouseId: sourceWarehouseId,
        userId,
        type: 'transfer_out',
        modo,
        quantity: (-item.quantity).toString(),
        balanceAfter: newSourceQuantity.toString(),
        referenceId: transferId,
        description: `Transfer to ${destinationWarehouseId}`,
      });

      // 4. Add to destination
      let [destLevel] = await tx.select().from(inventoryLevels).where(
        and(
          eq(inventoryLevels.productId, item.productId), 
          eq(inventoryLevels.warehouseId, destinationWarehouseId),
          eq(inventoryLevels.modo, modo)
        )
      );

      if (!destLevel) {
        const newLevel = await tx.insert(inventoryLevels).values({
          id: uuidv4(),
          companyId,
          productId: item.productId,
          warehouseId: destinationWarehouseId,
          modo,
          quantity: '0.0000',
        }).returning();
        destLevel = newLevel[0];
      }

      const newDestQuantity = Number(destLevel.quantity) + item.quantity;
      await tx.update(inventoryLevels)
        .set({ quantity: newDestQuantity.toString(), updatedAt: new Date() })
        .where(eq(inventoryLevels.id, destLevel.id));

      await tx.insert(inventoryMovements).values({
        id: uuidv4(),
        companyId,
        productId: item.productId,
        warehouseId: destinationWarehouseId,
        userId,
        type: 'transfer_in',
        modo,
        quantity: item.quantity.toString(),
        balanceAfter: newDestQuantity.toString(),
        referenceId: transferId,
        description: `Transfer from ${sourceWarehouseId}`,
      });
    }

    return transferId;
  });
}
