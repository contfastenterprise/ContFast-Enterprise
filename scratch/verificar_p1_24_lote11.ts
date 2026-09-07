import { fuente, crudo as crudoCrudo } from './_fuente';

// Normaliza CRLF -> LF antes de comparar: igual que en lotes anteriores.
const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean, d = ''): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
}

function sinAny(s: string): number {
  return (s.match(/: any/g) || []).length;
}

const CAST = 'Error & { status?: number; code?: string }';
const CAST_RE = CAST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ═══════════════════ Grupo TRIVIAL: catch(error: unknown), sin acceso a propiedades (10) ═══════════════════
for (const ruta of [
  'src/app/api/v1/setup/confirm/route.ts',
  'src/app/api/v1/setup/status/route.ts',
  'src/app/api/v1/setup/recover/route.ts',
  'src/app/api/v1/reports/balances/customers/print/route.ts',
  'src/app/api/v1/reports/balances/customers/route.ts',
  'src/app/api/v1/reports/balances/suppliers/print/route.ts',
  'src/app/api/v1/reports/balances/suppliers/route.ts',
  'src/app/api/v1/reports/payables/print/route.ts',
  'src/app/api/v1/reports/receivables/print/route.ts',
  'src/app/api/v1/reports/receivables/route.ts',
] as const) {
  const src = crudo(ruta);
  ok(`${ruta}: 0 ': any'`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta}: catch (error: unknown) presente`, src.includes('} catch (error: unknown) {'));
}

// ═══════════════════ inventory/movements, transfer (CAST); reorder-suggestions (inline) ═══════════════════
{
  const src = crudo('src/app/api/v1/inventory/movements/route.ts');
  ok("inventory/movements: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('inventory/movements: catch status+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`) && src.includes('const status = e.status || 500;'));
}
{
  const src = crudo('src/app/api/v1/inventory/reorder-suggestions/route.ts');
  ok("inventory/reorder-suggestions: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('inventory/reorder-suggestions: catch unknown + .message inline',
    src.includes('} catch (error: unknown) {') && src.includes('(error as Error).message'));
}
{
  const src = crudo('src/app/api/v1/inventory/transfer/route.ts');
  ok("inventory/transfer: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('inventory/transfer: catch status+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`) && src.includes('const status = e.status || 500;'));
}

// ═══════════════════ invoices/[id]/email (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/[id]/email/route.ts');
  ok("invoices/[id]/email: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/[id]/email: retentions.map sin any', src.includes('(invoice.retentions || []).map((r) => ({'));
  ok('invoices/[id]/email: catch interno (err) unknown trivial',
    src.includes('} catch (err: unknown) {') && src.includes("Logger.error('[Email Route] Failed to regenerate PDF on the fly', err);"));
  ok('invoices/[id]/email: catch externo status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`) && src.includes("code = e.code || 'SERVER_ERROR'"));
}

// ═══════════════════ invoices/[id]/pdf (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/[id]/pdf/route.ts');
  ok("invoices/[id]/pdf: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/[id]/pdf: catch interno (err) unknown + .message',
    src.includes('} catch (err: unknown) {') && src.includes('message: (err as Error).message'));
  ok('invoices/[id]/pdf: retentions.map sin any', src.includes('(invoice.retentions || []).map((r) => ({'));
  ok('invoices/[id]/pdf: catch externo unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('Error interno al generar PDF: ${(error as Error).message}'));
}

// ═══════════════════ invoices/[id]/print (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/[id]/print/route.ts');
  ok("invoices/[id]/print: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/[id]/print: GET+POST .message casteado 3 veces (GET x2 + POST x1)',
    (src.match(/\(error as Error\)\.message/g) || []).length === 3);
}

// ═══════════════════ invoices/[id]/route (2, ambos CAST) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/[id]/route.ts');
  ok("invoices/[id]/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/[id]/route: GET catch CAST', src.includes(`const e = error as ${CAST};`));
  ok('invoices/[id]/route: DELETE catch .message inline', src.includes('(error as Error).message'));
}

// ═══════════════════ invoices/[id]/submit (1 CAST) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/[id]/submit/route.ts');
  ok("invoices/[id]/submit: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/[id]/submit: catch CAST', src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ invoices/[id]/xml (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/[id]/xml/route.ts');
  ok("invoices/[id]/xml: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/[id]/xml: inner catch (err) .message inline',
    src.includes('} catch (err: unknown) {') && src.includes('(err as Error).message'));
  ok('invoices/[id]/xml: outer catch .message inline',
    src.includes('Error interno al descargar XML: ${(error as Error).message}'));
}

// ═══════════════════ invoices/draft (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/draft/route.ts');
  ok("invoices/draft: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/draft: itemLines.map y taxesList.map sin any',
    src.includes('totals.itemLines.map((line) => ({') && src.includes('totals.taxesList.map((tax) => ({'));
  ok('invoices/draft: catch CAST', src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ invoices/report (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/report/route.ts');
  ok("invoices/report: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/report: baseConditions SQL[] con type SQL importado',
    src.includes("notInArray, type SQL } from 'drizzle-orm';") && src.includes('const baseConditions: SQL[] = ['));
  ok('invoices/report: catch .message inline',
    src.includes('Error al generar reporte de facturación: ${(error as Error).message}'));
}

// ═══════════════════ invoices/route (5) ═══════════════════
{
  const src = crudo('src/app/api/v1/invoices/route.ts');
  ok("invoices/route: 0 ': any' (5 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('invoices/route: GET + POST catch CAST (x2)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
  ok('invoices/route: idsAjenos tabla tipado con union TablaConPertenencia',
    src.includes('type TablaConPertenencia =') && src.includes('tabla: TablaConPertenencia,'));
  ok('invoices/route: idsAjenos filter/map sin any',
    src.includes('.filter((f) => f.companyId === auth.companyId || (admiteGlobales && f.companyId === null))') &&
    src.includes('.map((f) => f.id)'));
}

// ═══════════════════ jobs/[jobId] (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/jobs/[jobId]/route.ts');
  ok("jobs/[jobId]: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('jobs/[jobId]: catch .message inline', src.includes('Internal server error: ${(error as Error).message}'));
}

// ═══════════════════ ocr (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/ocr/route.ts');
  ok("ocr: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ocr: inner catch (err) trivial unknown', src.includes('} catch (err: unknown) {'));
  ok('ocr: outer catch .message inline', src.includes("(error as Error).message || 'Fallo interno al procesar el OCR'"));
}

// ═══════════════════ products/[id]/barcodes (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/products/[id]/barcodes/route.ts');
  ok("products/[id]/barcodes: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('products/[id]/barcodes: 3 catches .message inline',
    (src.match(/\(error as Error\)\.message/g) || []).length === 3);
}

// ═══════════════════ products/[id]/inventory (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/products/[id]/inventory/route.ts');
  ok("products/[id]/inventory: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('products/[id]/inventory: GET catch CAST', src.includes(`const e = error as ${CAST};`));
  ok('products/[id]/inventory: PUT catch .message inline',
    src.includes("(error as Error).message || 'Failed to update stock limits'"));
}

// ═══════════════════ products/[id]/route (3, todos CAST) ═══════════════════
{
  const src = crudo('src/app/api/v1/products/[id]/route.ts');
  ok("products/[id]/route: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('products/[id]/route: GET+PUT+DELETE catch CAST (x3)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 3);
}

// ═══════════════════ products/barcodes/pdf (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/products/barcodes/pdf/route.ts');
  ok("products/barcodes/pdf: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('products/barcodes/pdf: flatList sin any', src.includes('const flatList = [];'));
  ok('products/barcodes/pdf: catch (err) .message inline',
    src.includes('} catch (err: unknown) {') && src.includes('(err as Error).message'));
}

// ═══════════════════ products/barcodes/print-log (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/products/barcodes/print-log/route.ts');
  ok("products/barcodes/print-log: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('products/barcodes/print-log: 2 catches .message inline',
    (src.match(/\(error as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ products/next-barcode (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/products/next-barcode/route.ts');
  ok("products/next-barcode: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('products/next-barcode: catch .message inline', src.includes('(error as Error).message'));
}

// ═══════════════════ products/route (5) ═══════════════════
{
  const src = crudo('src/app/api/v1/products/route.ts');
  ok("products/route: 0 ': any' (5 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('products/route: dataWithInventory (barcode) sin any', src.includes('let dataWithInventory = [];'));
  ok('products/route: productIds.map + dataWithInventory (list) sin any',
    src.includes('result.data.map((p) => p.id);') && src.includes('result.data.map((p) => ({'));
  ok('products/route: GET+POST catch CAST (x2)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
}

// ═══════════════════ quotes/[id]/convert (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/quotes/[id]/convert/route.ts');
  ok("quotes/[id]/convert: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('quotes/[id]/convert: catch .message inline', src.includes('(error as Error).message'));
}

// ═══════════════════ quotes/[id]/pdf (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/quotes/[id]/pdf/route.ts');
  ok("quotes/[id]/pdf: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('quotes/[id]/pdf: catch .message inline', src.includes('Error al generar PDF de cotización: ${(error as Error).message}'));
}

// ═══════════════════ quotes/[id]/print (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/quotes/[id]/print/route.ts');
  ok("quotes/[id]/print: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('quotes/[id]/print: GET+POST .message casteado 3 veces (GET x2 + POST x1)',
    (src.match(/\(error as Error\)\.message/g) || []).length === 3);
  ok('quotes/[id]/print: POST .message inline', src.includes('Internal server error: ${(error as Error).message}'));
}

// ═══════════════════ quotes/[id]/route (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/quotes/[id]/route.ts');
  ok("quotes/[id]/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('quotes/[id]/route: GET .message inline',
    src.includes('message: (error as Error).message } },\n      { status: 500, headers: resHeaders }\n    );\n  }\n}'));
  ok('quotes/[id]/route: PUT conserva ZodError + .message inline en fallback',
    src.includes('error instanceof z.ZodError') && (src.match(/\(error as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ quotes/route (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/quotes/route.ts');
  ok("quotes/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('quotes/route: GET catch CAST', src.includes(`const e = error as ${CAST};`));
  ok('quotes/route: POST conserva ZodError + CAST en fallback',
    src.includes('error instanceof z.ZodError') && (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
}

// ═══════════════════ reports/606/download (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/606/download/route.ts');
  ok("reports/606/download: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/606/download: catch CAST', src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ reports/606/route (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/606/route.ts');
  ok("reports/606/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/606/route: GET+POST catch CAST (x2)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
}

// ═══════════════════ reports/607/txt (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/607/txt/route.ts');
  ok("reports/607/txt: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/607/txt: catch .message inline', src.includes('(error as Error).message'));
}

// ═══════════════════ reports/[reportType]/print (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/[reportType]/print/route.ts');
  ok("reports/[reportType]/print: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/[reportType]/print: catch CAST', src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ reports/balance-sheet (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/balance-sheet/route.ts');
  ok("reports/balance-sheet: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/balance-sheet: catch CAST', src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ reports/income-statement (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/income-statement/route.ts');
  ok("reports/income-statement: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/income-statement: catch CAST', src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ reports/pdf (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/pdf/route.ts');
  ok("reports/pdf: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/pdf: catch (err) .message inline',
    src.includes('} catch (err: unknown) {') && src.includes('(err as Error).message'));
}

// ═══════════════════ reports/sales-book (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/reports/sales-book/route.ts');
  ok("reports/sales-book: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('reports/sales-book: catch CAST', src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ retentions/[id]/route (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/retentions/[id]/route.ts');
  ok("retentions/[id]/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('retentions/[id]/route: PUT conserva ZodError + CAST en fallback',
    src.includes('error instanceof z.ZodError') && src.includes(`const e = error as ${CAST};`));
  ok('retentions/[id]/route: 2 catches con CAST',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
}

// ═══════════════════ retentions/route (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/retentions/route.ts');
  ok("retentions/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('retentions/route: GET .message inline', src.includes('(error as Error).message'));
  ok('retentions/route: POST conserva ZodError + CAST en fallback',
    src.includes('error instanceof z.ZodError') && src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ setup/company, delivery, fiscal, printing (4) ═══════════════════
for (const ruta of [
  'src/app/api/v1/setup/company/route.ts',
  'src/app/api/v1/setup/delivery/route.ts',
  'src/app/api/v1/setup/fiscal/route.ts',
  'src/app/api/v1/setup/printing/route.ts',
] as const) {
  const src = crudo(ruta);
  ok(`${ruta}: 0 ': any'`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta}: catch unknown + .message inline (INVALID_REQUEST)`,
    src.includes("code: 'INVALID_REQUEST', message: (error as Error).message"));
}

// ═══════════════════ storage/delete, storage/upload (2) ═══════════════════
for (const ruta of [
  'src/app/api/v1/storage/delete/route.ts',
  'src/app/api/v1/storage/upload/route.ts',
] as const) {
  const src = crudo(ruta);
  ok(`${ruta}: 0 ': any'`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta}: catch (err) .message inline`,
    src.includes('} catch (err: unknown) {') && src.includes("(err as Error).message || 'Error interno del servidor.'"));
}

// ═══════════════════ supplier-orders/[id]/duplicate, email, send (3, CAST simples) ═══════════════════
for (const ruta of [
  'src/app/api/v1/supplier-orders/[id]/duplicate/route.ts',
  'src/app/api/v1/supplier-orders/[id]/email/route.ts',
  'src/app/api/v1/supplier-orders/[id]/send/route.ts',
] as const) {
  const src = crudo(ruta);
  ok(`${ruta}: 0 ': any'`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta}: catch CAST`, src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ supplier-orders/[id]/pdf (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/supplier-orders/[id]/pdf/route.ts');
  ok("supplier-orders/[id]/pdf: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('supplier-orders/[id]/pdf: inner catch (err) trivial',
    src.includes("} catch (err: unknown) {\n      return new NextResponse('Sin permisos', { status: 403 });"));
  ok('supplier-orders/[id]/pdf: outer catch .message inline',
    src.includes('Error interno al generar PDF: ${(error as Error).message}'));
}

// ═══════════════════ supplier-orders/[id]/receive (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/supplier-orders/[id]/receive/route.ts');
  ok("supplier-orders/[id]/receive: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('supplier-orders/[id]/receive: conserva ZodError + CAST en fallback',
    src.includes('error instanceof z.ZodError') && src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ supplier-orders/[id]/route (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/supplier-orders/[id]/route.ts');
  ok("supplier-orders/[id]/route: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('supplier-orders/[id]/route: PUT conserva ZodError + CAST en fallback',
    src.includes('error instanceof z.ZodError') && src.includes(`const e = error as ${CAST};`));
  ok('supplier-orders/[id]/route: GET+PUT+DELETE catch CAST (x3)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 3);
}

// ═══════════════════ supplier-orders/report (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/supplier-orders/report/route.ts');
  ok("supplier-orders/report: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('supplier-orders/report: inner catch (err) trivial',
    src.includes("} catch (err: unknown) {\n      return new NextResponse('Sin permisos', { status: 403 });"));
  ok('supplier-orders/report: outer catch .message inline',
    src.includes('Error interno al generar PDF: ${(error as Error).message}'));
}

// ═══════════════════ supplier-orders/route (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/supplier-orders/route.ts');
  ok("supplier-orders/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('supplier-orders/route: GET catch CAST', src.includes(`const e = error as ${CAST};`));
  ok('supplier-orders/route: POST conserva ZodError + CAST en fallback',
    src.includes('error instanceof z.ZodError') && (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
}

// ═══════════════════ suppliers/[id]/route (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/suppliers/[id]/route.ts');
  ok("suppliers/[id]/route: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('suppliers/[id]/route: GET+PUT+DELETE catch CAST (x3)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 3);
  ok('suppliers/[id]/route: PUT conserva isDuplicate via e.message.includes',
    src.includes("const isDuplicate = e.message.includes('en uso');"));
}

// ═══════════════════ suppliers/route (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/suppliers/route.ts');
  ok("suppliers/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('suppliers/route: GET+POST catch CAST (x2)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
  ok('suppliers/route: POST conserva isDuplicate via e.message.includes',
    src.includes("const isDuplicate = e.message.includes('ya existe');"));
}

// ═══════════════════ tools/print (1) ═══════════════════
{
  const src = crudo('src/app/api/v1/tools/print/route.ts');
  ok("tools/print: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('tools/print: catch .message inline', src.includes('Internal server error: ${(error as Error).message}'));
}

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
