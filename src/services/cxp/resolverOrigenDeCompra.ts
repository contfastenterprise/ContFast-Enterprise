/**
 * El origen del pago de una compra, validado contra la base (lote 170).
 *
 * La REGLA vive en `origenDeLaCompra.ts`, que no toca la base porque la usa
 * tambien la pantalla. Aqui se buscan la cuenta bancaria y la cuenta contable
 * de la empresa, se aplica la regla y se devuelve la cuenta que acredita el
 * asiento. Nunca adivina: si algo no encaja, lanza con el motivo.
 */
import { and, eq } from 'drizzle-orm';
import { bankAccounts, chartOfAccounts } from '@/db/schema';
import type { DbTransaction } from '@/db';
import {
  cuentaQueAcredita,
  motivoCuentaDelOrigen,
  motivoParaNoRegistrarCompra,
  necesitaOrigen,
  type OrigenDePago,
} from '@/services/cxp/origenDeLaCompra';

export interface OrigenResuelto {
  /** La cuenta que acredita el asiento, o null si el metodo no lo usa. */
  cuentaQueAcredita: string | null;
  /** La cuenta bancaria, si sale de un banco (para el libro de banco). */
  bankAccountId: string | null;
}

export async function resolverOrigenDeCompra(
  tx: DbTransaction,
  companyId: string,
  paymentMethod: string,
  origen: OrigenDePago,
): Promise<OrigenResuelto> {
  const motivo = motivoParaNoRegistrarCompra(paymentMethod, origen);
  if (motivo) throw Object.assign(new Error(motivo), { status: 400 });
  if (!necesitaOrigen(paymentMethod)) return { cuentaQueAcredita: null, bankAccountId: null };

  const [banco] = origen.bankAccountId
    ? await tx
        .select({
          id: bankAccounts.id,
          chartAccountId: bankAccounts.chartAccountId,
          bankName: bankAccounts.bankName,
          accountNumber: bankAccounts.accountNumber,
        })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, origen.bankAccountId), eq(bankAccounts.companyId, companyId)))
    : [undefined];

  const [cuenta] = origen.paymentAccountId && !origen.bankAccountId
    ? await tx
        .select({
          id: chartOfAccounts.id,
          code: chartOfAccounts.code,
          name: chartOfAccounts.name,
          type: chartOfAccounts.type,
          isTransactional: chartOfAccounts.isTransactional,
          status: chartOfAccounts.status,
          deletedAt: chartOfAccounts.deletedAt,
        })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, origen.paymentAccountId), eq(chartOfAccounts.companyId, companyId)))
    : [undefined];

  const motivoCuenta = motivoCuentaDelOrigen(paymentMethod, origen, cuenta, banco);
  if (motivoCuenta) throw Object.assign(new Error(motivoCuenta), { status: 400 });

  const acredita = cuentaQueAcredita(origen, banco);
  if (!acredita) throw Object.assign(new Error('No se pudo determinar la cuenta del pago de la compra.'), { status: 400 });
  return { cuentaQueAcredita: acredita, bankAccountId: banco?.id ?? null };
}
