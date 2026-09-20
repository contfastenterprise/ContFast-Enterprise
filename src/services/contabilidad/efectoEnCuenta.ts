/**
 * El efecto de un documento sobre UNA cuenta del mayor: su asiento y las
 * reversiones de ese asiento, en debe menos haber.
 *
 * POR QUE EXISTE. Lo estreno el lote 169 para la caja (`efectivoDeCaja.ts`) y
 * lo necesita igual el lote 170 para el banco: cuando una compra se edita o se
 * borra, lo que hay que mover en el modulo (caja o banco) es exactamente lo
 * que la operacion cambio en el mayor de esa cuenta -- ni el importe nuevo ni
 * el viejo, la DIFERENCIA. Midiendolo asi, una compra anterior a estos lotes
 * que se edita sin tocar lo pagado no mueve nada.
 *
 * Un documento se reconoce por `journal_entries.reference = documentoId`, y su
 * reversion por `reference = id del asiento original` (lo que hace
 * `revertirAsientoContable`).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { journalEntries, journalEntryLines } from '@/db/schema';
import type { DbTransaction } from '@/db';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

export async function efectoEnCuentaDeDocumento(
  tx: DbTransaction,
  companyId: string,
  modo: ModoOperativo,
  documentoId: string,
  accountId: string,
): Promise<number> {
  const propios = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.modo, modo),
      eq(journalEntries.reference, documentoId),
    ));
  const referencias = [documentoId, ...propios.map((a) => a.id)];

  const [fila] = await tx
    .select({ neto: sql<string>`coalesce(sum(${journalEntryLines.debit} - ${journalEntryLines.credit}), 0)` })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.modo, modo),
      inArray(journalEntries.reference, referencias),
      eq(journalEntryLines.accountId, accountId),
    ));
  return Number(fila?.neto ?? 0);
}
