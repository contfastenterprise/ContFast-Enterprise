import { NextRequest, NextResponse } from 'next/server';
import { db, inventoryLevels, inventoryMovements, products, warehouses } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { eq, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'catalogo', 'write');

    const { warehouseId, productId, newQuantity, reason } = await req.json();

    if (!warehouseId || !productId || newQuantity === undefined) {
      return NextResponse.json({ success: false, error: { message: 'Faltan parámetros requeridos.' } }, { status: 400 });
    }

    const newQtyNum = parseFloat(newQuantity);
    if (isNaN(newQtyNum) || newQtyNum < 0) {
      return NextResponse.json({ success: false, error: { message: 'Cantidad inválida.' } }, { status: 400 });
    }

    // El almacen tiene que ser uno de los asignados al usuario, igual que en
    // /inventory/transfer. Sin esto, un usuario de bodega puede ajustar la
    // existencia de un almacen al que no tiene acceso.
    const rolNormalizado = session.role.toLowerCase();
    if (rolNormalizado !== 'administracion' && rolNormalizado !== 'sistemas') {
      if (!session.allowedWarehouses.includes(warehouseId)) {
        return NextResponse.json(
          { success: false, error: { message: 'No tienes acceso a este almacén.' } },
          { status: 403 }
        );
      }
    }

    // El producto y el almacen tienen que ser de la empresa de la sesion. Sin
    // esta comprobacion se podia crear un nivel de inventario para el producto
    // de otra empresa colgandolo del companyId propio.
    const [producto] = await db
      .select({ id: products.id, tracksInventory: products.tracksInventory })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.companyId, session.companyId), isNull(products.deletedAt)))
      .limit(1);
    if (!producto) {
      return NextResponse.json({ success: false, error: { message: 'Producto no encontrado.' } }, { status: 404 });
    }

    // Un servicio o una venta por encargo no tienen existencia que ajustar.
    // Permitirlo crearia el nivel que precisamente no deberia existir.
    if (!producto.tracksInventory) {
      return NextResponse.json(
        { success: false, error: { message: 'Este producto no lleva control de existencia (servicio o venta por encargo), así que no admite ajustes de inventario.' } },
        { status: 400 }
      );
    }

    const [almacen] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.id, warehouseId), eq(warehouses.companyId, session.companyId), isNull(warehouses.deletedAt)))
      .limit(1);
    if (!almacen) {
      return NextResponse.json({ success: false, error: { message: 'Almacén no encontrado.' } }, { status: 404 });
    }

    const result = await db.transaction(async (tx) => {
      // Auditoria F1-04: el filtro por companyId y sobre todo por modo es
      // obligatorio. El indice unico de inventory_levels es
      // (product_id, warehouse_id, modo), asi que existe una fila por modo para
      // el mismo producto y almacen. Sin el filtro, este UPDATE afectaba a las
      // dos: un ajuste hecho en PRUEBA reescribia la existencia de PRODUCCION.
      const alcance = and(
        eq(inventoryLevels.companyId, session.companyId),
        eq(inventoryLevels.modo, session.modo),
        eq(inventoryLevels.productId, productId),
        eq(inventoryLevels.warehouseId, warehouseId)
      );

      // 1. Obtener balance actual (con bloqueo: dos ajustes simultaneos sobre el
      //    mismo nivel calculaban la diferencia sobre el mismo balance leido).
      const levelResult = await tx.select().from(inventoryLevels).where(alcance).for('update');

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
          .where(alcance);
      } else {
        await tx.insert(inventoryLevels).values({
          id: uuidv4(),
          companyId: session.companyId,
          modo: session.modo,
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
        modo: session.modo,
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

    return NextResponse.json({ success: true, data: result }, { headers: resHeaders });
  } catch (err: any) {
    console.error('Error in inventory adjustment:', err);
    const status = err.status || 500;
    return NextResponse.json({ success: false, error: { message: err.message } }, { status });
  }
}
