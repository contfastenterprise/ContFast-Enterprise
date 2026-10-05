/**
 * Lote 295: pagar una nomina aprobada, contra la base. La regla (que se
 * admite, que asienta) es pura y vive en `pagoDeNomina.ts`; aqui se lee, se
 * resuelven las cuentas y se escribe, TODO en una transaccion y con la nomina
 * bloqueada (`for update`).
 *
 * Las piezas son las de las compras y los pagos a suplidores, no una copia:
 *  - el banco se valida con `resolverOrigenDeCompra` (lote 170): que sea de la
 *    empresa y tenga cuenta contable, y el haber del asiento es ESA cuenta;
 *  - el retiro queda en el libro de ese banco, pendiente de conciliar, con
 *    `reflejarEnBancoDeCompra` (lotes 151, 163 y 170);
 *  - el efectivo sale de la sesion de caja abierta con `reflejarEnCaja`
 *    (lote 169), y sin caja abierta se niega;
 *  - lo que se mueve en el banco o la caja es lo que el asiento cambio en el
 *    mayor de esa cuenta (`efectoEnCuentaDeDocumento`), no un importe
 *    calculado por otro camino;
 *  - el asiento va por `createJournalEntry` (lote 152), fechado el dia del pago.
 *
 * Todo lo que puede negarse se comprueba ANTES de escribir la primera fila,
 * con un 409 (`NominaNoPermitidaError`) que dice que hacer. Si algo falla
 * despues, la transaccion entera se deshace: ni pago, ni asiento, ni retiro,
 * ni movimiento de caja, ni estado `paid` a medias.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, accountingMappings, auditLogs, journalEntries, payrollDetails, payrolls, type DbOTx } from '@/db';
import { AccountingRepository } from '@/repositories/accountingRepository';
import { cuentaDelSistema } from '@/services/accounting/cuentasDelSistema';
import { resolverCuentaPorMapeo } from '@/services/accounting/resolverCuentas';
import { efectoEnCajaDeDocumento, reflejarEnCaja, sesionParaEfectivo } from '@/services/caja/efectivoDeCaja';
import { efectoEnCuentaDeDocumento } from '@/services/contabilidad/efectoEnCuenta';
import { reflejarEnBancoDeCompra } from '@/services/cxp/bancoDeLaCompra';
import { resolverOrigenDeCompra } from '@/services/cxp/resolverOrigenDeCompra';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { asientoDeLaNomina, type AsientoDeLaNomina } from '@/services/nomina/asentarNomina';
import { etiquetaDeClave, motivoDeCuentasFaltantes } from '@/services/nomina/asientoDeNomina';
import { NominaNoPermitidaError } from '@/services/nomina/estadoDeNomina';
import {
  MOTIVO_SIN_TABLA_DE_PAGOS,
  descripcionDelPago,
  lineasDelPago,
  motivoDevengoNoCuadra,
  motivoParaNoPagar,
  motivoPeriodoDelPago,
  netoEnCentavos,
  referenciaDelRetiro,
  saleDelBanco,
  type PagoValidado,
} from '@/services/nomina/pagoDeNomina';

/** Un error de la peticion (400): el formulario viene mal, no el estado de la nomina. */
export class PeticionDePagoInvalida extends Error {
  readonly status = 400;
}

let tablaVista = false;
/** Si la base tiene `pagos_de_nomina` (migracion 0021). Recuerda haberla visto. */
export async function hayTablaDePagos(tx: DbOTx = db): Promise<boolean> {
  if (tablaVista) return true;
  const filas = (await tx.execute(sql`SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pagos_de_nomina' LIMIT 1`)) as unknown as unknown[];
  tablaVista = filas.length > 0;
  return tablaVista;
}

/** Solo para los bancos: olvidar que la tabla se vio (para simular la base sin la 0021). */
export function olvidarTablaDePagos() {
  tablaVista = false;
}

export interface PagoRegistrado {
  id: string;
  asientoId: string;
  fecha: string;
  monto: number;
  metodo: PagoValidado['metodo'];
}

/**
 * Paga la nomina. Lanza `NominaNoPermitidaError` (409) cuando no se puede,
 * sin haber escrito nada; `Error` con `status` 404 si la nomina no existe.
 */
export async function pagarNomina(
  payrollId: string,
  companyId: string,
  modo: ModoOperativo,
  userId: string,
  pago: PagoValidado,
): Promise<PagoRegistrado> {
  return db.transaction(async (tx) => {
    // 0. Sin la tabla no hay donde guardar el pago: 409 nombrando la migracion.
    if (!(await hayTablaDePagos(tx))) throw new NominaNoPermitidaError(MOTIVO_SIN_TABLA_DE_PAGOS);

    // 1. La nomina, bloqueada: dos pagos a la vez no pasan los dos la guarda
    //    (el segundo espera, y al leer ya la ve `paid`). Detras queda el UNIQUE
    //    de `payroll_id` en la tabla: sin el bloqueo, el segundo chocaria ahi
    //    (un 500 en vez del 409 que explica). Mutante anotado: quitar el
    //    `for update` no lo ve el banco de integracion con un pool pequeño
    //    (las dos peticiones se serializan); lo vigila el banco de codigo.
    const [nomina] = await tx
      .select()
      .from(payrolls)
      .where(and(eq(payrolls.id, payrollId), eq(payrolls.companyId, companyId), eq(payrolls.modo, modo), isNull(payrolls.deletedAt)))
      .limit(1)
      .for('update');
    if (!nomina) throw Object.assign(new Error('Nómina no encontrada'), { status: 404 });

    // 2. Aprobada y con su asiento de devengo (lote 293).
    const [devengo] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.companyId, companyId),
        eq(journalEntries.modo, modo),
        eq(journalEntries.reference, nomina.id),
        isNull(journalEntries.deletedAt),
      ))
      .limit(1);
    const noPagar = motivoParaNoPagar(nomina.status, Boolean(devengo));
    if (noPagar) throw new NominaNoPermitidaError(noPagar);

    // 3. El neto: lo que guardo el detalle al calcularse.
    const detalles = await tx
      .select({ netSalary: payrollDetails.netSalary })
      .from(payrollDetails)
      .where(and(eq(payrollDetails.payrollId, nomina.id), eq(payrollDetails.companyId, companyId), eq(payrollDetails.modo, modo)));
    const neto = netoEnCentavos(detalles);

    // 4. Sueldos por pagar: ENLAZADA en Cuentas Puente (como en el devengo, no
    //    se cae al codigo por defecto), y con el neto que dejo el devengo.
    const [mapeo] = await tx
      .select({ clave: accountingMappings.mappingKey })
      .from(accountingMappings)
      .where(and(eq(accountingMappings.companyId, companyId), eq(accountingMappings.mappingKey, 'payroll_salaries_payable')))
      .limit(1);
    const faltan = motivoDeCuentasFaltantes(mapeo ? [] : ['payroll_salaries_payable']);
    if (faltan) throw new NominaNoPermitidaError(faltan.replace('No se puede aprobar la nómina', 'No se puede pagar la nómina'));
    let sueldosPorPagar: string;
    try {
      sueldosPorPagar = (await resolverCuentaPorMapeo(
        tx, companyId, 'payroll_salaries_payable', cuentaDelSistema('payroll_salaries_payable').codigo,
        `Nómina, cuenta "${etiquetaDeClave('payroll_salaries_payable')}"`,
      )).id;
    } catch (e) {
      throw new NominaNoPermitidaError(`No se puede pagar la nómina: ${(e as Error).message} Corríjalo en Configuración > Cuentas Puente (bloque Nómina).`);
    }
    const devengoCuadra = motivoDevengoNoCuadra(
      await efectoEnCuentaDeDocumento(tx, companyId, modo, nomina.id, sueldosPorPagar),
      neto,
    );
    if (devengoCuadra) throw new NominaNoPermitidaError(devengoCuadra);

    // 5. De donde sale: el banco con la regla de las compras (02 = cheque,
    //    transferencia o deposito), o la caja con su sesion abierta.
    let cuentaOrigen: string;
    let sesionDeCaja: string | null = null;
    if (saleDelBanco(pago.metodo)) {
      try {
        const origen = await resolverOrigenDeCompra(tx, companyId, '02', { bankAccountId: pago.bankAccountId });
        cuentaOrigen = origen.cuentaQueAcredita as string;
      } catch (e) {
        throw new NominaNoPermitidaError((e as Error).message.replace('la compra', 'el pago de la nómina'));
      }
    } else {
      try {
        cuentaOrigen = (await resolverCuentaPorMapeo(tx, companyId, 'cash', cuentaDelSistema('cash').codigo, 'Caja General')).id;
        sesionDeCaja = await sesionParaEfectivo(tx, companyId, modo, userId);
      } catch (e) {
        throw new NominaNoPermitidaError((e as Error).message);
      }
    }

    // 6. Las lineas, y el periodo del dia del pago.
    const asiento = lineasDelPago(neto, sueldosPorPagar, cuentaOrigen);
    if (!asiento.ok) throw new NominaNoPermitidaError(asiento.motivo);
    if (!(await AccountingRepository.isPeriodOpen(companyId, pago.fecha, modo, tx))) {
      throw new NominaNoPermitidaError(motivoPeriodoDelPago(pago.fecha));
    }

    // ── A partir de aqui se escribe. ─────────────────────────────────────
    const pagoId = uuidv4();
    const descripcion = descripcionDelPago(nomina.periodStart, nomina.periodEnd, nomina.frequency, pago.metodo, pago.referencia);
    await tx.execute(sql`INSERT INTO pagos_de_nomina
      (id, company_id, modo, payroll_id, fecha, metodo, bank_account_id, cash_session_id, referencia, monto, created_by)
      VALUES (${pagoId}::uuid, ${companyId}::uuid, ${modo}::environment_mode, ${nomina.id}::uuid, ${pago.fecha}::date, ${pago.metodo},
              ${pago.bankAccountId}::uuid, ${sesionDeCaja}::uuid, ${pago.referencia}, ${asiento.total.toFixed(2)}::numeric, ${userId}::uuid)`);

    const entry = await AccountingRepository.createJournalEntry(tx, {
      companyId,
      modo,
      reference: pagoId,
      date: pago.fecha,
      description: descripcion,
      createdBy: userId,
      lines: asiento.lineas,
    });
    await tx.execute(sql`UPDATE pagos_de_nomina SET journal_entry_id = ${entry.id}::uuid WHERE id = ${pagoId}::uuid`);

    if (pago.bankAccountId) {
      await reflejarEnBancoDeCompra(tx, {
        companyId,
        modo,
        bankAccountId: pago.bankAccountId,
        referencia: referenciaDelRetiro(pago.metodo, pago.referencia, pagoId),
        descripcion,
        fecha: pago.fecha,
        cambioEnCuenta: await efectoEnCuentaDeDocumento(tx, companyId, modo, pagoId, cuentaOrigen),
      });
    } else {
      await reflejarEnCaja(tx, {
        companyId,
        modo,
        userId,
        referencia: pagoId,
        descripcion,
        cambioEnCaja: await efectoEnCajaDeDocumento(tx, companyId, modo, pagoId),
      });
    }

    await tx
      .update(payrolls)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(and(eq(payrolls.id, nomina.id), eq(payrolls.companyId, companyId), eq(payrolls.modo, modo)));

    await tx.insert(auditLogs).values({
      companyId,
      modo,
      userId,
      action: 'pay_payroll',
      entityType: 'payrolls',
      entityId: nomina.id,
      oldValues: { status: nomina.status },
      newValues: {
        status: 'paid',
        pago: pagoId,
        asiento: entry.id,
        fecha: pago.fecha,
        metodo: pago.metodo,
        bankAccountId: pago.bankAccountId,
        referencia: pago.referencia,
        monto: asiento.total,
      },
      ipAddress: 'System',
    });

    return { id: pagoId, asientoId: entry.id, fecha: pago.fecha, monto: asiento.total, metodo: pago.metodo };
  });
}

export interface PagoDeLaNomina {
  id: string;
  fecha: string;
  metodo: PagoValidado['metodo'];
  referencia: string | null;
  monto: number;
  banco: string | null;
  autor: string | null;
  asiento: AsientoDeLaNomina | null;
}

/**
 * El pago de una nomina, para la pantalla. `null` si no tiene, o si la base no
 * tiene la tabla (sin la 0021 no hay pagos: leer nunca lanza por eso).
 */
export async function pagoDeLaNomina(payrollId: string, companyId: string, modo: ModoOperativo): Promise<PagoDeLaNomina | null> {
  if (!(await hayTablaDePagos())) return null;
  const filas = (await db.execute(sql`
    SELECT p.id::text AS id, p.fecha::text AS fecha, p.metodo, p.referencia, p.monto::text AS monto,
           CASE WHEN b.id IS NULL THEN NULL ELSE b.bank_name || ' ' || b.account_number END AS banco,
           u.name AS autor
    FROM pagos_de_nomina p
    LEFT JOIN bank_accounts b ON b.id = p.bank_account_id AND b.company_id = p.company_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.payroll_id = ${payrollId}::uuid AND p.company_id = ${companyId}::uuid AND p.modo = ${modo}::environment_mode
    LIMIT 1`)) as unknown as Array<{ id: string; fecha: string; metodo: PagoValidado['metodo']; referencia: string | null; monto: string; banco: string | null; autor: string | null }>;
  const f = filas[0];
  if (!f) return null;
  return {
    id: f.id,
    fecha: f.fecha,
    metodo: f.metodo,
    referencia: f.referencia,
    monto: Number(f.monto),
    banco: f.banco,
    autor: f.autor,
    // El asiento del pago lleva `reference = id del pago`: el mismo lector del devengo.
    asiento: await asientoDeLaNomina(f.id, companyId, modo),
  };
}
