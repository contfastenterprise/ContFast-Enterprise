import { db } from '@/db';
import { quotes, quoteLines, quoteSequences } from '@/db/schema/invoices';
import { products } from '@/db/schema/products';
import { eq, inArray, and, sql } from 'drizzle-orm';

export interface QuoteItemInput {
  productId: string;
  quantity: number;
}

export const StorefrontQuoteService = {
  /**
   * Crea una cotización en base a los artículos del carrito del storefront.
   */
  async createQuote(companyId: string, userId: string, items: QuoteItemInput[]) {
    // 1. Obtener precios reales de la BD para prevenir manipulación
    const productIds = items.map(i => i.productId);
    
    if (productIds.length === 0) throw new Error("El carrito está vacío");

    const dbProducts = await db
      .select({
        id: products.id,
        price: products.priceConsumidor,
        isOnSale: products.isOnSale,
        promotionalPrice: products.promotionalPrice,
      })
      .from(products)
      .where(
        and(
          eq(products.companyId, companyId),
          inArray(products.id, productIds)
        )
      );

    const productMap = new Map(dbProducts.map(p => [p.id, p]));

    // 2. Calcular totales
    let subtotal = 0;
    let totalDiscount = 0;
    const quoteLinesData: any[] = [];

    for (const item of items) {
      const dbItem = productMap.get(item.productId);
      if (!dbItem) {
        throw new Error(`Producto ${item.productId} no encontrado o inactivo`);
      }

      const basePrice = Number(dbItem.price);
      let unitPriceForLine = basePrice;
      let lineDiscount = 0;

      if (dbItem.isOnSale) {
        const promoPrice = Number(dbItem.promotionalPrice);
        // Descuento unitario es la diferencia entre el base y el promocional
        const discountAmount = Math.max(0, basePrice - promoPrice);
        lineDiscount = discountAmount * item.quantity;
      }

      const lineSubtotal = basePrice * item.quantity;
      const lineTotal = lineSubtotal - lineDiscount;

      subtotal += lineSubtotal;
      totalDiscount += lineDiscount;

      quoteLinesData.push({
        productId: item.productId,
        quantity: item.quantity.toString(),
        unitPrice: basePrice.toString(), // Siempre el precio base
        discount: lineDiscount.toString(), // El ahorro se registra como descuento
        subtotal: lineSubtotal.toString(),
        total: lineTotal.toString(), // asumiendo impuestos aplicados post-descuento en la factura final
      });
    }

    const total = subtotal - totalDiscount; // Total de la cotización neta

    // 3. Generar Secuencia y Guardar (dentro de una transacción)
    return await db.transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      
      // Obtener o crear secuencia
      const [seq] = await tx
        .select()
        .from(quoteSequences)
        .where(
          and(
            eq(quoteSequences.companyId, companyId),
            eq(quoteSequences.currentYear, currentYear),
            eq(quoteSequences.modo, 'PRODUCCION')
          )
        )
        .for('update'); // Bloquear fila para evitar condiciones de carrera

      let nextSeq = 1;
      if (seq) {
        nextSeq = seq.currentSequence + 1;
        await tx
          .update(quoteSequences)
          .set({ currentSequence: nextSeq, updatedAt: new Date() })
          .where(eq(quoteSequences.id, seq.id));
      } else {
        await tx
          .insert(quoteSequences)
          .values({
            companyId,
            modo: 'PRODUCCION',
            currentYear,
            currentSequence: 1,
          });
      }

      // Format sequence: COT-2026-000001
      const sequenceNumber = `COT-${currentYear}-${nextSeq.toString().padStart(6, '0')}`;

      // Insertar Cotización
      const [newQuote] = await tx
        .insert(quotes)
        .values({
          companyId,
          modo: 'PRODUCCION',
          userId,
          sequenceNumber,
          status: 'pending',
          subtotal: subtotal.toString(),
          discount: totalDiscount.toString(),
          totalTaxes: '0.00',
          total: total.toString(),
          notes: 'Generada automáticamente desde la tienda en línea',
        })
        .returning({ id: quotes.id, sequenceNumber: quotes.sequenceNumber });

      // Insertar Líneas
      const linesToInsert = quoteLinesData.map(line => ({
        ...line,
        quoteId: newQuote.id,
      }));

      await tx.insert(quoteLines).values(linesToInsert);

      return newQuote;
    });
  }
};
