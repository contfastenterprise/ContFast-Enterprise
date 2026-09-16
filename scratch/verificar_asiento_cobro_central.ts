/**
 * El asiento de un recibo de cobro pasa por el motor central
 * (`createJournalEntry`), y con el por la validacion de periodo abierto.
 *
 * EL HUECO (lote 152)
 * -------------------
 * `ArRepository.registerReceipt` insertaba su asiento a mano: sin cuadre, sin
 * validacion por linea ni de cuentas y, sobre todo, sin periodo abierto.
 * Medido el 2026-09-16: julio de Latin Doors (PRODUCCION) esta cerrado desde
 * el 01/08; un cobro fechado en julio se asentaba dentro igual. Ninguno lo hizo
 * todavia (los 8 de julio son anteriores al cierre).
 *
 * Se EJECUTA el motor contra una transaccion falsa (sin base) para fijar lo que
 * el recibo hereda; el cableado del recibo se lee.
 */
import { fuente, bloque } from './_fuente';

process.env.DATABASE_URL = 'postgres://banco:banco@127.0.0.1:1/banco_sin_base';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

/** Una transaccion que no encuentra periodo abierto y apunta si alguien inserta. */
function txSinPeriodo() {
  const insertados: unknown[] = [];
  const consulta = { from: () => consulta, where: () => consulta, limit: async () => [], then: undefined };
  const tx = {
    select: () => consulta,
    insert: (tabla: unknown) => { insertados.push(tabla); return { values: () => ({ returning: async () => [{}] }) }; },
  };
  return { tx, insertados };
}

async function main() {
  const AR = fuente('src/repositories/arRepository.ts');
  const cobro = (() => {
    const i = AR.indexOf('static async registerReceipt(');
    const j = AR.indexOf('static async ', i + 10);
    return i < 0 ? '' : AR.slice(i, j < 0 ? undefined : j);
  })();

  console.log('\n0) Precondiciones\n');
  exige('el cobro sigue siendo una transaccion que inserta el recibo y resuelve caja/banco y CxC',
    cobro.includes('return await db.transaction(async (tx) => {') && cobro.includes('.insert(customerReceipts)')
    && cobro.includes('const accCaja =') && cobro.includes('const accCxC ='));
  {
    const { AccountRepository } = await import('../src/repositories/accountRepository');
    const { tx, insertados } = txSinPeriodo();
    let mensaje = '';
    try {
      await AccountRepository.createJournalEntry(tx as never, {
        companyId: 'c', modo: 'PRODUCCION', date: '2026-07-15', description: 'x', reference: 'r',
        lines: [{ accountId: 'a', debit: 10, credit: 0 }, { accountId: 'b', debit: 0, credit: 10 }],
      });
    } catch (e) { mensaje = (e as Error).message; }
    exige('el motor central niega un asiento sin periodo abierto, sin insertar nada',
      /No hay un período contable abierto para la fecha 2026-07-15/.test(mensaje) && insertados.length === 0, mensaje);
    let descuadre = '';
    try {
      await AccountRepository.createJournalEntry(txSinPeriodo().tx as never, {
        companyId: 'c', modo: 'PRODUCCION', date: '2026-09-15', description: 'x',
        lines: [{ accountId: 'a', debit: 10, credit: 0 }, { accountId: 'b', debit: 0, credit: 9 }],
      });
    } catch (e) { descuadre = (e as Error).message; }
    exige('y uno descuadrado', /descuadrado/.test(descuadre), descuadre);
  }

  console.log('\n1) El recibo asienta por el motor, dentro de su transaccion\n');
  const llamada = bloque(cobro, 'await AccountRepository.createJournalEntry(tx, {');
  ok('llama a createJournalEntry pasandole la transaccion del cobro',
    llamada.length > 0 && /import \{ AccountRepository \} from '@\/repositories\/accountRepository';/.test(AR));
  ok('ya no inserta cabecera ni renglones de asiento a mano',
    !/\.insert\(journalEntries\)/.test(AR) && !/\.insert\(journalEntryLines\)/.test(AR));
  ok('asienta despues de insertar el recibo (si el periodo esta cerrado, todo se deshace junto)',
    cobro.indexOf('.insert(customerReceipts)') > 0 && cobro.indexOf('.insert(customerReceipts)') < cobro.indexOf('AccountRepository.createJournalEntry(tx, {'));

  console.log('\n2) Lo que lleva el asiento\n');
  ok('empresa, modo y la fecha del cobro (la que valida el periodo)',
    /companyId: data\.companyId,/.test(llamada) && /modo: data\.modo,/.test(llamada) && /date: data\.date,/.test(llamada));
  ok('la referencia es el id COMPLETO del recibo', /reference: receiptId,/.test(llamada));
  ok('y quien lo registra', /createdBy: data\.userId,/.test(llamada));
  ok('debe a caja o banco, haber a CxC, por el importe del cobro',
    /lines: \[\s*\{ accountId: accCaja\.id, debit: data\.amount, credit: 0 \},\s*\{ accountId: accCxC\.id, debit: 0, credit: data\.amount \},\s*\]/.test(llamada));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
