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
/**
 * OJO: aqui hay DOS respuestas negativas que no significan lo mismo, y
 * confundirlas costo caro.
 *
 * La primera version devolvia `false` tanto para "este producto no lleva
 * control de existencia" como para "este producto no existe o no es de esta
 * empresa". Las dos acababan en el mismo sitio: `addStock` retornaba en
 * silencio y `checkStock` respondia `true`. Es decir, pedir existencia de un
 * producto de OTRA empresa contestaba "si, tienes de sobra", y moverlo no
 * hacia nada sin avisar a nadie. Un banco antiguo (verificar_grupo_b) lo
 * detecto: su aserto decia justamente que ese intento tenia que "fallar en voz
 * alta" y habia pasado a fallar callando.
 *
 * Ahora se separan. No pertenecer a la empresa no es un caso de negocio: es un
 * error, y se lanza.
 */
export async function llevaInventario(
  companyId: string,
  productId: string,
  tx: typeof db = db
): Promise<boolean> {
  const [producto] = await tx
    .select({ tracksInventory: products.tracksInventory })
    .from(products)
    // Sin .limit(): products.id es la clave primaria, asi que devuelve una fila
    // o ninguna.
    .where(and(eq(products.id, productId), eq(products.companyId, companyId)));

  if (!producto) {
    throw new Error('Producto no encontrado en esta empresa.');
  }
  return producto.tracksInventory;
}

/**
 * `modo` va SEGUNDO, justo detras de `companyId`, y es obligatorio.
 *
 * Antes iba al final con valor por defecto 'PRODUCCION'. Quien lo omitia no
 * recibia ningun aviso y movia el inventario REAL. Paso de verdad: `void` de
 * conduces lo omitia mientras `approve` si lo pasaba, asi que anular un
 * conduce de PRUEBA devolvia las unidades al almacen real -- creaba existencia
 * de la nada en produccion.
 *
 * No puede ir al final siendo obligatorio (detras de `referenceId?`,
 * `description?` y `tx`), asi que se adelanta. Es ademas la posicion que ya
 * usa el resto del codigo: findAll(companyId, modo, ...), getJournalEntries,
 * getBankAccounts.
 */
export async function getProvisionalStock(companyId: string, modo: 'PRODUCCION' | 'PRUEBA', productId: string, warehouseId: string, tx: typeof db = db): Promise<number> {
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

  const invoiceIds = activeInvoices.map((inv) => inv.id);

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
  const totalInvoiced = lines.reduce((acc: number, line) => acc + Number(line.quantity), 0);

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
    const noteIds = approvedNotes.map((note) => note.id);
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
    totalDelivered = delLines.reduce((acc: number, line) => acc + Number(line.quantity), 0);
  }

  const reservedQty = Math.max(0, totalInvoiced - totalDelivered);
  return Math.max(0, physicalStock - reservedQty);
}

export async function checkStock(
  companyId: string,
  modo: 'PRODUCCION' | 'PRUEBA',
  productId: string,
  warehouseId: string,
  quantityNeeded: number,
  tx: typeof db = db,
  useProvisional = false
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
    ? await getProvisionalStock(companyId, modo, productId, warehouseId, tx)
    : (level ? Number(level.quantity || 0) : 0);

  // Las cantidades son decimal(15,4): se compara con una tolerancia minima para
  // que restar una cantidad exacta no falle por ruido de coma flotante
  // (p. ej. 3 - 3 puede dar -4.44e-16).
  const restante = currentStock - quantityNeeded;
  return restante >= minStock - 1e-6;
}

export async function addStock(
  companyId: string,
  modo: 'PRODUCCION' | 'PRUEBA',
  productId: string,
  warehouseId: string,
  quantity: number,
  userId: string,
  type: string,
  referenceId?: string,
  description?: string,
  tx: typeof db = db
) {
  // Un producto sin control de existencia no mueve inventario ni deja rastro en
  // el kardex. Aqui se cortan las dos direcciones de golpe: `deductStock` es
  // esta misma funcion con la cantidad en negativo.
  if (!(await llevaInventario(companyId, productId, tx))) return;

  // Ensure level exists
  // El companyId es imprescindible: productId y warehouseId llegan del cuerpo
  // de la peticion y ninguna capa comprueba que sean de esta empresa, asi que
  // sin el se movian las existencias de otra.
  //
  // Auditoria INV-09: la existencia se leia, se calculaba en JavaScript y se
  // escribia el resultado, sin bloqueo. Dos despachos simultaneos del mismo
  // producto leian 50, uno restaba 20 y escribia 30, el otro restaba 15 y
  // escribia 35: se despachaban 35 unidades y el nivel quedaba en 35 en vez de
  // 15. Aparecian 20 unidades de la nada, y el `balanceAfter` que quedaba en el
  // kardex era falso en los dos movimientos, sin nada que lo detectara.
  //
  // `SELECT ... FOR UPDATE` serializa a quienes tocan la misma fila: el segundo
  // espera al primero y lee la existencia ya rebajada. El bloqueo tiene que
  // ocurrir ANTES de calcular, no despues.
  let [level] = await tx.select().from(inventoryLevels).where(
    and(
      eq(inventoryLevels.companyId, companyId),
      eq(inventoryLevels.productId, productId), 
      eq(inventoryLevels.warehouseId, warehouseId),
      eq(inventoryLevels.modo, modo)
    )
  ).for('update');

  if (!level) {
    // Dos procesos pueden llegar aqui a la vez con la existencia sin crear: el
    // FOR UPDATE no bloquea filas que todavia no existen. El indice unico
    // (product_id, warehouse_id, modo) resuelve el empate; el que pierde relee
    // la fila del ganador, ya bloqueada.
    const newLevel = await tx.insert(inventoryLevels).values({
      id: uuidv4(),
      companyId,
      productId,
      warehouseId,
      modo,
      quantity: '0.0000',
    }).onConflictDoNothing().returning();

    if (newLevel.length > 0) {
      level = newLevel[0];
    } else {
      [level] = await tx.select().from(inventoryLevels).where(
        and(
          eq(inventoryLevels.companyId, companyId),
          eq(inventoryLevels.productId, productId),
          eq(inventoryLevels.warehouseId, warehouseId),
          eq(inventoryLevels.modo, modo)
        )
      ).for('update');
    }
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
  modo: 'PRODUCCION' | 'PRUEBA',
  productId: string,
  warehouseId: string,
  quantity: number,
  userId: string,
  type: string,
  referenceId?: string,
  description?: string,
  tx: typeof db = db
) {
  await addStock(companyId, modo, productId, warehouseId, -quantity, userId, type, referenceId, description, tx);
}

export async function transferStock(
  companyId: string,
  modo: 'PRODUCCION' | 'PRUEBA',
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
      modo,
    });

    // Auditoria P1-10 (2026-09-03): esta funcion reimplementaba a mano el
    // mismo patron lectura-calculo-escritura que causo INV-09 en addStock --
    // sin `.for('update')`, dos transferencias concurrentes del mismo
    // producto/almacen podian leer la misma existencia, y la segunda
    // escritura pisaba a la primera en vez de sumarse. `addStock`/
    // `deductStock` ya llevan el candado correcto (y el alta segura de la
    // fila de existencia si todavia no existe, con `onConflictDoNothing`);
    // en vez de reimplementarlo aqui otra vez, se reutilizan.
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

      // 1. Check stock -- lectura BLOQUEADA (mismo candado que addStock, mas
      // abajo) porque hace falta decidir si hay existencia suficiente ANTES
      // de mutar nada, con un mensaje de error claro si no la hay.
      const [sourceLevel] = await tx.select().from(inventoryLevels).where(
        and(
          eq(inventoryLevels.companyId, companyId),
          eq(inventoryLevels.productId, item.productId), 
          eq(inventoryLevels.warehouseId, sourceWarehouseId),
          eq(inventoryLevels.modo, modo)
        )
      ).for('update');

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

      // 3. Deduct from source (ya bajo el candado tomado arriba) y 4. Add to
      // destination (candado propio, mas el alta segura si la fila de
      // existencia del almacen destino todavia no existe).
      await deductStock(companyId, modo, item.productId, sourceWarehouseId, item.quantity, userId, 'transfer_out', transferId, `Transfer to ${destinationWarehouseId}`, tx);
      await addStock(companyId, modo, item.productId, destinationWarehouseId, item.quantity, userId, 'transfer_in', transferId, `Transfer from ${sourceWarehouseId}`, tx);
    }

    return transferId;
  });
}
