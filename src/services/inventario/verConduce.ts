/**
 * Todo lo que hace falta para VER un conduce (lote 223).
 *
 * Pedido del dueño: desde la lista de conduces, un icono que enseñe la factura,
 * la hora de emision, el cliente, el numero de conduce y, por cada mercancia,
 * SKU, nombre, cantidad facturada y cuanto falta si no hay bastante.
 *
 * `DeliveryRepository.getById` no sirve para esto: devuelve los renglones
 * pelados (solo `productId` y cantidad), sin producto, factura ni cliente, y la
 * usan tambien la impresion y la anulacion, que no necesitan mas. Aqui se arma
 * la vista entera en TRES consultas, y el faltante lo decide
 * `renglonesParaVer` -- la regla del aviso del lote 221 y de la aprobacion.
 *
 * La existencia es la del almacen DE SU FACTURA y de su modo: es la que mira
 * la aprobacion. Mirar otro almacen diria "hay" de algo que no se puede
 * despachar desde aqui.
 */
import { db, deliveryNotes, deliveryNoteLines, invoices, invoiceLines, customers, warehouses, products, inventoryLevels } from '@/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { renglonesParaVer, type RenglonParaVer } from './faltanteDelConduce';

export interface ConduceParaVer {
  id: string;
  numero: string;
  estado: string;
  fechaEntrega: string | null;
  factura: { id: string; ncf: string | null; emitida: string | null } | null;
  cliente: { nombre: string; rnc: string | null } | null;
  almacen: string | null;
  renglones: RenglonParaVer[];
}

export async function verConduce(id: string, companyId: string, modo: ModoOperativo): Promise<ConduceParaVer | null> {
  const [cabecera] = await db
    .select({
      id: deliveryNotes.id,
      numero: deliveryNotes.deliveryNumber,
      estado: deliveryNotes.status,
      fechaEntrega: deliveryNotes.deliveryDate,
      facturaId: invoices.id,
      ncf: invoices.ncf,
      emitida: invoices.createdAt,
      warehouseId: invoices.warehouseId,
      cliente: customers.name,
      rnc: customers.rncCedula,
      almacen: warehouses.name,
    })
    .from(deliveryNotes)
    .leftJoin(invoices, and(eq(invoices.id, deliveryNotes.invoiceId), eq(invoices.companyId, deliveryNotes.companyId)))
    .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.companyId, deliveryNotes.companyId)))
    .leftJoin(warehouses, eq(warehouses.id, invoices.warehouseId))
    .where(and(
      eq(deliveryNotes.id, id),
      eq(deliveryNotes.companyId, companyId),
      eq(deliveryNotes.modo, modo),
      isNull(deliveryNotes.deletedAt),
    ))
    .limit(1);

  if (!cabecera) return null;

  const [lineas, facturadas] = await Promise.all([
    db.select({
      productId: deliveryNoteLines.productId,
      nombre: products.name,
      sku: products.sku,
      llevaInventario: products.tracksInventory,
      pedido: deliveryNoteLines.quantity,
      existencia: inventoryLevels.quantity,
      minimo: inventoryLevels.minStock,
    })
      .from(deliveryNoteLines)
      .innerJoin(products, and(eq(products.id, deliveryNoteLines.productId), eq(products.companyId, companyId)))
      .leftJoin(inventoryLevels, and(
        eq(inventoryLevels.productId, deliveryNoteLines.productId),
        cabecera.warehouseId ? eq(inventoryLevels.warehouseId, cabecera.warehouseId) : sql`false`,
        eq(inventoryLevels.companyId, companyId),
        eq(inventoryLevels.modo, modo),
      ))
      .where(eq(deliveryNoteLines.deliveryNoteId, id)),
    cabecera.facturaId
      ? db.select({
          productId: invoiceLines.productId,
          facturada: sql<string>`sum(${invoiceLines.quantity})`,
        })
          .from(invoiceLines)
          .where(eq(invoiceLines.invoiceId, cabecera.facturaId))
          .groupBy(invoiceLines.productId)
      : Promise.resolve([] as Array<{ productId: string | null; facturada: string }>),
  ]);

  const facturadaPorProducto = new Map(facturadas.map((f) => [f.productId, f.facturada]));

  return {
    id: cabecera.id,
    numero: cabecera.numero,
    estado: cabecera.estado,
    fechaEntrega: cabecera.fechaEntrega ? String(cabecera.fechaEntrega) : null,
    factura: cabecera.facturaId
      ? { id: cabecera.facturaId, ncf: cabecera.ncf, emitida: cabecera.emitida ? cabecera.emitida.toISOString() : null }
      : null,
    cliente: cabecera.cliente ? { nombre: cabecera.cliente, rnc: cabecera.rnc } : null,
    almacen: cabecera.almacen,
    renglones: renglonesParaVer(
      lineas.map((l) => ({ ...l, facturada: facturadaPorProducto.get(l.productId) ?? 0 })),
      cabecera.estado,
    ),
  };
}
