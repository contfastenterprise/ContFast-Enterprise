import { db } from '@/db';
import { inventoryLevels, inventoryMovements, inventoryTransfers, inventoryTransferLines, products, warehouses } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function checkStock(productId: string, warehouseId: string, quantityNeeded: number, tx: any = db): Promise<boolean> {
  const [level] = await tx.select().from(inventoryLevels).where(
    and(eq(inventoryLevels.productId, productId), eq(inventoryLevels.warehouseId, warehouseId))
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
  tx: any = db
) {
  // Ensure level exists
  let [level] = await tx.select().from(inventoryLevels).where(
    and(eq(inventoryLevels.productId, productId), eq(inventoryLevels.warehouseId, warehouseId))
  );

  if (!level) {
    const newLevel = await tx.insert(inventoryLevels).values({
      id: uuidv4(),
      companyId,
      productId,
      warehouseId,
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
  tx: any = db
) {
  await addStock(companyId, productId, warehouseId, -quantity, userId, type, referenceId, description, tx);
}

export async function transferStock(
  companyId: string,
  sourceWarehouseId: string,
  destinationWarehouseId: string,
  items: { productId: string, quantity: number }[],
  userId: string,
  reason?: string
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
    });

    for (const item of items) {
      // 1. Check stock
      const [sourceLevel] = await tx.select().from(inventoryLevels).where(
        and(eq(inventoryLevels.productId, item.productId), eq(inventoryLevels.warehouseId, sourceWarehouseId))
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
        quantity: (-item.quantity).toString(),
        balanceAfter: newSourceQuantity.toString(),
        referenceId: transferId,
        description: `Transfer to ${destinationWarehouseId}`,
      });

      // 4. Add to destination
      let [destLevel] = await tx.select().from(inventoryLevels).where(
        and(eq(inventoryLevels.productId, item.productId), eq(inventoryLevels.warehouseId, destinationWarehouseId))
      );

      if (!destLevel) {
        const newLevel = await tx.insert(inventoryLevels).values({
          id: uuidv4(),
          companyId,
          productId: item.productId,
          warehouseId: destinationWarehouseId,
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
        quantity: item.quantity.toString(),
        balanceAfter: newDestQuantity.toString(),
        referenceId: transferId,
        description: `Transfer from ${sourceWarehouseId}`,
      });
    }

    return transferId;
  });
}
