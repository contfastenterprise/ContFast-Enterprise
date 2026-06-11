import { NextRequest, NextResponse } from 'next/server';
import { db, inventoryLevels, inventoryMovements } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { warehouseId, productId, newQuantity, reason } = await req.json();

    if (!warehouseId || !productId || newQuantity === undefined) {
      return NextResponse.json({ success: false, error: { message: 'Faltan parámetros requeridos.' } }, { status: 400 });
    }

    const newQtyNum = parseFloat(newQuantity);
    if (isNaN(newQtyNum) || newQtyNum < 0) {
      return NextResponse.json({ success: false, error: { message: 'Cantidad inválida.' } }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // 1. Obtener balance actual
      const levelResult = await tx.select()
        .from(inventoryLevels)
        .where(and(
          eq(inventoryLevels.productId, productId),
          eq(inventoryLevels.warehouseId, warehouseId)
        ));

      let currentBalance = 0;
      let levelExists = false;

      if (levelResult.length > 0) {
        currentBalance = parseFloat(levelResult[0].quantity);
        levelExists = true;
      }

      const difference = newQtyNum - currentBalance;

      // Si no hay diferencia, no registrar nada
      if (difference === 0) {
        return { message: 'No hay cambios en el inventario.' };
      }

      // 2. Actualizar o insertar nivel de inventario
      if (levelExists) {
        await tx.update(inventoryLevels)
          .set({ quantity: newQtyNum.toString(), updatedAt: new Date() })
          .where(and(
            eq(inventoryLevels.productId, productId),
            eq(inventoryLevels.warehouseId, warehouseId)
          ));
      } else {
        await tx.insert(inventoryLevels).values({
          id: uuidv4(),
          companyId: session.companyId,
          productId: productId,
          warehouseId: warehouseId,
          quantity: newQtyNum.toString()
        });
      }

      // 3. Registrar movimiento de ajuste
      const moveId = uuidv4();
      await tx.insert(inventoryMovements).values({
        id: moveId,
        companyId: session.companyId,
        productId: productId,
        warehouseId: warehouseId,
        userId: session.userId,
        type: 'adjustment',
        quantity: difference.toString(), // Positivo o negativo
        balanceAfter: newQtyNum.toString(),
        description: `Ajuste manual: ${reason || 'Sin especificar'}`
      });

      return { moveId, currentBalance, newQuantity: newQtyNum, difference };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Error in inventory adjustment:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
