import { db, invoices, auditLogs, ecfSequences, dgiiSubmissions, users, roles, accountsReceivable, products, customers } from '@/db';
import { FinancialMovementService } from '@/services/financialMovementService';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { CompanyRepository } from '@/repositories/companyRepository';
import { CashRepository } from '@/repositories/cashRepository';
import { AccountRepository } from '@/repositories/accountRepository';
import { InvoiceRepository, CreateInvoiceInput } from '@/repositories/invoiceRepository';
import { deductStock } from '@/services/inventoryService';
import { siguienteCodigoFactura } from './codigoFactura';
import { IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult } from './types';
import { leerDatosFirma } from '@/services/dgii/codigoSeguridad';
import { esAdminOSistemas } from '@/utils/rolMatch';
import { resolverCuentaPorMapeo } from '@/services/accounting/resolverCuentas';

export class InvoiceDbBooker {
  /**
   * Determines the active cash session.
   */
  static async determineActiveCashSession(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    userId: string,
    paymentType: string,
    providedCashSessionId?: string
  ): Promise<string | undefined> {
    let activeCashSessionId = providedCashSessionId;

    if (paymentType === 'cash') {
      const [userWithRole] = await db
        .select({
          roleName: roles.name,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, userId))
        .limit(1);

      const roleName = userWithRole?.roleName?.toLowerCase() || '';
      // Auditoria P0-02 (2026-09-03): antes .includes('admin'/'sistema').
      // Ver utils/rolMatch.ts para el porque completo.
      const isAdminOrSys = esAdminOSistemas(roleName);

      let activeSession = null;
      if (isAdminOrSys) {
        activeSession = await CashRepository.getActiveSession(userId, companyId, modo);
        if (!activeSession) {
          activeSession = await CashRepository.getAnyActiveSession(companyId, modo);
        }
      } else {
        activeSession = await CashRepository.getActiveSession(userId, companyId, modo);
      }

      if (!activeSession) {
        throw new Error('Debe abrir una sesión de caja antes de realizar una venta en efectivo.');
      }
      activeCashSessionId = activeSession.id;
    }

    return activeCashSessionId;
  }

  /**
   * Pre-flight validations to ensure the invoice can be safely saved locally 
   * BEFORE submitting it to DGII/MSeller.
   */
  static async preFlightValidations(
    data: IssueInvoiceInput,
    totals: CalculatedTotals
  ) {
      // NOTA (auditoria F1-04): aqui NO se valida existencia de inventario.
      //
      // Facturar no descuenta stock: la deduccion esta diferida al conduce de
      // entrega (ver el comentario de executeDbTransaction, "Deduccion diferida
      // a Conduce de Entrega"). El unico punto que puede dejar un nivel en
      // negativo es el despacho, y ahi si se bloquea, en
      // deliveryRepository.approveDeliveryNote.
      //
      // Bloquear aqui impediria facturar mercancia que aun esta por fabricar o
      // por recibir, que es una venta perfectamente legitima, sin evitar ni un
      // solo negativo adicional.
    if (data.ecfType !== '34') {
      for (const line of totals.itemLines) {
        // Cost validation
        // ISO-04: la tabla se escribia como cadena -- `.from(sql\`products\`)` --
        // y con la tabla escondida asi tambien se escondia lo que faltaba en el
        // WHERE: la empresa. Se localizaba el producto SOLO por su id, de modo
        // que el precio de venta se validaba contra el costo del producto de
        // otra empresa si el id venia de fuera.
        const [prod] = await db
          .select({ cost: products.cost })
          .from(products)
          .where(and(
            eq(products.id, line.productId),
            eq(products.companyId, data.companyId)
          ))
          .limit(1);

        // No encontrarlo significa que ese id no es de esta empresa: la clave
        // ajena de `invoice_lines` apunta a `products.id` sin mirar la empresa,
        // asi que existir, existe. Antes se seguia sin validar nada, en
        // silencio, y la linea se facturaba igual.
        if (!prod) {
          throw new Error(
            `El artículo "${line.name}" no pertenece a esta empresa. No se puede facturar.`
          );
        }

        {
          const cost = parseFloat(prod.cost || '0.00');
          if (cost > 0 && line.unitPrice < cost) {
            throw new Error(`El precio unitario (RD$ ${line.unitPrice.toFixed(2)}) para "${line.name}" no puede ser inferior a su costo (RD$ ${cost.toFixed(2)}).`);
          }
        }
      }
    }

    // Verify Credit Limit for credit sales
    if (data.paymentType === 'credit' && data.customerId && data.ecfType !== '34') {
      // ISO-04: mismo caso que el producto. El limite de credito se leia del
      // cliente localizado solo por id, sin empresa.
      const [customer] = await db
        .select({
          creditLimit: customers.creditLimit,
          name: customers.name,
        })
        .from(customers)
        .where(and(
          eq(customers.id, data.customerId),
          eq(customers.companyId, data.companyId)
        ))
        .limit(1);

      // Mismo criterio que con el articulo: si no aparece, el cliente no es de
      // esta empresa. Seguir sin comprobar el limite de credito seria conceder
      // credito a ciegas.
      if (!customer) {
        throw new Error('El cliente indicado no pertenece a esta empresa.');
      }

      {
        const limit = parseFloat(customer.creditLimit || '0.00');
        if (limit > 0) {
          const [arBalanceResult] = await db
            .select({
              balance: sql<string>`COALESCE(SUM(balance), 0)`
            })
            .from(accountsReceivable)
            .where(
              and(
                eq(accountsReceivable.customerId, data.customerId),
                eq(accountsReceivable.companyId, data.companyId),
                eq(accountsReceivable.modo, data.modo),
                isNull(accountsReceivable.deletedAt)
              )
            );
          const currentBalance = parseFloat(arBalanceResult?.balance || '0.00');
          const totalInvoiceAmount = totals.totalNet;
          if (currentBalance + totalInvoiceAmount > limit) {
            throw new Error(
              `Límite de crédito excedido para ${customer.name}. Límite: RD$ ${limit.toLocaleString('es-DO', { minimumFractionDigits: 2 })}, Saldo actual: RD$ ${currentBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}, Monto factura: RD$ ${totalInvoiceAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`
            );
          }
        }
      }
    }
  }

  /**
   * Reserva el siguiente NCF de la secuencia y lo devuelve.
   *
   * Auditoria DB-04. Este paso LEIA la secuencia sin bloqueo y devolvia el
   * numero; la reserva de verdad ocurria al final, con el comprobante ya
   * enviado a la DGII. Entre una cosa y otra estaba la llamada de red: dos
   * emisiones simultaneas leian el mismo numero y LAS DOS lo mandaban. Al
   * serializarse, la segunda detectaba el conflicto y abortaba su transaccion
   * entera; quedaban dos comprobantes con el mismo numero ante la DGII y una
   * venta entregada al cliente que no existia en el sistema: sin ingreso, sin
   * ITBIS y sin inventario.
   *
   * Ahora el numero se compromete ANTES de enviar nada. Un envio fallido deja
   * un hueco en la secuencia, y para eso esta `registrarNcfSinUsar`: un hueco
   * se explica ante la DGII, un numero duplicado no.
   *
   * Este es el UNICO punto del flujo de emision que avanza la secuencia.
   * `src/tests/secuenciaNcf.vitest.ts` lo comprueba contando llamadas: si
   * `executeDbTransaction` o `saveRejectedInvoice` vuelven a reservar, la
   * prueba falla.
   */
  static async reservarNcf(
    companyId: string,
    ecfType: string,
    modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
  ): Promise<{ ncf: string }> {
    // El bloqueo de fila vive dentro de `allocateNextNcf` y solo funciona
    // dentro de una transaccion. Esta es la SUYA, aparte de la que registra la
    // factura: el numero tiene que quedar comprometido antes de que salga nada
    // hacia la DGII, no al final.
    const ncf = await db.transaction(async (tx) =>
      await CompanyRepository.allocateNextNcf(tx, companyId, ecfType, modo)
    );

    return { ncf };
  }

  /**
   * Deja constancia de un NCF que se reservo y no llego a respaldar ninguna
   * factura.
   *
   * Es la contrapartida de reservar antes de enviar: si el envio a la DGII
   * falla, o si el comprobante sale pero luego no se puede registrar, el
   * numero ya esta consumido y la secuencia queda con un hueco. Un hueco sin
   * explicacion es un problema ante la DGII; con esta traza se puede decir
   * cual numero, cuando y por que.
   *
   * NO devuelve el numero a la secuencia. Retroceder `current_sequence` es
   * exactamente la carrera que este cambio vino a cerrar, y ademas el
   * comprobante puede haber llegado a la DGII de todas formas.
   *
   * No relanza: se llama desde el manejo de un error que ya se esta
   * propagando, y perder el error original porque falle la escritura de la
   * traza seria cambiar un problema por otro peor.
   */
  static async registrarNcfSinUsar(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    userId: string,
    ncf: string,
    ecfType: string,
    motivo: string
  ) {
    try {
      await db.insert(auditLogs).values({
        companyId,
        userId,
        action: 'ncf_reservado_sin_usar',
        entityType: 'ecf_sequences',
        newValues: { ncf, ecfType, motivo },
        ipAddress: 'server',
        modo,
      });
    } catch (err) {
      console.error(
        `[InvoiceDbBooker] No se pudo registrar el hueco de secuencia del NCF ${ncf}:`,
        err
      );
    }
  }

  /**
   * Safely saves a rejected invoice inside an isolated transaction when the DGII rejects it structurally.
   */
  static async saveRejectedInvoice(
    data: IssueInvoiceInput,
    ncf: string,
    activeCashSessionId: string | undefined,
    totals: CalculatedTotals,
    errMsg: string
  ) {
    return await db.transaction(async (tx) => {
      // El NCF llega ya reservado por `reservarNcf`, antes del envio. Aqui se
      // reservaba OTRA VEZ y se comparaba: la secuencia avanzaba dos veces por
      // cada comprobante rechazado, y la comparacion fallaba siempre que dos
      // emisiones se solaparan. Un rechazo de la DGII no deja hueco -- la
      // factura se guarda con su numero.

      // El numero interno se reserva con una sentencia atomica. Antes se contaba
      // con COUNT(*), que no bloquea nada: dos facturas simultaneas se llevaban
      // el mismo numero. Ver src/services/invoice/codigoFactura.ts.
      const codigoFactura = await siguienteCodigoFactura(
        tx, data.companyId, data.modo, data.ecfType
      );

      await InvoiceRepository.create({
        companyId: data.companyId,
        modo: data.modo,
        warehouseId: data.warehouseId,
        customerId: data.customerId,
        userId: data.userId,
        cashSessionId: activeCashSessionId,
        ncf,
        ecfType: data.ecfType,
        status: 'rejected',
        paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
        paymentType: data.paymentType,
        bankName: data.bankName,
        transactionNumber: data.transactionNumber,
        subtotal: totals.subtotal,
        discount: totals.totalDiscount,
        totalTaxes: totals.totalTaxes,
        total: totals.total,
        totalRetained: totals.totalRetained,
        totalNet: totals.totalNet,
        dgiiMessage: errMsg,
        buyerRnc: data.buyerRnc,
        buyerName: data.buyerName,
        notes: data.notes,
        modifiedNcf: data.modifiedNcf,
        modifiedInvoiceId: data.modifiedInvoiceId,
        codigoFactura,
        deliveryStatus: 'pending',
        quoteId: data.quoteId || undefined,
        lines: totals.itemLines,
        taxes: totals.taxesList,
        retentions: totals.calculatedRetentions,
      }, tx);
    });
  }

  /**
   * Executes the atomic SQL database operations inside a single Drizzle transaction.
   */
  static async executeDbTransaction(
    data: IssueInvoiceInput,
    ncf: string,
    activeCashSessionId: string | undefined,
    totals: CalculatedTotals,
    submission: DgiiSubmissionResult,
    xmlPath: string,
    signedXmlPath: string,
    pdfPath: string,
    msellerXmlPath: string
  ) {
    return await db.transaction(async (tx) => {
      // El NCF ya viene reservado desde antes del envio a la DGII, asi que aqui
      // no se toca la secuencia. Mientras se reservaba tambien aqui, cada
      // factura la avanzaba dos veces y dos emisiones simultaneas hacian que la
      // segunda abortara su transaccion entera -- con el comprobante ya
      // presentado a la DGII y la venta ya entregada.

      // El numero interno se reserva con una sentencia atomica. Antes se contaba
      // con COUNT(*), que no bloquea nada: dos facturas simultaneas se llevaban
      // el mismo numero. Ver src/services/invoice/codigoFactura.ts.
      const codigoFactura = await siguienteCodigoFactura(
        tx, data.companyId, data.modo, data.ecfType
      );

      // Sin validacion de existencia: ver la nota en preFlightValidations.
      // Se elimina tambien el bucle que la ejecutaba, que era un N+1 por linea
      // repetido dos veces (fuera y dentro de la transaccion).

      // Verify Credit Limit for credit sales
      if (data.paymentType === 'credit' && data.customerId && data.ecfType !== '34') {
        // ISO-04: la misma comprobacion dentro de la transaccion, con la misma
        // ausencia. Un limite de credito leido de otra empresa deja pasar una
        // venta a credito que deberia haberse bloqueado, o bloquea una buena.
        const [customer] = await tx
          .select({
            creditLimit: customers.creditLimit,
            name: customers.name,
          })
          .from(customers)
          .where(and(
            eq(customers.id, data.customerId),
            eq(customers.companyId, data.companyId)
          ))
          .limit(1);

        if (!customer) {
          throw new Error('El cliente indicado no pertenece a esta empresa.');
        }

        {
          const limit = parseFloat(customer.creditLimit || '0.00');
          if (limit > 0) {
            const [arBalanceResult] = await tx
              .select({
                balance: sql<string>`COALESCE(SUM(balance), 0)`
              })
              .from(accountsReceivable)
              .where(
                and(
                  eq(accountsReceivable.customerId, data.customerId),
                  eq(accountsReceivable.companyId, data.companyId),
                  eq(accountsReceivable.modo, data.modo),
                  isNull(accountsReceivable.deletedAt)
                )
              );
            const currentBalance = parseFloat(arBalanceResult?.balance || '0.00');
            const totalInvoiceAmount = totals.totalNet;
            if (currentBalance + totalInvoiceAmount > limit) {
              throw new Error(
                `Límite de crédito excedido para ${customer.name}. Límite: RD$ ${limit.toLocaleString('es-DO', { minimumFractionDigits: 2 })}, Saldo actual: RD$ ${currentBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}, Monto factura: RD$ ${totalInvoiceAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`
              );
            }
          }
        }
      }

      // LA FIRMA QUE mSELLER YA DEVOLVIO.
      //
      // mSeller firma en el momento del envio: `securityCode` y `qr_url` vienen
      // en esa respuesta. El VEREDICTO de la DGII no -- ese se consulta despues.
      // Son dos cosas distintas y llegan en dos momentos distintos, y confundir
      // una con la otra es lo que hacia que un comprobante recien emitido
      // saliera sin codigo y sin QR aunque mSeller ya los hubiera dado: se
      // guardaban solo en `dgii_submissions` y la factura no los veia hasta que
      // alguien pulsaba "sincronizar".
      //
      // Se lee del payload ademas de `securityHash` porque la fecha de firma
      // solo viene ahi, y porque el codigo puede llegar anidado.
      const firma = leerDatosFirma(submission.msellerResponsePayload);
      const codigoFirma = submission.securityHash?.trim() || firma.codigo || null;
      const enlaceQr = submission.qrCode?.trim() || firma.qr || null;
      const fechaFirma = firma.fechaFirma || null;

      // Create invoice in database
      const invoiceInput: CreateInvoiceInput = {
        companyId: data.companyId,
        modo: data.modo,
        warehouseId: data.warehouseId,
        customerId: data.customerId,
        userId: data.userId,
        cashSessionId: activeCashSessionId,
        ncf,
        ecfType: data.ecfType,
        status: submission.finalStatus,
        // Nulos si no vinieron. La firma no se fabrica -- pero tampoco se tira
        // cuando esta.
        securityCode: codigoFirma,
        signatureDate: fechaFirma,
        qrUrl: enlaceQr,
        paymentStatus: data.paymentType === 'credit' ? 'unpaid' : 'paid',
        paymentType: data.paymentType,
        bankName: data.bankName,
        transactionNumber: data.transactionNumber,
        subtotal: totals.subtotal,
        discount: totals.totalDiscount,
        totalTaxes: totals.totalTaxes,
        total: totals.total,
        totalRetained: totals.totalRetained,
        totalNet: totals.totalNet,
        xmlPath,
        signedXmlPath,
        msellerXmlPath,
        pdfPath,
        msellerTrackId: submission.msellerTrackId || undefined,
        dgiiMessage: submission.dgiiMessage || undefined,
        buyerRnc: data.buyerRnc,
        buyerName: data.buyerName,
        notes: data.notes,
        modifiedNcf: data.modifiedNcf,
        modifiedInvoiceId: data.modifiedInvoiceId,
        indicadorNotaCredito: data.indicadorNotaCredito,
        codigoFactura,
        lines: totals.itemLines,
        taxes: totals.taxesList,
        retentions: totals.calculatedRetentions,
      };

      const invoice = await InvoiceRepository.create(invoiceInput, tx);

      // Financial movements registration (Clientes)
      if (data.customerId) {
        const isCreditNote = data.ecfType === '34';
        const isDebitNote = data.ecfType === '33';
        const movementType = isCreditNote ? 'credit_note' : isDebitNote ? 'debit_note' : 'invoice';
        const debit = isCreditNote ? 0 : totals.totalNet;
        const credit = isCreditNote ? totals.totalNet : 0;

        await FinancialMovementService.registerMovement(tx, {
          companyId: data.companyId,
          modo: data.modo,
          entityType: 'customer',
          customerId: data.customerId,
          date: new Date(),
          movementType,
          documentId: invoice.id,
          documentNumber: ncf,
          originModule: 'invoicing',
          debit,
          credit,
          userId: data.userId,
          notes: isCreditNote
            ? `Nota de Crédito aplicada. Modifica NCF: ${data.modifiedNcf || 'N/A'}`
            : isDebitNote
            ? `Nota de Débito aplicada. Modifica NCF: ${data.modifiedNcf || 'N/A'}`
            : `Factura de Venta emitida. NCF: ${ncf}`,
        });

        // Rule: If cash sale, generate matching immediate payment receipt movement
        const isCash = data.paymentType === 'cash' || data.paymentType === 'bank_transfer';
        if (isCash && !isCreditNote) {
          await FinancialMovementService.registerMovement(tx, {
            companyId: data.companyId,
            modo: data.modo,
            entityType: 'customer',
            customerId: data.customerId,
            date: new Date(),
            movementType: 'receipt',
            documentId: invoice.id,
            documentNumber: `REC-CASH-${ncf}`,
            originModule: 'cash',
            debit: 0,
            credit: totals.totalNet,
            userId: data.userId,
            notes: `Cobro inmediato en venta al contado NCF: ${ncf}`,
          });
        }
      }

      // Deduct or add inventory (Deducción diferida a Conduce de Entrega. Solo Nota de Crédito e-34 agrega stock aquí)
      if (data.ecfType === '34') {
        for (const line of totals.itemLines) {
          // La mercancia vuelve al almacen DE DONDE SALIO, no al general del
          // formulario. Antes iba siempre a `data.warehouseId`: una factura
          // despachada desde dos almacenes se devolvia entera a uno solo, y el
          // otro quedaba con existencia de menos para siempre.
          //
          // El almacen de la linea viene ya validado contra la empresa desde la
          // ruta (POST /api/v1/invoices); si la linea no lo trae -- facturas
          // antiguas, o un almacen que ya no existe -- se cae al general, que es
          // exactamente lo que se hacia hasta ahora.
          const almacenDeLinea = line.warehouseId || data.warehouseId;
          await deductStock(
            data.companyId,
            data.modo,
            line.productId,
            almacenDeLinea,
            -line.quantity,
            data.userId,
            'return',
            invoice.id,
            `Devolución Nota de Crédito ${ncf}`,
            tx
          );
        }
      }

      // Book automatic accounting journal entries (Double Entry)
      //
      // Auditoria P0-05 (2026-09-03): estas cuatro cuentas se resolvian con
      // `getOrCreateAccount`, que busca por codigo literal y CREA la cuenta si
      // no la encuentra. '1.1.02' y '1.1.01' ya existian en el catalogo real
      // como cuentas de AGRUPACION (Cuentas por Cobrar es la primera, no
      // Efectivo) -- postear ahi duplica el saldo entre padre e hijo. '2.1.03'
      // no existe en el catalogo real (el ITBIS por Pagar transaccional es
      // '2.1.02.01'); al no encontrarla, se creaba una cuenta nueva sin
      // `nature`, heredando 'debit' para lo que es un pasivo. `resolverCuentaPorMapeo`
      // nunca crea: resuelve por `accounting_mappings` o por el codigo correcto,
      // y valida que la cuenta sea transaccional, activa y de esta empresa.
      const accCxC = await resolverCuentaPorMapeo(tx, data.companyId, 'accounts_receivable', '1.1.02.01', 'Facturación - Cuentas por Cobrar');
      const accCaja = await resolverCuentaPorMapeo(tx, data.companyId, 'cash', '1.1.01.01', 'Facturación - Efectivo');
      const accVentas = await resolverCuentaPorMapeo(tx, data.companyId, 'sales_revenue', '4.1.01', 'Facturación - Ingresos por Ventas');
      const accItbis = await resolverCuentaPorMapeo(tx, data.companyId, 'itbis_sales', '2.1.02.01', 'Facturación - ITBIS por Pagar');

      const isCashOrBank = data.paymentType === 'cash' || data.paymentType === 'bank_transfer';
      const paymentAccount = isCashOrBank ? accCaja : accCxC;

      let journalLines = [];
      if (data.ecfType === '34') {
        // Credit note reverses standard journal entry
        const creditAmount = totals.totalNet;
        journalLines = [
          { accountId: accVentas.id, debit: totals.subtotal - totals.totalDiscount, credit: 0 },
          { accountId: paymentAccount.id, debit: 0, credit: creditAmount },
        ];
        if (totals.totalTaxes > 0) {
          journalLines.unshift({ accountId: accItbis.id, debit: totals.totalTaxes, credit: 0 });
        }

        // Revert retentions if any
        if (totals.totalRetained > 0) {
          for (const ret of totals.calculatedRetentions) {
            if (ret.retentionType === 'ISR') {
              const accIsr = await resolverCuentaPorMapeo(tx, data.companyId, 'isr_retention_receivable', '1.1.03', 'Retención de ISR sobre venta');
              journalLines.push({ accountId: accIsr.id, debit: 0, credit: ret.retentionAmount });
            } else if (ret.retentionType === 'ITBIS') {
              const accItbisRet = await resolverCuentaPorMapeo(tx, data.companyId, 'itbis_retention_receivable', '1.1.04', 'Retención de ITBIS sobre venta');
              journalLines.push({ accountId: accItbisRet.id, debit: 0, credit: ret.retentionAmount });
            } else {
              const accOtras = await resolverCuentaPorMapeo(tx, data.companyId, 'other_retention_receivable', '1.1.05', 'Otra retención sobre venta');
              journalLines.push({ accountId: accOtras.id, debit: 0, credit: ret.retentionAmount });
            }
          }
        }
      } else {
        journalLines = [
          { accountId: paymentAccount.id, debit: totals.totalNet, credit: 0 },
          { accountId: accVentas.id, debit: 0, credit: totals.subtotal - totals.totalDiscount },
        ];
        if (totals.totalTaxes > 0) {
          journalLines.push({ accountId: accItbis.id, debit: 0, credit: totals.totalTaxes });
        }

        // Book retention assets (Anticipo de impuestos)
        if (totals.totalRetained > 0) {
          for (const ret of totals.calculatedRetentions) {
            if (ret.retentionType === 'ISR') {
              const accIsr = await resolverCuentaPorMapeo(tx, data.companyId, 'isr_retention_receivable', '1.1.03', 'Retención de ISR sobre venta');
              journalLines.push({ accountId: accIsr.id, debit: ret.retentionAmount, credit: 0 });
            } else if (ret.retentionType === 'ITBIS') {
              const accItbisRet = await resolverCuentaPorMapeo(tx, data.companyId, 'itbis_retention_receivable', '1.1.04', 'Retención de ITBIS sobre venta');
              journalLines.push({ accountId: accItbisRet.id, debit: ret.retentionAmount, credit: 0 });
            } else {
              const accOtras = await resolverCuentaPorMapeo(tx, data.companyId, 'other_retention_receivable', '1.1.05', 'Otra retención sobre venta');
              journalLines.push({ accountId: accOtras.id, debit: ret.retentionAmount, credit: 0 });
            }
          }
        }
      }

      await AccountRepository.createJournalEntry(tx, {
        companyId: data.companyId,
        modo: data.modo,
        reference: invoice.id,
        date: new Date().toISOString().split('T')[0],
        description: `Facturación Automática e-CF NCF: ${ncf}`,
        lines: journalLines,
        // Auditoria JRN-16: quien registra el asiento. Sin autor, un asiento
        // duplicado -- por un doble clic, un reintento por tiempo de espera o
        // alguien registrandolo dos veces -- no se puede explicar despues.
        createdBy: data.userId,
      });

      // Cash Session registration
      if (activeCashSessionId) {
        const isCreditNote = data.ecfType === '34';
        await CashRepository.addMovement(tx, {
          companyId: data.companyId,
          cashSessionId: activeCashSessionId,
          invoiceId: invoice.id,
          type: isCreditNote ? 'refund' : 'sale',
          amount: totals.totalNet,
          description: isCreditNote
            ? `Devolución Nota de Crédito: ${ncf}`
            : data.ecfType === '33'
            ? `Nota de Débito e-CF Comprobante: ${ncf}`
            : `Venta e-CF Comprobante: ${ncf}`,
          reference: ncf,
          // El entorno ya no se pasa: lo pone la propia sesion de caja.
        });
      }

      // Accounts Receivable registration for credit sales
      if (data.paymentType === 'credit' && data.customerId) {
        if (data.ecfType === '34' && data.modifiedInvoiceId) {
          // A credit note on a credit sale reduces the existing receivable balance!
          const [existingAr] = await tx
            .select()
            .from(accountsReceivable)
            .where(
              and(
                eq(accountsReceivable.invoiceId, data.modifiedInvoiceId),
                // modifiedInvoiceId llega del cuerpo de la peticion. Sin el
                // filtro por empresa, una nota de credito e-34 rebajaba el
                // balance de la cuenta por cobrar de otra empresa.
                eq(accountsReceivable.companyId, data.companyId),
                eq(accountsReceivable.modo, data.modo)
              )
            )
            .limit(1);
          if (existingAr) {
            const newBalance = Math.max(0, parseFloat(existingAr.balance || '0') - totals.totalNet);
            await tx
              .update(accountsReceivable)
              .set({
                balance: newBalance.toString(),
                status: newBalance <= 0.01 ? 'paid' : 'pending',
                updatedAt: new Date(),
              })
              .where(eq(accountsReceivable.id, existingAr.id));
          }
        } else {
          // Standard invoice or Debit Note (increases receivable)
          const dueDate = new Date();
          dueDate.setMonth(dueDate.getMonth() + 1); // 1 month credit default
          await AccountRepository.createAccountsReceivable(tx, {
            companyId: data.companyId,
            customerId: data.customerId,
            invoiceId: invoice.id,
            amount: totals.totalNet,
            dueDate,
            modo: data.modo,
          });
        }
      }

      // Record audit log
      await tx.insert(auditLogs).values({
        companyId: data.companyId,
        userId: data.userId,
        action: 'invoice_issued_and_signed',
        entityType: 'invoices',
        entityId: invoice.id,
        newValues: { ncf, total: totals.total, customerId: data.customerId },
        ipAddress: 'server',
        modo: data.modo,
      });

      // ─── Registro del envio ────────────────────────────────────────────
      //
      // ESTO TENIA UN AGUJERO, Y LO ABRI YO.
      //
      // Habia dos ramas, 'accepted' y 'signed'. Pero `finalStatus` admite
      // CUATRO valores ('signed' | 'submitted' | 'accepted' | 'rejected'), asi
      // que 'submitted' y 'rejected' no entraban en ninguna: la factura se
      // guardaba con ese estado y NO se insertaba ninguna fila en
      // `dgii_submissions`. Ni registro, ni codigo de seguridad, ni trabajo en
      // cola que lo resolviera.
      //
      // Antes del arreglo del estado (F1-05) eso no se notaba, porque una
      // respuesta sin estado reconocible se convertia en 'accepted' por el
      // `|| 'Aceptado'` y caia en la primera rama. Al hacer honesta la LECTURA
      // -- sin estado, 'submitted' -- el estado honesto se quedo sin sitio
      // donde vivir. Arreglar una mitad y no la otra dejo la factura sin
      // constancia de nada.
      //
      // Sintoma observado en produccion: una factura de PRODUCCION en estado
      // 'accepted' con CERO envios. Se emitio como 'submitted' (sin fila), y
      // una sincronizacion posterior le puso 'accepted' a la factura mientras
      // su UPDATE de `dgii_submissions` no tocaba ninguna fila, en silencio.
      // O sea: un comprobante que afirma que la DGII lo acepto sin una sola
      // prueba de que se enviara.
      //
      // Ahora TODOS los estados dejan fila. La fila es el rastro de lo que
      // paso, y no puede depender de que el resultado sea bueno.
      if (submission.finalStatus === 'accepted') {
        await tx.insert(dgiiSubmissions).values({
          companyId: data.companyId,
          invoiceId: invoice.id,
          status: 'accepted',
          trackId: submission.msellerTrackId,
          responseMessage: submission.dgiiMessage,
          responsePayload: JSON.stringify(submission.msellerResponsePayload),
          // El codigo de seguridad, en su propia columna (0041). Antes solo
          // vivia dentro de `response_payload`, y las rutas de sincronizacion
          // pisaban ese JSON con la respuesta de la consulta de estado, que no
          // lo lleva: sincronizar una factura borraba su codigo.
          securityCode: submission.securityHash || null,
          retryCount: 0,
          modo: data.modo,
        });
      } else if (submission.finalStatus === 'signed') {
        const [envio] = await tx.insert(dgiiSubmissions).values({
          companyId: data.companyId,
          invoiceId: invoice.id,
          status: 'pending',
          retryCount: 0,
          modo: data.modo,
        }).returning({ id: dgiiSubmissions.id });

        await import('@/infrastructure/queue').then(async ({ addJob }) => {
          await addJob('dgii-submissions', 'submit-ecf', {
            companyId: data.companyId,
            invoiceId: invoice.id,
            // El trabajo actualiza SU intento, no todos los de la factura.
            submissionId: envio.id,
          });
        });
      } else {
        // 'submitted' y 'rejected'. El documento SI salio hacia la DGII -- eso
        // es lo que los distingue de 'signed' -- asi que queda su constancia
        // con lo que contesto, incluido el codigo de seguridad si vino.
        //
        // NO se encola un reenvio. El trabajo de la cola vuelve a MANDAR el
        // documento, y aqui ya se mando: reenviarlo es arriesgarse a duplicar
        // un e-CF que la DGII pudo haber aceptado. Un 'submitted' se resuelve
        // consultando el estado, que es lo que hace la sincronizacion.
        await tx.insert(dgiiSubmissions).values({
          companyId: data.companyId,
          invoiceId: invoice.id,
          status: submission.finalStatus === 'rejected' ? 'rejected' : 'submitted',
          trackId: submission.msellerTrackId,
          responseMessage: submission.dgiiMessage,
          responsePayload: submission.msellerResponsePayload
            ? JSON.stringify(submission.msellerResponsePayload)
            : null,
          securityCode: submission.securityHash || null,
          retryCount: 0,
          modo: data.modo,
        });
      }

      return {
        invoice,
        msellerResponse: submission.msellerResponsePayload,
      };
    });
  }

  // Auditoria P0-05 (2026-09-03): `getOrCreateAccount` vivia aqui -- eliminado.
  // Creaba cuentas sobre la marcha sin `nature`/`level` correctos y no
  // distinguia una cuenta de agrupacion de una transaccional. Las cuentas de
  // este modulo se resuelven ahora con `resolverCuentaPorMapeo`
  // (services/accounting/resolverCuentas.ts), que nunca crea y siempre valida.
}
