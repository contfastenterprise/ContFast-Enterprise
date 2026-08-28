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

/**
 * ¿Este producto lleva control de existencia?
 *
 * Un servicio -instalacion, transporte, mano de obra- o una mercancia que se
 * vende por encargo no esta en ningun almacen. Antes no habia forma de decirlo:
 * toda linea de factura descontaba, y "Servicios Instalacion" acumulo -116
 * unidades, una por cada instalacion vendida.
 *
 * La comprobacion vive AQUI, en el servicio, y no en cada ruta que despacha. Es
 * deliberado: `checkStock` y `addStock` son el paso obligado de todo el
 * movimiento de inventario de la aplicacion, asi que una ruta nueva que use el
 * servicio hereda el comportamiento correcto sin acordarse de nada.
 *
 * Filtra por empresa porque `productId` llega del cuerpo de la peticion.
 */
export async function llevaInventario(
  companyId: string,
  productId: string,
  tx: any = db
): Promise<boolean> {
  const [producto] = await tx
    .select({ tracksInventory: products.tracksInventory })
    .from(products)
    // Sin .limit(): products.id es la clave primaria, asi que devuelve una fila
    // o ninguna.
    .where(and(eq(products.id, productId), eq(products.companyId, companyId)));

  // Si el producto no existe o no es de esta empresa, no se toca su inventario.
  // Quien tenga que dar el error 404 es la ruta, no este servicio.
  if (!producto) return false;
  return producto.tracksInventory;
}

export async function getProvisionalStock(companyId: string, productId: string, warehouseId: string, tx: any = db, modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'): Promise<number> {
  // 1. Get physical stock
  const [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.companyId, companyId),
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
        eq(invoices.companyId, companyId),
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
  companyId: string,
  productId: string,
  warehouseId: string,
  quantityNeeded: number,
  tx: any = db,
  useProvisional = false,
  modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
): Promise<boolean> {
  // Un servicio no tiene existencia que comprobar: nunca puede bloquear un
  // despacho por falta de stock.
  if (!(await llevaInventario(companyId, productId, tx))) return true;

  const [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.companyId, companyId),
      eq(inventoryLevels.productId, productId), 
      eq(inventoryLevels.warehouseId, warehouseId),
      eq(inventoryLevels.modo, modo)
    )
  );

  const minStock = level ? Number(level.minStock || 0) : 0;

  // Auditoria F1-04. Esta funcion tenia DOS defectos:
  //
  //  1. Con minStock = 0 -que es el valor por defecto- devolvia true sin
  //     comparar nunca `quantityNeeded` contra la existencia. Se podia facturar
  //     y despachar 100 unidades de un producto con 3, dejando el nivel en -97
  //     y el kardex con balance_after negativo.
  //
  //  2. Con minStock > 0 comparaba `currentStock <= minStock`, ignorando
  //     igualmente la cantidad pedida. Con 20 en almacen y un minimo de 10 se
  //     podian sacar 15 unidades: la condicion miraba el stock ANTES de la
  //     operacion, no despues, y el nivel terminaba en 5, por debajo del minimo.
  //
  // La regla correcta es sobre la existencia RESULTANTE.
  const currentStock = useProvisional
    ? await getProvisionalStock(companyId, productId, warehouseId, tx, modo)
    : (level ? Number(level.quantity || 0) : 0);

  // Las cantidades son decimal(15,4): se compara con una tolerancia minima para
  // que restar una cantidad exacta no falle por ruido de coma flotante
  // (p. ej. 3 - 3 puede dar -4.44e-16).
  const restante = currentStock - quantityNeeded;
  return restante >= minStock - 1e-6;
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
  // Un producto sin control de existencia no mueve inventario ni deja rastro en
  // el kardex. Aqui se cortan las dos direcciones de golpe: `deductStock` es
  // esta misma funcion con la cantidad en negativo.
  if (!(await llevaInventario(companyId, productId, tx))) return;

  // Ensure level exists
  // El companyId es imprescindible: productId y warehouseId llegan del cuerpo
  // de la peticion y ninguna capa comprueba que sean de esta empresa, asi que
  // sin el se movian las existencias de otra.
  let [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.companyId, companyId),
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
      // Un producto sin control de existencia no se puede transferir: no esta
      // en ningun almacen. Sin esta comprobacion el error habria sido
      // "Insufficient stock", que manda a buscar el problema donde no esta.
      if (!(await llevaInventario(companyId, item.productId, tx))) {
        throw new Error(
          `El producto ${item.productId} no lleva control de existencia (servicio o venta ` +
          'por encargo), asi que no se puede transferir entre almacenes.'
        );
      }

      // 1. Check stock
      const [sourceLevel] = await tx.select().from(inventoryLevels).where(
        and(
          eq(inventoryLevels.companyId, companyId),
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
          eq(inventoryLevels.companyId, companyId),
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
