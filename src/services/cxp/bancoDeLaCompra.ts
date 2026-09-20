/**
 * Que una compra pagada por banco se vea en el LIBRO de ese banco.
 *
 * POR QUE EXISTE (lote 170)
 * -------------------------
 * Mismo principio que el lote 169 con la caja, y el mismo criterio que el 151
 * (cobros) y el 163 (pagos a suplidor): lo que la operacion cambia en el mayor
 * de la cuenta del banco se mueve igual en el modulo de bancos -- saldo y
 * libro --, y el movimiento nace PENDIENTE de conciliar, porque conciliar es
 * cotejarlo con el estado de cuenta y eso no lo hace el codigo que lo crea
 * (ARP-25).
 *
 * Se mide la DIFERENCIA (antes y despues de la operacion), asi que editar una
 * compra anterior a este lote sin tocar lo pagado no mueve nada, y editarla
 * cambiando el importe mueve solo lo que cambio.
 */
import { v4 as uuidv4 } from 'uuid';
import { bankTransactions } from '@/db/schema';
import type { DbTransaction } from '@/db';
import { BankRepository } from '@/repositories/bankRepository';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

const centavos = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) : 0);

/**
 * Apunta en el banco el cambio que una compra hizo en el mayor de su cuenta.
 * Negativo (el mayor acredito el banco): sale dinero -> retiro. Positivo (una
 * reversion): vuelve -> deposito. Cero: nada.
 */
export async function reflejarEnBancoDeCompra(tx: DbTransaction, datos: {
  companyId: string;
  modo: ModoOperativo;
  bankAccountId: string;
  referencia: string;
  descripcion: string;
  fecha: string;
  cambioEnCuenta: number;
}): Promise<void> {
  const c = centavos(datos.cambioEnCuenta);
  if (c === 0) return;
  const monto = Math.abs(c) / 100;

  await BankRepository.ajustarSaldo(datos.bankAccountId, datos.companyId, datos.modo, c / 100, tx);
  await tx.insert(bankTransactions).values({
    id: uuidv4(),
    companyId: datos.companyId,
    modo: datos.modo,
    bankAccountId: datos.bankAccountId,
    date: datos.fecha,
    type: c < 0 ? 'withdrawal' : 'deposit',
    amount: monto.toString(),
    reference: datos.referencia,
    description: datos.descripcion,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
