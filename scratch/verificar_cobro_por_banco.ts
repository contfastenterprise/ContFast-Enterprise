/**
 * Un cobro que no es en efectivo lleva su cuenta bancaria, se asienta contra
 * ESE banco y deja el deposito en el libro de banco.
 *
 * EL CASO REAL (lote 151)
 * -----------------------
 * Latin Doors, PRODUCCION, medido el 2026-09-16: 6 cobros por banco
 * (RD$186.093,77, del 15/07 al 11/09) debitaron 1.1.01 "Efectivo en Caja y
 * Bancos" igual que los 16 en efectivo, sin decir que banco, sin movimiento en
 * el libro de banco y sin mover el saldo.
 *
 * Se EJECUTA la regla; el cableado se lee. LO QUE NO PRUEBA: el cobro contra
 * la base (necesita una base desechable, la deuda de los bancos de integracion).
 */
import fs from 'fs';
import { fuente } from './_fuente';

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
const bloque = (src: string, ancla: string): string => {
  const i = src.indexOf(ancla);
  if (i < 0) return '';
  const j = src.indexOf(') {', i) + 2;
  let n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return '';
};
const leer = (ruta: string) => (fs.existsSync(ruta) ? fuente(ruta) : '');

async function main() {
  const REPO = fuente('src/repositories/arRepository.ts');
  const RUTA = fuente('src/app/api/v1/ar/receipts/route.ts');
  const PANTALLA = fuente('src/app/dashboard/receivables/page.tsx');

  console.log('\n0) Precondiciones\n');
  const cobro = bloque(REPO, 'static async registerReceipt(');
  exige('el cobro sigue insertando recibo y renglones de asiento en una transaccion',
    //  (Lote 152: el asiento paso de insertarse a mano a `createJournalEntry`.)
    cobro.includes('return await db.transaction(async (tx) => {') && cobro.includes('.insert(customerReceipts)')
    && (cobro.includes('.insert(journalEntryLines)') || cobro.includes('AccountRepository.createJournalEntry(tx, {')));
  exige('la ruta sigue pasando el cuerpo validado al repositorio', /ArRepository\.registerReceipt\(\{\s*\.\.\.parsed\.data,/.test(RUTA));

  let m: typeof import('../src/services/cartera/cuentaDelCobro') | null = null;
  try { m = await import('../src/services/cartera/cuentaDelCobro'); } catch { m = null; }
  // Lote 172: la regla pide tambien la CONSTANCIA (el numero de la
  // transferencia o del cheque). Aqui se le pasa una por defecto: lo que este
  // banco vigila es la cuenta bancaria, no la constancia -- de esa se ocupa
  // `verificar_arqueo_de_caja.ts`.
  const motivo = (metodo: string, cuenta: string | null, constancia: string | null = 'TRF-1') =>
    m?.motivoParaNoRegistrarCobro(metodo, cuenta, constancia);

  console.log('\n1) La regla\n');
  ok('cobro por banco sin cuenta: se niega', !!m && typeof motivo('bank', null) === 'string');
  ok('cheque y tarjeta sin cuenta: se niegan', !!m && typeof motivo('check', null) === 'string' && typeof motivo('card', '') === 'string');
  ok('cobro por banco con cuenta: pasa', !!m && motivo('bank', 'b1') === null);
  ok('efectivo sin cuenta: pasa', !!m && motivo('cash', null) === null);
  ok('efectivo CON cuenta bancaria: se niega (no va a la caja y al banco a la vez)', !!m && typeof motivo('cash', 'b1') === 'string');
  ok('entra por banco todo lo que no es efectivo',
    !!m && !m.entraPorBanco('cash') && m.entraPorBanco('bank') && m.entraPorBanco('check') && m.entraPorBanco('card'));
  ok('los metodos de la API son los de siempre', !!m && JSON.stringify(m.METODOS_DE_COBRO) === JSON.stringify(['cash', 'bank', 'check', 'card']));

  console.log('\n2) El cobro en el repositorio\n');
  const iRecibo = cobro.indexOf('.insert(customerReceipts)');
  ok('niega antes de insertar el recibo',
    // Tolerante a la lista de argumentos: el lote 172 le añadio la constancia
    // y esta comprobacion, que copiaba la llamada entera, fallo sin que faltara
    // nada. Lo que vigila es que la regla se aplique y se lance antes de escribir.
    /const motivoCuenta = motivoParaNoRegistrarCobro\([^)]*data\.bankAccountId[^)]*\);\s*if \(motivoCuenta\) throw new Error\(motivoCuenta\);/.test(cobro)
    && cobro.indexOf('if (motivoCuenta) throw') > 0 && cobro.indexOf('if (motivoCuenta) throw') < iRecibo);
  ok('resuelve la cuenta del banco (empresa, activa, con cuenta contable) antes de insertar',
    /const cuentaDelBanco = entraPorBanco\(data\.paymentMethod\)\s*\?\s*await resolverCuentaDeBanco\(tx, data\.companyId, data\.bankAccountId as string, 'Recibo de cobro'\)\s*:\s*null;/.test(cobro)
    && cobro.indexOf('const cuentaDelBanco') < iRecibo);
  ok('guarda en el recibo la cuenta bancaria',
    /\.insert\(customerReceipts\)\.values\(\{[^}]*bankAccountId: cuentaDelBanco \? data\.bankAccountId : null,/.test(cobro));
  {
    const dep = cobro.slice(cobro.indexOf('if (cuentaDelBanco && data.bankAccountId) {'));
    ok('deposita: sube el saldo del banco en el entorno del cobro',
      cobro.includes('if (cuentaDelBanco && data.bankAccountId) {')
      && /^if \(cuentaDelBanco && data\.bankAccountId\) \{\s*await BankRepository\.ajustarSaldo\(data\.bankAccountId, data\.companyId, data\.modo, data\.amount, tx\);/.test(dep));
    ok('y deja el deposito en el libro de banco, pendiente de conciliar',
      /\.insert\(bankTransactions\)\.values\(\{\s*id: uuidv4\(\),\s*companyId: data\.companyId,\s*modo: data\.modo,\s*bankAccountId: data\.bankAccountId,\s*date: data\.date,\s*type: 'deposit',\s*amount: data\.amount\.toString\(\),/.test(dep)
      && /status: 'pending',/.test(dep.slice(0, dep.indexOf('});') + 3)));
  }
  ok('el asiento debita la cuenta del banco; solo el efectivo debita la caja',
    /const accCaja = cuentaDelBanco\s*\?\?\s*await resolverCuentaPorMapeo\(tx, data\.companyId, 'cash', '1\.1\.01\.01', 'Recibo de Cobro - Efectivo'\);/.test(cobro)
    && /accountId: accCaja\.id,\s*debit: data\.amount(\.toString\(\))?,/.test(cobro));
  ok('sin un segundo asiento: no pasa por registerTransaction', cobro.includes('ajustarSaldo(') && !cobro.includes('registerTransaction('));

  console.log('\n3) La ruta, la tabla y la migracion\n');
  ok('la ruta acepta la cuenta bancaria y niega antes de abrir la transaccion',
    /bankAccountId: z\.string\(\)\.uuid\([^)]*\)\.optional\(\)\.nullable\(\),/.test(RUTA)
    && /paymentMethod: z\.enum\(METODOS_DE_COBRO\),/.test(RUTA)
    && /const motivoCuenta = motivoParaNoRegistrarCobro\([^)]*parsed\.data\.bankAccountId[^)]*\);\s*if \(motivoCuenta\) \{\s*return NextResponse\.json\(\s*\{ success: false, error: \{ code: 'VALIDATION_ERROR', message: motivoCuenta \} \},\s*\{ status: 400 \}/.test(RUTA)
    && RUTA.indexOf('if (motivoCuenta) {') < RUTA.indexOf('withIdempotency('));
  {
    const esquema = fuente('src/db/schema/accounting.ts');
    ok('la columna existe con FK compuesta a la cuenta bancaria de la misma empresa',
      /bankAccountId: uuid\('bank_account_id'\),/.test(esquema)
      && /columns: \[table\.bankAccountId, table\.companyId\],\s*foreignColumns: \[bankAccounts\.id, bankAccounts\.companyId\],\s*name: 'customer_receipts_bank_account_company_fk',\s*\}\)\.onDelete\('restrict'\)/.test(esquema));
    const mig = fs.existsSync('drizzle/0008_cobro_cuenta_bancaria.sql') ? fs.readFileSync('drizzle/0008_cobro_cuenta_bancaria.sql', 'utf8') : '';
    ok('la migracion añade la columna, la FK compuesta y el indice, y nada mas',
      /ALTER TABLE "customer_receipts" ADD COLUMN "bank_account_id" uuid;/.test(mig)
      && /FOREIGN KEY \("bank_account_id","company_id"\) REFERENCES "public"\."bank_accounts"\("id","company_id"\) ON DELETE restrict/.test(mig)
      && /CREATE INDEX "cust_receipts_bank_account_idx"/.test(mig)
      && (mig.match(/--> statement-breakpoint/g) || []).length === 2);
    ok('y esta en el diario de migraciones', /"tag": "0008_cobro_cuenta_bancaria"/.test(fs.readFileSync('drizzle/meta/_journal.json', 'utf8')));
  }

  console.log('\n4) Las cuentas para elegir, con el permiso de cobrar\n');
  {
    const cuentas = leer('src/app/api/v1/ar/receipts/cuentas-bancarias/route.ts');
    ok('la ruta pide cobros:write, no banco:read',
      /enforcePermission\(session\.userId, session\.role, session\.roleId, session\.companyId, 'cobros', 'write'\)/.test(cuentas)
      && /BankRepository\.cuentasParaCobrar\(session\.companyId\)/.test(cuentas) && !/'banco'/.test(cuentas));
    const lista = bloque(fuente('src/repositories/bankRepository.ts'), 'static async cuentasParaCobrar(');
    ok('solo cuentas de la empresa, activas, con cuenta contable, sin borrar, y sin saldos',
      /eq\(bankAccounts\.companyId, companyId\)/.test(lista) && /eq\(bankAccounts\.status, 'active'\)/.test(lista)
      && /\$\{bankAccounts\.chartAccountId\} IS NOT NULL/.test(lista) && /\$\{bankAccounts\.deletedAt\} IS NULL/.test(lista)
      && !/balance/i.test(lista));
  }

  console.log('\n5) La pantalla\n');
  ok('pide las cuentas a la ruta de cobros', PANTALLA.includes("fetch('/api/v1/ar/receipts/cuentas-bancarias')"));
  ok('enseña el selector cuando entra por banco y manda la cuenta',
    /\{entraPorBanco\(paymentForm\.paymentMethod\) && \(/.test(PANTALLA)
    && /bankAccountId: entraPorBanco\(paymentForm\.paymentMethod\) \? paymentForm\.bankAccountId : null,/.test(PANTALLA));
  ok('aplica la misma regla antes de enviar, y al pasar a efectivo quita la cuenta',
    // Igual que arriba: la llamada lleva desde el lote 172 un argumento mas.
    /motivoParaNoRegistrarCobro\([^)]*paymentForm\.bankAccountId[^)]*\)/.test(PANTALLA)
    && PANTALLA.search(/motivoParaNoRegistrarCobro\([^)]*paymentForm\.bankAccountId[^)]*\)/) < PANTALLA.indexOf("fetch('/api/v1/ar/receipts', {")
    && /bankAccountId: entraPorBanco\(val\) \? paymentForm\.bankAccountId : '',/.test(PANTALLA));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
