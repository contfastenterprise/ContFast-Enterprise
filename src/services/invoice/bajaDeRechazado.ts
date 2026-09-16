/**
 * Dar de baja un comprobante que la DGII rechazo DESPUES de contabilizado.
 *
 * EL HUECO (lote 140)
 * -------------------
 * Un rechazo al EMITIR guarda la factura sin ningun efecto
 * (`saveRejectedInvoice`). Pero un comprobante que sale en `submitted` se
 * contabiliza entero -- asiento, CxC, estado de cuenta del cliente -- y si el
 * rechazo llega despues, por la consulta de estado, todo eso se queda. Medido
 * el 2026-09-16: E340000000002 en PRODUCCION (asiento y movimiento del
 * cliente, y rebajo la CxC de otra factura), y dos e-44 de PRUEBA con asiento,
 * CxC y movimiento.
 *
 * POR QUE NO SE REVIERTE SOLO, AL LLEGAR EL RECHAZO
 * -------------------------------------------------
 * Decidido por el dueño el 2026-09-16. Un rechazo se corrige muchas veces
 * reenviando el MISMO e-NCF, y un reenvio aceptado no vuelve a contabilizar:
 * revertir en automatico dejaria esa venta fuera de los libros. Y habria
 * escrito solo sobre datos ya emitidos en la siguiente consulta. Asi que el
 * rechazo no toca nada, y darlo de baja es una accion deliberada, que:
 *
 *   - deja el comprobante en `void`: el 607 y el libro de ventas ya lo
 *     excluyen, "Reenviar" no lo admite, y una nota en `void` no cuenta como
 *     ajuste de su factura;
 *   - registra el asiento CONTRARIO al de la emision, con fecha de hoy (el
 *     periodo del original puede estar cerrado);
 *   - retira su CxC, o recalcula la de la factura que modificaba si es una nota
 *     de credito;
 *   - anota el contramovimiento en el estado de cuenta del cliente.
 *
 * Y SE NIEGA cuando deshacer no es seguro: cobros aplicados, conduces
 * vigentes, movimientos de caja o de inventario, o asientos que no son el de
 * la emision. Esos casos los resuelve quien lleva la contabilidad.
 */
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  db, invoices, invoiceRetentions, journalEntries, journalEntryLines, accountsReceivable,
  customerReceiptApplied, deliveryNotes, cashMovements, inventoryMovements, financialMovements, auditLogs,
} from '@/db';
import { AccountRepository } from '@/repositories/accountRepository';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { FinancialMovementService } from '@/services/financialMovementService';
import { resolverCuentasDeVenta, lineasDeVenta, type ImportesDeVenta } from './asientoDeFactura';

/** Lo que se cuenta de un comprobante antes de darlo de baja. */
export interface EstadoParaBaja {
  status: string;
  cobrosAplicados: number;
  conducesVigentes: number;
  movimientosDeCaja: number;
  movimientosDeInventario: number;
  asientosDeEmision: number;
  /** Todos los asientos cuya referencia es el comprobante, incluidos los de emision. */
  asientosTotales: number;
}

/**
 * Por que NO se puede dar de baja, o `null` si se puede. Sin base de datos: se
 * decide sobre lo contado.
 */
export function motivoParaNoDarDeBaja(e: EstadoParaBaja): string | null {
  if (e.status !== 'rejected') {
    return `Solo se da de baja un comprobante RECHAZADO por la DGII; este está en "${e.status}".`;
  }
  if (e.cobrosAplicados > 0) {
    return 'Tiene cobros aplicados. Hay que retirar los cobros antes de darlo de baja.';
  }
  if (e.conducesVigentes > 0) {
    return 'Tiene conduces sin anular: la mercancía salió y su costo está asentado. Anule los conduces primero.';
  }
  if (e.movimientosDeCaja > 0) {
    return 'Tiene movimientos en una sesión de caja. La baja no toca la caja: lo resuelve contabilidad.';
  }
  if (e.movimientosDeInventario > 0) {
    return 'Movió inventario (devolución de una nota de crédito). La baja no revierte existencias: lo resuelve contabilidad.';
  }
  if (e.asientosDeEmision > 1) {
    return `Tiene ${e.asientosDeEmision} asientos de emisión y debería tener uno. Revíselo con contabilidad antes de darlo de baja.`;
  }
  if (e.asientosTotales !== e.asientosDeEmision) {
    return 'Tiene asientos que no son el de su emisión. La baja solo sabe deshacer el de la emisión.';
  }
  return null;
}

/**
 * El saldo que debe quedar en la CxC de la factura que modificaba una nota de
 * credito dada de baja.
 *
 * SE RECALCULA, NO SE DEVUELVE LO QUE LA NOTA QUITO. La emision recorta la
 * rebaja en cero sin guardar cuanto quito de verdad (`Math.max(0, ...)`), asi
 * que "sumar el total de la nota" es falso en cuanto hay dos notas sobre la
 * misma factura. Es el caso real: E340000000002 y E340000000003 acreditan
 * entera la misma factura; dar de baja la 0002 NO puede dejar deuda, porque la
 * 0003 sigue valiendo.
 */
export function saldoCxcTrasBaja(p: { monto: number; aplicado: number; otrasNotas: number }): number {
  return Math.max(0, Math.round((p.monto - p.aplicado - p.otrasNotas) * 100) / 100);
}

/** Estados en los que una nota de credito cuenta como ajuste vigente de su factura. */
const NOTAS_QUE_AJUSTAN = ['accepted', 'submitted', 'signed'];

export const DESCRIPCION_EMISION = 'Facturación Automática e-CF NCF: ';

export interface ResultadoBaja {
  ncf: string;
  asientoContrario: string | null;
  cxc: 'retirada' | 'recalculada' | 'sin cxc';
  movimientosAnulados: number;
}

export class BajaNoPermitidaError extends Error {
  readonly status = 409;
  readonly code = 'BAJA_NO_PERMITIDA';
}

export async function darDeBajaRechazado(p: {
  invoiceId: string;
  companyId: string;
  modo: ModoOperativo;
  userId: string;
}): Promise<ResultadoBaja> {
  return await db.transaction(async (tx) => {
    // Bloqueada la fila: dos bajas a la vez no pueden pasar las dos la guarda.
    const [factura] = await tx
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.id, p.invoiceId),
        eq(invoices.companyId, p.companyId),
        eq(invoices.modo, p.modo),
        sql`${invoices.deletedAt} IS NULL`
      ))
      .for('update');

    if (!factura) throw new BajaNoPermitidaError('Comprobante no encontrado.');
    const referencia = factura.id;

    const contar = async (consulta: Promise<{ n: number }[]>) => (await consulta)[0]?.n ?? 0;
    const n = sql<number>`count(*)::int`;

    const estado: EstadoParaBaja = {
      status: factura.status,
      cobrosAplicados: await contar(tx.select({ n }).from(customerReceiptApplied)
        .innerJoin(accountsReceivable, eq(accountsReceivable.id, customerReceiptApplied.arId))
        .where(and(eq(accountsReceivable.invoiceId, referencia), sql`${accountsReceivable.deletedAt} IS NULL`))),
      conducesVigentes: await contar(tx.select({ n }).from(deliveryNotes)
        .where(and(eq(deliveryNotes.invoiceId, referencia), ne(deliveryNotes.status, 'voided')))),
      movimientosDeCaja: await contar(tx.select({ n }).from(cashMovements)
        .where(eq(cashMovements.invoiceId, referencia))),
      movimientosDeInventario: await contar(tx.select({ n }).from(inventoryMovements)
        .where(and(eq(inventoryMovements.referenceId, referencia), eq(inventoryMovements.companyId, p.companyId)))),
      asientosDeEmision: await contar(tx.select({ n }).from(journalEntries)
        .where(and(
          eq(journalEntries.companyId, p.companyId), eq(journalEntries.modo, p.modo),
          eq(journalEntries.reference, referencia), sql`${journalEntries.deletedAt} IS NULL`,
          sql`${journalEntries.description} LIKE ${DESCRIPCION_EMISION + '%'}`
        ))),
      asientosTotales: await contar(tx.select({ n }).from(journalEntries)
        .where(and(
          eq(journalEntries.companyId, p.companyId), eq(journalEntries.modo, p.modo),
          eq(journalEntries.reference, referencia), sql`${journalEntries.deletedAt} IS NULL`
        ))),
    };

    const motivo = motivoParaNoDarDeBaja(estado);
    if (motivo) throw new BajaNoPermitidaError(motivo);

    // ── 1. El asiento contrario ─────────────────────────────────────────
    let asientoContrario: string | null = null;
    if (estado.asientosDeEmision === 1) {
      const retenciones = await tx
        .select({ retentionType: invoiceRetentions.retentionType, retentionAmount: invoiceRetentions.retentionAmount })
        .from(invoiceRetentions)
        .where(eq(invoiceRetentions.invoiceId, referencia));

      const importes: ImportesDeVenta = {
        ecfType: factura.ecfType,
        paymentType: factura.paymentType,
        subtotal: Number(factura.subtotal),
        totalDiscount: Number(factura.discount),
        totalTaxes: Number(factura.totalTaxes),
        totalNet: Number(factura.totalNet),
        totalRetained: Number(factura.totalRetained),
        retenciones: retenciones.map((r) => ({ retentionType: r.retentionType, retentionAmount: Number(r.retentionAmount) })),
      };
      const lineas = lineasDeVenta(await resolverCuentasDeVenta(tx, p.companyId, importes), importes, true);

      // El contrario tiene que mover LO MISMO que movio la emision. Si no, la
      // factura se edito despues de asentarse, o el asiento se toco a mano, y
      // deshacer "lo que dice la factura" no deshace lo que dice el libro.
      const [original] = await tx
        .select({ debe: sql<string>`coalesce(sum(${journalEntryLines.debit}), 0)` })
        .from(journalEntryLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
        .where(and(
          eq(journalEntries.companyId, p.companyId), eq(journalEntries.modo, p.modo),
          eq(journalEntries.reference, referencia), sql`${journalEntries.deletedAt} IS NULL`,
          sql`${journalEntries.description} LIKE ${DESCRIPCION_EMISION + '%'}`
        ));
      const debeContrario = lineas.reduce((s, l) => s + l.debit, 0);
      if (Math.abs(Number(original?.debe ?? 0) - debeContrario) > 0.01) {
        throw new BajaNoPermitidaError(
          `El asiento de la emisión mueve ${Number(original?.debe ?? 0).toFixed(2)} y la factura dice ${debeContrario.toFixed(2)}. ` +
          'No coinciden: revíselo con contabilidad antes de darlo de baja.'
        );
      }

      const entrada = await AccountRepository.createJournalEntry(tx, {
        companyId: p.companyId,
        modo: p.modo,
        reference: referencia,
        date: new Date(),
        description: `Baja del comprobante rechazado por la DGII NCF: ${factura.ncf}. Asiento contrario al de su emisión`,
        lines: lineas,
        createdBy: p.userId,
      });
      asientoContrario = entrada?.id ?? null;
    }

    // ── 2. La cuenta por cobrar ─────────────────────────────────────────
    let cxc: ResultadoBaja['cxc'] = 'sin cxc';
    if (factura.paymentType === 'credit') {
      if (factura.ecfType === '34' && factura.modifiedInvoiceId) {
        const [arAfectada] = await tx
          .select()
          .from(accountsReceivable)
          .where(and(
            eq(accountsReceivable.invoiceId, factura.modifiedInvoiceId),
            eq(accountsReceivable.companyId, p.companyId),
            eq(accountsReceivable.modo, p.modo),
            sql`${accountsReceivable.deletedAt} IS NULL`
          ))
          .limit(1);
        if (arAfectada) {
          const [aplicado] = await tx
            .select({ total: sql<string>`coalesce(sum(${customerReceiptApplied.amountApplied}), 0)` })
            .from(customerReceiptApplied)
            .where(eq(customerReceiptApplied.arId, arAfectada.id));
          const [otras] = await tx
            .select({ total: sql<string>`coalesce(sum(${invoices.totalNet}), 0)` })
            .from(invoices)
            .where(and(
              eq(invoices.companyId, p.companyId), eq(invoices.modo, p.modo),
              eq(invoices.modifiedInvoiceId, factura.modifiedInvoiceId),
              eq(invoices.ecfType, '34'), ne(invoices.id, referencia),
              inArray(invoices.status, NOTAS_QUE_AJUSTAN as never[]),
              sql`${invoices.deletedAt} IS NULL`
            ));
          const saldo = saldoCxcTrasBaja({
            monto: Number(arAfectada.amount),
            aplicado: Number(aplicado?.total ?? 0),
            otrasNotas: Number(otras?.total ?? 0),
          });
          await tx
            .update(accountsReceivable)
            .set({ balance: saldo.toFixed(2), status: saldo <= 0.01 ? 'paid' : 'pending', updatedAt: new Date() })
            .where(eq(accountsReceivable.id, arAfectada.id));
          cxc = 'recalculada';
        }
      } else {
        const retiradas = await tx
          .update(accountsReceivable)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(accountsReceivable.invoiceId, referencia),
            eq(accountsReceivable.companyId, p.companyId),
            eq(accountsReceivable.modo, p.modo),
            sql`${accountsReceivable.deletedAt} IS NULL`
          ))
          .returning({ id: accountsReceivable.id });
        if (retiradas.length > 0) cxc = 'retirada';
      }
    }

    // ── 3. El estado de cuenta del cliente ──────────────────────────────
    // Contramovimiento, no borrado: el estado de cuenta enseña que hubo un
    // documento y que se dio de baja.
    const movimientos = await tx
      .select()
      .from(financialMovements)
      .where(and(
        eq(financialMovements.companyId, p.companyId), eq(financialMovements.modo, p.modo),
        eq(financialMovements.documentId, referencia), eq(financialMovements.status, 'active'),
        ne(financialMovements.movementType, 'void')
      ));
    for (const m of movimientos) {
      if (m.entityType !== 'customer' || !m.customerId) continue;
      await FinancialMovementService.registerMovement(tx, {
        companyId: p.companyId,
        modo: p.modo,
        entityType: 'customer',
        customerId: m.customerId,
        date: new Date(),
        movementType: 'void',
        documentId: referencia,
        documentNumber: m.documentNumber,
        originModule: 'invoicing',
        debit: Number(m.credit),
        credit: Number(m.debit),
        userId: p.userId,
        notes: `Baja del comprobante rechazado por la DGII NCF: ${factura.ncf}`,
      });
    }

    // ── 4. El comprobante ───────────────────────────────────────────────
    await tx
      .update(invoices)
      .set({ status: 'void', updatedAt: new Date() })
      .where(and(eq(invoices.id, referencia), eq(invoices.companyId, p.companyId)));

    const resultado: ResultadoBaja = {
      ncf: factura.ncf ?? '',
      asientoContrario,
      cxc,
      movimientosAnulados: movimientos.filter((m) => m.entityType === 'customer' && m.customerId).length,
    };

    await tx.insert(auditLogs).values({
      companyId: p.companyId,
      userId: p.userId,
      action: 'comprobante_rechazado_dado_de_baja',
      entityType: 'invoices',
      entityId: referencia,
      oldValues: { status: factura.status },
      newValues: { ...resultado, status: 'void' },
      ipAddress: 'server',
      modo: p.modo,
    });

    return resultado;
  });
}
