/**
 * Fase B -- P1-14 y P1-18.
 *
 * P1-14: admin/settings PATCH cambia dgiiEnv y credenciales de mSeller/DGII
 *        con los controles de autorizacion correctos, pero no dejaba rastro
 *        en audit_logs.
 * P1-18: clear-sandbox borraba invoices/quotes/deliveryNotes sin borrar antes
 *        sus tablas hijas (invoice_lines, invoice_taxes, invoice_retentions,
 *        quote_lines, quote_taxes, delivery_note_lines) ni las que las
 *        referencian con su propio companyId+modo (creditDebitNotes,
 *        dgiiSubmissions, cashMovements) -- fallaba siempre que hubiera
 *        facturas de PRUEBA con lineas, practicamente todas.
 *
 * Banco de solo-codigo.
 */
import { fuente, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n=== P1-14: admin/settings PATCH audita el cambio ===\n');

const settings = fuente('src/app/api/v1/admin/settings/route.ts');

ok('importa auditLogs de @/db', /import\s*\{[^}]*\bauditLogs\b[^}]*\}\s*from\s*'@\/db'/.test(settings));

const cuerpoPatch = bloque(settings, /export\s+async\s+function\s+PATCH/);
ok('se aislo el cuerpo de PATCH()', cuerpoPatch.length > 0);

ok('inserta en auditLogs dentro de la transaccion, despues de actualizar companySettings',
  /\.where\(eq\(companySettings\.companyId, session\.companyId\)\);[\s\S]{0,600}?await tx\.insert\(auditLogs\)\.values\(\{/.test(cuerpoPatch));

ok("action es 'company_settings_updated'", /action:\s*'company_settings_updated'/.test(cuerpoPatch));
ok('registra dgiiEnv en oldValues y en newValues (para poder reconstruir cuando paso a produccion)',
  /oldValues:\s*\{[^}]*dgiiEnv:/.test(cuerpoPatch) && /newValues:\s*\{[^}]*dgiiEnv:/.test(cuerpoPatch));

const bloqueInsertAudit = bloque(cuerpoPatch, /tx\.insert\(auditLogs\)\.values\(/);
ok('NO registra msellerApiKey en texto plano (solo el booleano msellerApiKeyChanged)',
  !/msellerApiKey\s*:/.test(bloqueInsertAudit) && /msellerApiKeyChanged:\s*!!msellerApiKey/.test(bloqueInsertAudit));
ok('NO registra msellerPassword en texto plano (solo el booleano msellerPasswordChanged)',
  !/msellerPassword\s*:/.test(bloqueInsertAudit) && /msellerPasswordChanged:\s*!!msellerPassword/.test(bloqueInsertAudit));

console.log('\n=== P1-18: clear-sandbox borra las tablas hijas en el orden correcto ===\n');

const sandbox = fuente("src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts");

for (const tabla of ['invoiceLines', 'invoiceTaxes', 'invoiceRetentions', 'creditDebitNotes', 'dgiiSubmissions', 'quoteLines', 'quoteTaxes', 'deliveryNoteLines']) {
  ok(`importa ${tabla}`, new RegExp(`\\b${tabla}\\b`).test(sandbox.slice(0, sandbox.indexOf("} from '@/db'"))));
}

const cuerpoTx = bloque(sandbox, /await db\.transaction\(async \(tx\) => \{/);
ok('se aislo el cuerpo de la transaccion de purga', cuerpoTx.length > 0);

const idx = (marcador: string) => cuerpoTx.indexOf(marcador);

const idxInvoiceLinesDel = idx('await tx.delete(invoiceLines)');
const idxInvoiceTaxesDel = idx('await tx.delete(invoiceTaxes)');
const idxInvoiceRetentionsDel = idx('await tx.delete(invoiceRetentions)');
const idxQuoteLinesDel = idx('await tx.delete(quoteLines)');
const idxQuoteTaxesDel = idx('await tx.delete(quoteTaxes)');
const idxDeliveryNoteLinesDel = idx('await tx.delete(deliveryNoteLines)');
const idxCreditDebitNotesDel = idx('await tx.delete(creditDebitNotes)');
const idxDgiiSubmissionsDel = idx('await tx.delete(dgiiSubmissions)');
const idxDeliveryNotesDel = idx('await tx.delete(deliveryNotes)');
const idxCashMovementsDel = idx('await tx.delete(cashMovements)');
const idxCashSessionsDel = idx('await tx.delete(cashSessions)');
const idxInvoicesDel = idx('await tx.delete(invoices)');
const idxQuotesDel = idx('await tx.delete(quotes)');

for (const [nombre, i] of Object.entries({
  invoiceLinesDel: idxInvoiceLinesDel, invoiceTaxesDel: idxInvoiceTaxesDel, invoiceRetentionsDel: idxInvoiceRetentionsDel,
  quoteLinesDel: idxQuoteLinesDel, quoteTaxesDel: idxQuoteTaxesDel, deliveryNoteLinesDel: idxDeliveryNoteLinesDel,
  creditDebitNotesDel: idxCreditDebitNotesDel, dgiiSubmissionsDel: idxDgiiSubmissionsDel, deliveryNotesDel: idxDeliveryNotesDel,
  cashMovementsDel: idxCashMovementsDel, cashSessionsDel: idxCashSessionsDel, invoicesDel: idxInvoicesDel, quotesDel: idxQuotesDel,
})) {
  ok(`se encontro el borrado de ${nombre}`, i >= 0);
}

ok('invoice_lines/taxes/retentions se borran ANTES que invoices',
  idxInvoiceLinesDel < idxInvoicesDel && idxInvoiceTaxesDel < idxInvoicesDel && idxInvoiceRetentionsDel < idxInvoicesDel);

ok('quote_lines/taxes se borran ANTES que quotes',
  idxQuoteLinesDel < idxQuotesDel && idxQuoteTaxesDel < idxQuotesDel);

ok('delivery_note_lines se borra ANTES que delivery_notes',
  idxDeliveryNoteLinesDel < idxDeliveryNotesDel);

ok('delivery_notes se borra ANTES que invoices (tiene su propia FK notNull a invoices)',
  idxDeliveryNotesDel < idxInvoicesDel);

ok('credit_debit_notes y dgii_submissions se borran ANTES que invoices',
  idxCreditDebitNotesDel < idxInvoicesDel && idxDgiiSubmissionsDel < idxInvoicesDel);

ok('cash_movements se borra ANTES que invoices (antes quedaba despues, en el orden incorrecto)',
  idxCashMovementsDel < idxInvoicesDel);

ok('cash_movements se borra ANTES que cash_sessions (referencia cash_session_id)',
  idxCashMovementsDel < idxCashSessionsDel);

const vecesCashMovements = (cuerpoTx.match(/await tx\.delete\(cashMovements\)/g) || []).length;
ok('cash_movements se borra una sola vez (no quedo un borrado duplicado tras el reordenamiento)',
  vecesCashMovements === 1, `encontrado ${vecesCashMovements}`);

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
