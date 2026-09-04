import { db } from '@/db';
import { ApRepository } from '@/repositories/apRepository';
import { AccountRepository } from '@/repositories/accountRepository';
import { apPayments, checks, accountsPayable, bankAccounts, bankTransactions, chartOfAccounts, auditLogs } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { FinancialMovementService } from '@/services/financialMovementService';
import { BankRepository } from '@/repositories/bankRepository';

export interface RegisterPaymentInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  apId: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'check';
  debitAccountId: string;
  creditAccountId: string;
  paymentDate: Date;
  // Check details if paymentMethod is check
  bankAccountId?: string;
  checkNumber?: string;
  payee?: string;
  dueDate?: Date;
  isGuarantee?: boolean;
  /** Usuario que registra el pago. Auditoria JRN-16. */
  createdBy?: string;
}

export class ApService {
  /**
   * Registers a payment on an Accounts Payable.
   * If it is a guarantee check:
   *  - Creates check record with isGuarantee = true, status = 'pending'.
   *  - Creates ap_payments with status = 'pending_guarantee'.
   *  - Does NOT create general ledger entries or update AP balance yet.
   * If it is cash, transfer, or regular check:
   *  - Creates check record (if applicable) with status = 'cleared'.
   *  - Creates ap_payments with status = 'applied'.
   *  - Creates general ledger entries debiting debitAccountId and crediting creditAccountId.
   *  - Deducts paid amount from Accounts Payable balance.
   */
  static async registerPayment(input: RegisterPaymentInput) {
    if (input.amount <= 0) {
      throw new Error('El monto del pago debe ser mayor a cero.');
    }

    return await db.transaction(async (tx) => {
      // 1. Verify AP exists
      //
      // Auditoria ARP-06: esto usaba `ApRepository.findById`, que consulta la
      // conexion global y no la transaccion, y ademas sin bloqueo. Dos pagos
      // simultaneos de la deuda completa leian el mismo saldo, los dos pasaban
      // la validacion de tope y los dos escribian: dos cheques por el importe
      // total contra una sola deuda. `bloquearAp` hace SELECT ... FOR UPDATE
      // dentro de esta transaccion, de modo que el segundo espera y lee el
      // saldo ya rebajado.
      const ap = await ApRepository.bloquearAp(tx, input.apId, input.companyId, input.modo);
      if (!ap) {
        throw new Error('Cuenta por pagar no encontrada.');
      }

      const balanceNum = parseFloat(ap.balance);
      if (input.amount > balanceNum) {
        throw new Error(`El monto del pago ($${input.amount.toFixed(2)}) no puede exceder el balance pendiente ($${balanceNum.toFixed(2)}).`);
      }

      // Las cuentas del asiento llegan del cuerpo de la peticion y hasta ahora
      // solo se validaba que fueran UUID.
      //
      // Auditoria ARP-16 y ARP-02. Consecuencia verificada en produccion: la
      // pantalla proponia por defecto `code.startsWith('1.1.02')` como cuenta
      // de banco -- codigo heredado de un plan de tres niveles donde 1.1.02 era
      // "Efectivo en Bancos" -- y en el catalogo real 1.1.02 es CUENTAS POR
      // COBRAR. Ocho pagos a proveedores, 2.642.619,83 en total, acabaron
      // rebajando la deuda de los clientes. La pantalla ya no lo propone, pero
      // el guardia tiene que estar aqui: una pantalla se puede volver a
      // equivocar, y la API la puede llamar cualquiera.
      if (input.debitAccountId === input.creditAccountId) {
        throw new Error('La cuenta de débito y la de crédito no pueden ser la misma: el asiento no tendría ningún efecto.');
      }

      const cuentas = await tx
        .select({
          id: chartOfAccounts.id,
          code: chartOfAccounts.code,
          name: chartOfAccounts.name,
          isTransactional: chartOfAccounts.isTransactional,
          status: chartOfAccounts.status,
          deletedAt: chartOfAccounts.deletedAt,
        })
        .from(chartOfAccounts)
        .where(and(
          inArray(chartOfAccounts.id, [input.debitAccountId, input.creditAccountId]),
          eq(chartOfAccounts.companyId, input.companyId)
        ));

      for (const id of [input.debitAccountId, input.creditAccountId]) {
        const cuenta = cuentas.find((c) => c.id === id);
        if (!cuenta) {
          throw new Error('Una de las cuentas contables indicadas no existe o no pertenece a la empresa.');
        }
        if (cuenta.deletedAt || cuenta.status !== 'active') {
          throw new Error(`La cuenta ${cuenta.code} ${cuenta.name} no está activa.`);
        }
        if (!cuenta.isTransactional) {
          throw new Error(
            `La cuenta ${cuenta.code} ${cuenta.name} es una cuenta de agrupación y no admite movimientos. ` +
            `Elija una cuenta transaccional.`
          );
        }
      }

      let checkId: string | undefined;

      // 2. Handle check payment method
      if (input.paymentMethod === 'check') {
        if (!input.bankAccountId || !input.checkNumber || !input.payee) {
          throw new Error('Faltan datos del cheque (Banco, número de cheque, o beneficiario).');
        }

        if (input.isGuarantee) {
          if (!input.dueDate) {
            throw new Error('Debe especificar la fecha de vencimiento para cheques en garantía.');
          }

          // Register guarantee check as pending
          const check = await ApRepository.createCheck(tx, {
            companyId: input.companyId,
            modo: input.modo,
            bankAccountId: input.bankAccountId,
            checkNumber: input.checkNumber,
            payee: input.payee,
            amount: input.amount,
            issueDate: input.paymentDate,
            dueDate: input.dueDate,
            isGuarantee: true,
            apId: input.apId,
            status: 'pending',
          });
          checkId = check.id;

          // Register payment as pending_guarantee
          const payment = await ApRepository.createPayment(tx, {
            companyId: input.companyId,
            modo: input.modo,
            apId: input.apId,
            amount: input.amount,
            paymentMethod: 'check',
            checkId,
            debitAccountId: input.debitAccountId,
            creditAccountId: input.creditAccountId,
            paymentDate: input.paymentDate,
            status: 'pending_guarantee',
            createdBy: input.createdBy,
          });

          // Auditoria P1-13 (2026-09-03): sin esto, un pago cuestionado no se
          // podia atribuir a nadie consultando la fila (ver migracion 0049).
          await tx.insert(auditLogs).values({
            modo: input.modo,
            companyId: input.companyId,
            userId: input.createdBy || null,
            action: 'ap_payment_created',
            entityType: 'ap_payments',
            entityId: payment.id,
            newValues: {
              apId: input.apId,
              amount: input.amount,
              paymentMethod: 'check',
              status: 'pending_guarantee',
              isGuarantee: true,
            },
          });

          return {
            payment,
            status: 'pending_guarantee',
            message: 'Cheque en garantía registrado con éxito. Se aplicará contablemente cuando venza y se procese manualmente.',
          };
        } else {
          // Regular check - cleared immediately
          const check = await ApRepository.createCheck(tx, {
            companyId: input.companyId,
            modo: input.modo,
            bankAccountId: input.bankAccountId,
            checkNumber: input.checkNumber,
            payee: input.payee,
            amount: input.amount,
            issueDate: input.paymentDate,
            isGuarantee: false,
            apId: input.apId,
            status: 'cleared',
            clearedDate: input.paymentDate,
          });
          checkId = check.id;
        }
      }

      // 3. Process immediate payment (Cash, Transfer or Regular Check)
      // Save payment record
      const payment = await ApRepository.createPayment(tx, {
        companyId: input.companyId,
        modo: input.modo,
        apId: input.apId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        checkId,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        paymentDate: input.paymentDate,
        status: 'applied',
        createdBy: input.createdBy,
      });

      // Auditoria P1-13 (2026-09-03): ver migracion 0049 y la nota igual mas
      // arriba, en el pago de garantia.
      await tx.insert(auditLogs).values({
        modo: input.modo,
        companyId: input.companyId,
        userId: input.createdBy || null,
        action: 'ap_payment_created',
        entityType: 'ap_payments',
        entityId: payment.id,
        newValues: {
          apId: input.apId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          status: 'applied',
        },
      });

      // Update accounts payable balance
      const newBalance = balanceNum - input.amount;
      await ApRepository.updateApBalance(tx, input.apId, input.companyId, newBalance);

      // Financial movements registration (Suplidores - Pago)
      await FinancialMovementService.registerMovement(tx, {
        companyId: input.companyId,
        modo: input.modo,
        entityType: 'supplier',
        supplierId: ap.supplierId,
        date: input.paymentDate,
        movementType: 'payment',
        documentId: payment.id,
        documentNumber: input.checkNumber || `PAG-${payment.id.slice(0, 8)}`,
        originModule: input.paymentMethod === 'cash' ? 'cash' : 'bank',
        debit: input.amount,
        credit: 0,
        notes: `Pago registrado. Método: ${input.paymentMethod}. Ref: ${input.checkNumber || 'N/A'}`,
      });

      // Create Ledger entry (Journal Entry)
      const description = `Pago CXP a proveedor ${ap.supplierName} - ${
        input.paymentMethod === 'check' 
          ? `Cheque #${input.checkNumber}` 
          : input.paymentMethod === 'transfer' 
          ? 'Transferencia' 
          : 'Efectivo'
      }`;

      await AccountRepository.createJournalEntry(tx, {
        companyId: input.companyId,
        modo: input.modo,
        reference: payment.id,
        date: input.paymentDate,
        description,
        createdBy: input.createdBy || null,
        lines: [
          {
            accountId: input.debitAccountId,
            debit: input.amount,
            credit: 0,
          },
          {
            accountId: input.creditAccountId,
            debit: 0,
            credit: input.amount,
          }
        ]
      });

      return {
        payment,
        status: 'applied',
        message: 'Pago registrado y aplicado a la contabilidad correctamente.',
      };
    });
  }

  /**
   * Valida la fecha en que el banco pago el cheque.
   *
   * Se construye a MEDIANOCHE LOCAL a proposito. `new Date('2026-08-30')` es
   * medianoche UTC, y leida con los getters locales en UTC-4 devuelve el dia
   * anterior: el mismo fallo que hubo que corregir en el calculo de vacaciones.
   */
  private static validarFechaDeCobro(valor?: string): Date {
    if (!valor) return new Date();

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
    if (!m) {
      throw new Error('La fecha de cobro debe venir como AAAA-MM-DD.');
    }
    const anio = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    const fecha = new Date(anio, mes - 1, dia);
    if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
      throw new Error(`La fecha de cobro ${valor} no existe.`);
    }

    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    if (fecha.getTime() > hoy.getTime()) {
      throw new Error(
        'La fecha de cobro no puede ser futura: un cheque no esta cobrado hasta que el banco lo paga.'
      );
    }

    return fecha;
  }

  /**
   * Confirma el cobro de cheques en garantia que el banco YA pago.
   *
   * --- POR QUE CAMBIO (auditoria ARP-25) ------------------------------------
   *
   * Antes se llamaba `applyDueGuaranteeChecks` y hacia otra cosa: buscaba todos
   * los cheques con `dueDate <= hoy` y los daba por cobrados. Sin mas condicion.
   * Por cada uno marcaba el cheque `cleared`, restaba el importe del saldo
   * bancario, insertaba un movimiento de banco y asentaba.
   *
   * La fecha de vencimiento de un cheque en garantia es la que se pacto con el
   * proveedor para presentarlo. NO es la fecha en que el banco lo paga, y en un
   * cheque en garantia puede que no lo pague nunca: para eso es en garantia. El
   * sistema convertia una fecha pactada en un hecho bancario.
   *
   * Verificado en produccion (empresa 38a1a51e, agosto 2026): cuatro cheques por
   * 1.000.782,79 se dieron por cobrados al vencer. Los saldos del modulo de
   * bancos se fueron a negativo y hubo que taparlo con dos "ajustes" que
   * acabaron contra una cuenta de agrupacion.
   *
   * --- QUE HACE AHORA -------------------------------------------------------
   *
   * Nada por su cuenta. Exige dos datos que solo puede dar una persona con el
   * estado de cuenta delante:
   *
   *   - `checkIds`: que cheques pago el banco. Haber vencido no basta.
   *   - `fechaCobro`: cuando los pago. Es la fecha del asiento y la del
   *     movimiento bancario, no la del servidor.
   *
   * Sin lista, falla. Es preferible que un cobro se registre tarde a que se
   * registre un cobro que no ocurrio.
   */
  static async confirmarCobroDeChequesEnGarantia(
    companyId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    checkIds: string[],
    fechaCobro: string,
    createdBy?: string
  ) {
    if (!Array.isArray(checkIds) || checkIds.length === 0) {
      throw new Error(
        'Indique cuales cheques pago el banco. Que un cheque en garantia haya vencido no significa ' +
        'que se haya presentado: confirmelo contra el estado de cuenta antes de aplicarlo.'
      );
    }
    if (!fechaCobro) {
      throw new Error('Indique la fecha en que el banco pago los cheques, segun el estado de cuenta.');
    }

    const fecha = ApService.validarFechaDeCobro(fechaCobro);
    const fechaStr = fecha.toISOString().split('T')[0];

    return await db.transaction(async (tx) => {
      const pendingChecks = await ApRepository.findPendingGuaranteeChecks(companyId, undefined, modo, checkIds);
      
      let appliedCount = 0;
      let totalAppliedAmount = 0;
      // Cheques cuyo importe supera lo que quedaba por pagar. Antes se
      // recortaban en silencio; ahora se devuelven para que se puedan revisar.
      const descuadres: { cheque: string; importeCheque: number; saldoDisponible: number }[] = [];
      // Cheques que se pidieron y no se pudieron aplicar. Antes se saltaban en
      // silencio y quien confirmaba el cobro no se enteraba.
      const noAplicados: { checkId: string; cheque?: string; motivo: string }[] = [];

      const encontrados = new Set(pendingChecks.map((i) => i.check.id));
      for (const id of checkIds) {
        if (!encontrados.has(id)) {
          noAplicados.push({
            checkId: id,
            motivo: 'No es un cheque en garantia pendiente de esta empresa, o ya se habia cobrado.',
          });
        }
      }

      for (const item of pendingChecks) {
        const check = item.check;
        const payment = item.payment;
        const ap = item.ap;

        const amountNum = parseFloat(payment.amount);

        // 1. Update check status to cleared
        //
        // Auditoria ARP-13: los cheques pendientes se leen con la conexion
        // global, fuera de esta transaccion, y no se volvia a comprobar su
        // estado. Dos ejecuciones simultaneas de "aplicar vencidos" -- o esta y
        // la aplicacion individual a la vez -- cobraban el mismo cheque dos
        // veces. Ahora el UPDATE exige que siga pendiente: si no actualiza
        // ninguna fila es que otro proceso se le adelanto, y este lo salta.
        //
        // clearedDate = fecha real de cobro; es la que usa el historial de cheques aplicados.
        const loCobreYo = await ApRepository.marcarChequeCobrado(tx, check.id, companyId, fechaStr);
        if (!loCobreYo) {
          noAplicados.push({
            checkId: check.id,
            cheque: check.checkNumber,
            motivo: 'Otro proceso lo cobro primero.',
          });
          continue;
        }

        // 2. Update payment status to applied
        await ApRepository.marcarPagoAplicado(tx, payment.id, companyId);

        // 3. Update accounts payable balance
        //
        // Auditoria ARP-13: el saldo venia de la lectura sin bloqueo de arriba y
        // se recortaba con Math.max(0, ...), que ocultaba el descuadre cuando el
        // cheque superaba lo que quedaba por pagar. Se relee bajo bloqueo y, si
        // sobra importe, se registra en `descuadres` en vez de desaparecer.
        const apBloqueada = await ApRepository.bloquearAp(tx, ap.id, companyId, modo);
        const saldoActual = apBloqueada ? parseFloat(apBloqueada.balance) : 0;
        const aplicado = Math.min(amountNum, saldoActual);
        if (aplicado < amountNum) {
          descuadres.push({
            cheque: check.checkNumber,
            importeCheque: amountNum,
            saldoDisponible: saldoActual,
          });
        }
        await ApRepository.updateApBalance(tx, ap.id, companyId, saldoActual - aplicado);

        // Financial movements registration (Suplidores - Aplicación de Cheque en lote)
        await FinancialMovementService.registerMovement(tx, {
          companyId: companyId,
          modo,
          entityType: 'supplier',
          supplierId: ap.supplierId,
          date: fecha,
          movementType: 'payment',
          documentId: payment.id,
          documentNumber: check.checkNumber,
          originModule: 'bank',
          debit: amountNum,
          credit: 0,
          notes: `Cobro confirmado de cheque en garantía #${check.checkNumber}`,
        });

        // 4. Update bank account balance and create bank transaction
        if (check.bankAccountId) {
          const [bankAcc] = await tx
            .select()
            .from(bankAccounts)
            .where(and(eq(bankAccounts.id, check.bankAccountId), eq(bankAccounts.companyId, companyId)));

          if (bankAcc) {
            // El saldo se mueve en el entorno de este pago, no en el campo
            // compartido del catalogo: cobrar un cheque en PRUEBA bajaba el
            // saldo REAL de la cuenta.
            await BankRepository.ajustarSaldo(
              check.bankAccountId, companyId, modo, -amountNum, tx
            );

            await tx.insert(bankTransactions).values({
              id: uuidv4(),
              companyId,
              // El movimiento pertenece al mismo entorno que el cheque que lo origina.
              modo: check.modo,
              bankAccountId: check.bankAccountId,
              date: fechaStr,
              type: 'withdrawal',
              amount: amountNum.toString(),
              reference: check.checkNumber,
              description: `Cobro de cheque en garantía #${check.checkNumber} - Beneficiario: ${check.payee}`,
              // Auditoria ARP-25: nacia 'reconciled' sin que nadie lo hubiera
              // cotejado contra un estado de cuenta, de modo que la conciliacion
              // bancaria no podia detectar nunca un movimiento que no ocurrio.
              status: 'pending',
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }

        // 5. Create Ledger entry
        const description = `Cobro de cheque en garantía #${check.checkNumber} - Proveedor ${item.supplierName}`;
        
        await AccountRepository.createJournalEntry(tx, {
          companyId,
          modo,
          reference: payment.id,
          date: fecha,
          description,
          createdBy: createdBy || null,
          lines: [
            {
              accountId: payment.debitAccountId,
              debit: amountNum,
              credit: 0,
            },
            {
              accountId: payment.creditAccountId,
              debit: 0,
              credit: amountNum,
            }
          ]
        });

        appliedCount++;
        totalAppliedAmount += amountNum;
      }

      return {
        appliedCount,
        totalAppliedAmount,
        descuadres,
        noAplicados,
      };
    });
  }

  /**
   * Confirma el cobro de UN cheque en garantia.
   *
   * Este camino siempre fue deliberado -- una persona elige el cheque y pulsa
   * "Aplicar" -- asi que su problema no era el automatismo sino la fecha: se
   * asentaba con la del servidor en vez de con la que el banco pago el cheque.
   * Ahora `fechaCobro` viaja hasta el asiento, el movimiento bancario y
   * `cleared_date`. Auditoria ARP-25.
   */
  static async applySingleGuaranteeCheck(
    companyId: string,
    checkId: string,
    modo: 'PRODUCCION' | 'PRUEBA',
    fechaCobro?: string,
    createdBy?: string
  ) {
    const fecha = ApService.validarFechaDeCobro(fechaCobro);
    const fechaStr = fecha.toISOString().split('T')[0];

    return await db.transaction(async (tx) => {
      // 1. Get the check
      // Aislamiento de entorno: un cheque de PRUEBA no debe aplicarse desde PRODUCCION.
      const [check] = await tx
        .select()
        .from(checks)
        .where(and(
          eq(checks.id, checkId),
          eq(checks.companyId, companyId),
          ...(modo ? [eq(checks.modo, modo)] : [])
        ));

      if (!check) {
        throw new Error('Cheque en garantía no encontrado.');
      }

      if (check.status !== 'pending' || !check.isGuarantee) {
        throw new Error('El cheque no es un cheque en garantía pendiente o ya ha sido procesado.');
      }

      if (!check.apId) {
        throw new Error('El cheque en garantía no está asociado a una cuenta por pagar.');
      }

      // 2. Get the payment
      const [payment] = await tx
        .select()
        .from(apPayments)
        .where(and(eq(apPayments.checkId, checkId), eq(apPayments.companyId, companyId)));

      if (!payment) {
        throw new Error('Registro de pago asociado al cheque no encontrado.');
      }

      // 3. Get the accounts payable
      //
      // Auditoria ARP-13: se leia sin bloqueo, de modo que esta ruta y la
      // aplicacion masiva podian descargar el mismo saldo a la vez.
      const ap = await ApRepository.bloquearAp(tx, check.apId, companyId, modo);

      if (!ap) {
        throw new Error('Cuenta por pagar asociada no encontrada.');
      }

      const amountNum = parseFloat(payment.amount);
      const apBalance = parseFloat(ap.balance);

      // El importe del cheque puede superar lo que queda por pagar. Antes se
      // recortaba con Math.max(0, ...) y el descuadre desaparecia; ahora se
      // devuelve para que quede a la vista de quien lo aplica.
      const aplicado = Math.min(amountNum, apBalance);
      const descuadre = aplicado < amountNum
        ? { cheque: check.checkNumber, importeCheque: amountNum, saldoDisponible: apBalance }
        : null;

      // 4. Update check status to cleared
      //
      // Auditoria ARP-13: el UPDATE exige que el cheque siga pendiente. Si otro
      // proceso lo cobro primero, no se actualiza ninguna fila y se aborta en
      // vez de aplicarlo dos veces.
      // clearedDate = fecha real de cobro; es la que usa el historial de cheques aplicados.
      const loCobreYo = await ApRepository.marcarChequeCobrado(tx, check.id, companyId, fechaStr);
      if (!loCobreYo) {
        throw new Error('El cheque ya fue cobrado por otro proceso.');
      }

      // 5. Update payment status to applied
      await ApRepository.marcarPagoAplicado(tx, payment.id, companyId);

      // 6. Update accounts payable balance
      await ApRepository.updateApBalance(tx, ap.id, companyId, apBalance - aplicado);

      // Financial movements registration (Suplidores - Aplicación de Cheque)
      await FinancialMovementService.registerMovement(tx, {
        companyId: companyId,
        modo,
        entityType: 'supplier',
        supplierId: ap.supplierId,
        date: fecha,
        movementType: 'payment',
        documentId: payment.id,
        documentNumber: check.checkNumber,
        originModule: 'bank',
        debit: amountNum,
        credit: 0,
        notes: `Cobro confirmado de cheque en garantía #${check.checkNumber}`,
      });

      // 7. Update bank account balance and create bank transaction
      if (check.bankAccountId) {
        const [bankAcc] = await tx
          .select()
          .from(bankAccounts)
          .where(and(eq(bankAccounts.id, check.bankAccountId), eq(bankAccounts.companyId, companyId)));

        if (bankAcc) {
          // Ver el comentario del otro cobro de cheque, mas arriba.
          await BankRepository.ajustarSaldo(
            check.bankAccountId, companyId, modo, -amountNum, tx
          );

          await tx.insert(bankTransactions).values({
            id: uuidv4(),
            companyId,
            // El movimiento pertenece al mismo entorno que el cheque que lo origina.
            modo: check.modo,
            bankAccountId: check.bankAccountId,
            date: fechaStr,
            type: 'withdrawal',
            amount: amountNum.toString(),
            reference: check.checkNumber,
            description: `Cobro de cheque en garantía #${check.checkNumber} - Beneficiario: ${check.payee}`,
            // Auditoria ARP-25: ver el comentario del otro camino. Un movimiento
            // no puede nacer conciliado; lo concilia una persona con el estado
            // de cuenta.
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      // 8. Create Ledger entry
      const description = `Cobro de cheque en garantía #${check.checkNumber} - Beneficiario: ${check.payee}`;
      
      await AccountRepository.createJournalEntry(tx, {
        companyId,
        modo,
        reference: payment.id,
        date: fecha,
        description,
        createdBy: createdBy || null,
        lines: [
          {
            accountId: payment.debitAccountId,
            debit: amountNum,
            credit: 0,
          },
          {
            accountId: payment.creditAccountId,
            debit: 0,
            credit: amountNum,
          }
        ]
      });

      return {
        appliedCount: 1,
        totalAppliedAmount: amountNum,
        descuadres: descuadre ? [descuadre] : [],
      };
    });
  }
}
