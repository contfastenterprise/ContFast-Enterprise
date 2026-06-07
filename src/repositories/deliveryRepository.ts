import { db, deliveryNotes, deliveryNoteLines } from '@/db';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

export interface CreateDeliveryNoteInput {
  companyId: string;
  invoiceId: string;
  userId: string;
  deliveryDate: Date;
  driverName?: string;
  driverLicense?: string;
  vehiclePlate?: string;
  lines: {
    productId: string;
    quantity: number;
  }[];
}

export class DeliveryRepository {
  /**
   * Creates a delivery note and its lines in a transaction.
   */
  static async create(data: CreateDeliveryNoteInput) {
    return await db.transaction(async (tx) => {
      // 1. Insert Delivery Note header
      const [note] = await tx
        .insert(deliveryNotes)
        .values({
          companyId: data.companyId,
          invoiceId: data.invoiceId,
          userId: data.userId,
          deliveryDate: data.deliveryDate.toISOString().split('T')[0],
          driverName: data.driverName,
          driverLicense: data.driverLicense,
          vehiclePlate: data.vehiclePlate,
          status: 'active',
        })
        .returning();

      // 2. Insert Delivery Note lines
      if (data.lines.length > 0) {
        await tx.insert(deliveryNoteLines).values(
          data.lines.map((line) => ({
            deliveryNoteId: note.id,
            productId: line.productId,
            quantity: line.quantity.toString(),
          }))
        );
      }

      return note;
    });
  }

  /**
   * Fetches a delivery note by ID.
   */
  static async getById(id: string, companyId: string) {
    const [note] = await db
      .select()
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.companyId, companyId), isNull(deliveryNotes.deletedAt)))
      .limit(1);

    if (!note) return null;

    const lines = await db
      .select()
      .from(deliveryNoteLines)
      .where(eq(deliveryNoteLines.deliveryNoteId, id));

    return {
      ...note,
      lines,
    };
  }

  /**
   * Fetches delivery notes for a specific invoice.
   */
  static async getByInvoiceId(invoiceId: string, companyId: string) {
    return await db
      .select()
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.invoiceId, invoiceId), eq(deliveryNotes.companyId, companyId), isNull(deliveryNotes.deletedAt)));
  }

  /**
   * Lists delivery notes with pagination and tenancy isolation.
   */
  static async list(companyId: string, page = 1, perPage = 20) {
    const offset = (page - 1) * perPage;

    const [totalResult] = await db
      .select({ value: count() })
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.companyId, companyId), isNull(deliveryNotes.deletedAt)));

    const data = await db
      .select()
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.companyId, companyId), isNull(deliveryNotes.deletedAt)))
      .orderBy(desc(deliveryNotes.createdAt))
      .limit(perPage)
      .offset(offset);

    const total = totalResult?.value || 0;

    return {
      data,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    };
  }

  /**
   * Soft deletes a delivery note.
   */
  static async softDelete(id: string, companyId: string) {
    const [updated] = await db
      .update(deliveryNotes)
      .set({
        status: 'voided',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.companyId, companyId)))
      .returning();

    return updated;
  }
}
