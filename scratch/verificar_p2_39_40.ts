import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════ P2-40: el libro diario se cortaba a 100 asientos sin decirlo ═══════════
// getJournalEntries devolvia solo las filas, ya cortadas por el limite, asi que la
// pantalla no tenia forma de saber que faltaban asientos: con un rango de mas de 100,
// los demas no aparecian y nadie se enteraba. Ahora devuelve tambien el total del
// rango, la ruta lo pasa en `meta` y la pantalla lo avisa.

{
  const src = crudo('src/repositories/accountingRepository.ts');
  ok(
    'accountingRepo: importa count',
    src.includes("import { eq, and, desc, sql, isNull, inArray, count } from 'drizzle-orm';")
  );
  ok(
    'accountingRepo: cuenta el total del mismo rango',
    src.includes(
      'const [totalRow] = await db\n      .select({ value: count() })\n      .from(journalEntries)\n      .where(and(...conditions));'
    )
  );
  ok(
    'accountingRepo: el caso vacio ya devuelve la forma nueva',
    src.includes('if (entries.length === 0) return { entries: [], total };')
  );
  ok('accountingRepo: devuelve { entries, total }', src.includes('return { entries: mapeados, total };'));
  ok('accountingRepo: ya no devuelve el array pelado', !src.includes('if (entries.length === 0) return [];'));
}

{
  const src = crudo('src/app/api/v1/accounting/journals/route.ts');
  ok(
    'ruta journals: el limite ya no esta cableado a 100 en la llamada',
    !src.includes('getJournalEntries(session.companyId, session.modo, 100, startDate, endDate)')
  );
  ok('ruta journals: el limite se puede pedir, acotado a 500', src.includes('Math.min(Math.max(limitPedido, 1), 500)'));
  ok(
    'ruta journals: la respuesta lleva total y bandera de truncado',
    src.includes('meta: { total, limit, truncado: total > entries.length }')
  );
}

{
  const src = crudo('src/app/dashboard/accounting/page.tsx');
  ok(
    'accounting: guarda la meta de los asientos',
    src.includes(
      'const [journalsMeta, setJournalsMeta] = useState<{ total: number; limit: number; truncado: boolean } | null>(null);'
    )
  );
  ok('accounting: la recoge al cargar', src.includes('setJournalsMeta(data.meta ?? null);'));
  ok(
    'accounting: avisa en pantalla cuando falta ver asientos',
    src.includes('{journalsMeta?.truncado && (') &&
      src.includes('asientos más recientes de') &&
      src.includes('Acota las fechas para ver el resto.')
  );
}

// ═══════════ P2-39: el libro de banco se traia entero y se filtraba en memoria ═══════════
// La ruta pedia TODOS los movimientos de la cuenta y aplicaba las fechas despues, en
// memoria: una cuenta con anos de historial se leia completa para ensenar un mes.
// Ahora las fechas van en el SQL y el limite es opcional -- sin limite se devuelve todo,
// que es lo que necesita la conciliacion bancaria.

{
  const src = crudo('src/repositories/bankRepository.ts');
  ok('bankRepo: importa count', src.includes("import { eq, and, sql, desc, inArray, count } from 'drizzle-orm';"));
  ok(
    'bankRepo: acepta fechas y limite',
    src.includes('opciones: { startDate?: string; endDate?: string; limit?: number } = {}')
  );
  ok(
    'bankRepo: las fechas van en el SQL',
    src.includes('conditions.push(sql`${bankTransactions.date} >= ${opciones.startDate}`);') &&
      src.includes('conditions.push(sql`${bankTransactions.date} <= ${opciones.endDate}`);')
  );
  ok(
    'bankRepo: el limite es opcional (sin limite se devuelve todo, lo necesita la conciliacion)',
    src.includes('const transactions = opciones.limit ? await consulta.limit(opciones.limit) : await consulta;')
  );
  ok('bankRepo: devuelve { transactions, total }', src.includes('return { transactions, total };'));
  ok("bankRepo: ya no hay dos ramas duplicadas para 'all'", !src.includes("if (bankAccountId === 'all') {"));
}

{
  const src = crudo('src/app/api/v1/bank/transactions/route.ts');
  ok(
    'ruta banco: ya no filtra por fecha en memoria',
    !src.includes('transactions = transactions.filter(t => t.date >= startDate);') &&
      !src.includes('transactions = transactions.filter(t => t.date <= endDate);')
  );
  ok(
    'ruta banco: pasa fechas y limite al repositorio',
    src.includes('{ startDate: startDate || undefined, endDate: endDate || undefined, limit }')
  );
  ok('ruta banco: el limite pedido se acota', src.includes('Math.min(Math.max(limitPedido, 1), 1000)'));
  ok(
    'ruta banco: la respuesta lleva total y bandera de truncado',
    src.includes('meta: { total, limit: limit ?? null, truncado: total > transactions.length },')
  );
}

{
  const src = crudo('src/app/dashboard/bank/page.tsx');
  ok(
    'bank: guarda la meta de movimientos',
    src.includes('const [txMeta, setTxMeta] = useState<{ total: number; truncado: boolean } | null>(null);')
  );
  ok('bank: la pantalla pide un limite en vez del libro entero', src.includes("params.append('limit', '500');"));
  ok('bank: recoge la meta al cargar', src.includes('setTxMeta(data.meta ?? null);'));
  ok(
    'bank: avisa en pantalla cuando falta ver movimientos',
    src.includes('{txMeta?.truncado && (') && src.includes('movimientos más recientes de')
  );
  ok(
    'bank: el reporte impreso se pide aparte y SIN limite',
    src.includes('const paramsReporte = new URLSearchParams({ accountId: selectedAccount.id });') &&
      src.includes('const todosLosMovimientos: BankTransaction[] = txData.data || [];')
  );
  ok(
    'bank: el reporte ya no se arma con lo que hay en pantalla',
    src.includes('const itemsToPrint = todosLosMovimientos.filter(tx => {') &&
      !src.includes('const itemsToPrint = transactions.filter(tx => {')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
