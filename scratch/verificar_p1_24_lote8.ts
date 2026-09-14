import { fuente, crudo as crudoCrudo } from './_fuente';

// Normaliza CRLF -> LF antes de comparar: algunos ficheros del repo (ej. entries/route.ts,
// admin/users/route.ts) tienen fin de linea CRLF, y las comprobaciones multilinea de este
// banco usan '\n' literal. Sin esto dan falso negativo en esos ficheros aunque el codigo
// sea correcto (confirmado con balance3.py + revision manual de los 35 diffs).
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

// ═══════════════════ documents/{email,pdf,share}/[type]/[id]/route.ts ═══════════════════
//  Este banco acompaño al commit 70559d4 (P1-24 lote 8) pero no se commiteo
//  con el: se quedo suelto en scratch/ y se recupera en el lote 106.
//
//  Las tres rutas de `src/app/api/documents/` ya NO existen: el lote 100 retiro
//  el modulo de documentos entero (la tabla `document_shares` tenia cero filas
//  desde que existia). Leerlas aqui hacia reventar el banco con ENOENT antes de
//  comprobar nada. Que se fueron, y que nadie las nombra, lo vigila
//  `verificar_modulo_documentos_retirado.ts`; aqui no queda nada que tipar.

// ═══════════════════ storefront/quotes/route.ts ═══════════════════
console.log('\n=== storefront/quotes/route.ts ===\n');
{
  const src = crudo('src/app/api/storefront/quotes/route.ts');
  ok("0 ocurrencias de ': any' (1 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('catch tipado unknown, cast puntual a Error (conserva el || de fallback)',
    src.includes('} catch (error: unknown) {') &&
    src.includes("message: (error as Error).message || 'Error interno del servidor' } }, { status: 500 });"));
}

// ═══════════════════ v1/accounting/accounts/route.ts ═══════════════════
console.log('\n=== v1/accounting/accounts/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/accounting/accounts/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET catch: unknown + const e = error as Error&{status,code}, status/code/message via e',
    /\} catch \(error: unknown\) \{\s*\n\s*console\.error\('Error fetching accounts:', error\);\s*\n\s*const e = error as Error & \{ status\?: number; code\?: string \};\s*\n\s*const status = e\.status \|\| 500;/.test(src) &&
    src.includes("{ success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },"));
  ok('POST catch: unknown + cast, isDuplicate via e.message.includes (conserva la logica exacta)',
    src.includes("const isDuplicate = e.message.includes('ya existe');") &&
    src.includes("code: isDuplicate ? 'CONFLICT' : (e.code || 'SERVER_ERROR'), message: e.message"));
}

// ═══════════════════ v1/accounting/entries/route.ts ═══════════════════
console.log('\n=== v1/accounting/entries/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/accounting/entries/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET catch: unknown + cast + status/code separados via e',
    src.includes("console.error('Error in GET /api/v1/accounting/entries:', error);") &&
    src.includes('const e = error as Error & { status?: number; code?: string };\n    const status = e.status || 500;\n    const code = e.code || \'SERVER_ERROR\';') &&
    src.includes('{ success: false, error: { code, message: e.message } },'));
  ok('POST catch: unknown + cast (mismo patron)',
    src.includes("console.error('Error in POST /api/v1/accounting/entries:', error);"));
  ok('exactamente 2 catches tipados unknown (GET y POST)', (src.match(/catch \(error: unknown\)/g) || []).length === 2);
}

// ═══════════════════ v1/accounting/journals/route.ts ═══════════════════
console.log('\n=== v1/accounting/journals/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/accounting/journals/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET catch: status||500, code inline en el objeto (no const code)',
    src.includes("const status = e.status || 500;") &&
    src.includes("{ success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },"));
  ok('POST catch: status||400, code inline BAD_REQUEST',
    src.includes("const status = e.status || 400;") &&
    src.includes("{ success: false, error: { code: e.code || 'BAD_REQUEST', message: e.message } },"));
}

// ═══════════════════ v1/accounting/mappings/route.ts ═══════════════════
console.log('\n=== v1/accounting/mappings/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/accounting/mappings/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET y PUT catch: unknown, cast puntual a Error (2 catches)',
    (src.match(/catch \(error: unknown\)/g) || []).length === 2 &&
    (src.match(/message: \(error as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ v1/accounting/periods/[id]/route.ts ═══════════════════
console.log('\n=== v1/accounting/periods/[id]/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/accounting/periods/[id]/route.ts');
  ok("0 ocurrencias de ': any' (1 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('catch tipado unknown, cast puntual', src.includes('} catch (error: unknown) {') && src.includes('message: (error as Error).message'));
}

// ═══════════════════ v1/accounting/periods/route.ts ═══════════════════
console.log('\n=== v1/accounting/periods/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/accounting/periods/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET y POST catch: unknown, cast puntual (2 catches)',
    (src.match(/catch \(error: unknown\)/g) || []).length === 2 &&
    (src.match(/message: \(error as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ v1/accounting/reports/{financials,ledger,trial-balance}/route.ts ═══════════════════
console.log('\n=== v1/accounting/reports/* ===\n');
{
  for (const [archivo, texto] of [
    ['src/app/api/v1/accounting/reports/financials/route.ts', 'Error fetching financials:'],
    ['src/app/api/v1/accounting/reports/ledger/route.ts', 'Error fetching ledger:'],
    ['src/app/api/v1/accounting/reports/trial-balance/route.ts', 'Error fetching trial balance:'],
  ]) {
    const src = crudo(archivo);
    ok(`${archivo}: 0 ocurrencias de ': any' (1 antes)`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
    ok(`${archivo}: catch unknown + cast puntual (${texto})`,
      src.includes('} catch (error: unknown) {') &&
      src.includes(`console.error('${texto}', error);`) &&
      src.includes('message: (error as Error).message'));
  }
}

// ═══════════════════ v1/admin/companies/[id]/clear-sandbox/route.ts ═══════════════════
console.log('\n=== v1/admin/companies/[id]/clear-sandbox/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts');
  ok("0 ocurrencias de ': any' (8 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok("importa type PgColumn de drizzle-orm/pg-core",
    src.includes("import type { PgColumn } from 'drizzle-orm/pg-core';"));
  ok('cond tipado con shape estructural { companyId: PgColumn; modo: PgColumn } (no PgTable completo -- suficiente para lo que usa)',
    src.includes('const cond = (table: { companyId: PgColumn; modo: PgColumn }) => and(eq(table.companyId, companyId), eq(table.modo, mode));'));
  ok('los 6 .map() de ids quedan sin anotacion any redundante (ya tipados por el tx.select previo)',
    src.includes('sandboxReceipts.map((r) => r.id)') &&
    src.includes('sandboxSupplierPayments.map((sp) => sp.id)') &&
    src.includes('sandboxExpenses.map((e) => e.id)') &&
    src.includes('sandboxInvoices.map((i) => i.id)') &&
    src.includes('sandboxQuotesForLines.map((q) => q.id)') &&
    src.includes('sandboxDeliveryNotes.map((d) => d.id)'));
  ok('catch: unknown, cast puntual a Error (conserva el || de fallback)',
    src.includes('} catch (err: unknown) {') &&
    src.includes("message: (err as Error).message || 'Error del servidor al limpiar datos.' } },"));
}

// ═══════════════════ v1/admin/companies/[id]/route.ts y v1/admin/companies/route.ts ═══════════════════
console.log('\n=== v1/admin/companies/[id]/route.ts y v1/admin/companies/route.ts ===\n');
{
  for (const archivo of ['src/app/api/v1/admin/companies/[id]/route.ts', 'src/app/api/v1/admin/companies/route.ts']) {
    const src = crudo(archivo);
    ok(`${archivo}: 0 ocurrencias de ': any' (2 antes)`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
    ok(`${archivo}: 2 catches tipados unknown, sin acceso a propiedades del error (mensaje fijo)`,
      (src.match(/catch \(error: unknown\)/g) || []).length === 2 &&
      (src.match(/error: \{ message: 'Error interno del servidor' \}/g) || []).length === 2);
  }
}

// ═══════════════════ v1/admin/permissions/route.ts ═══════════════════
console.log('\n=== v1/admin/permissions/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/admin/permissions/route.ts');
  ok("0 ocurrencias de ': any' (1 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('catch: unknown + cast + status/code separados via e',
    src.includes('} catch (error: unknown) {') &&
    src.includes('const e = error as Error & { status?: number; code?: string };') &&
    src.includes('{ success: false, error: { code, message: e.message } },'));
}

// ═══════════════════ v1/admin/plans/[id]/route.ts y v1/admin/plans/route.ts ═══════════════════
console.log('\n=== v1/admin/plans/* ===\n');
{
  const src1 = crudo('src/app/api/v1/admin/plans/[id]/route.ts');
  ok("plans/[id]: 0 ocurrencias de ': any' (2 antes)", sinAny(src1) === 0, `quedan ${sinAny(src1)}`);
  ok('plans/[id]: updateData tipado Partial<typeof plans.$inferInsert> (antes any)',
    src1.includes('const updateData: Partial<typeof plans.$inferInsert> = {'));
  ok('plans/[id]: catch unknown, cast puntual',
    src1.includes('} catch (err: unknown) {') && src1.includes('message: (err as Error).message'));

  const src2 = crudo('src/app/api/v1/admin/plans/route.ts');
  ok("plans: 0 ocurrencias de ': any' (2 antes)", sinAny(src2) === 0, `quedan ${sinAny(src2)}`);
  ok('plans: GET y POST catch unknown, cast puntual (2 catches)',
    (src2.match(/catch \(err: unknown\)/g) || []).length === 2 &&
    (src2.match(/message: \(err as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ v1/admin/roles/[id]/permissions/route.ts y v1/admin/roles/route.ts ═══════════════════
console.log('\n=== v1/admin/roles/* ===\n');
{
  const src1 = crudo('src/app/api/v1/admin/roles/[id]/permissions/route.ts');
  ok("roles/[id]/permissions: 0 ocurrencias de ': any' (2 antes)", sinAny(src1) === 0, `quedan ${sinAny(src1)}`);
  ok('roles/[id]/permissions: GET y PATCH catch unknown + cast + status/code via e (2 catches)',
    (src1.match(/catch \(error: unknown\)/g) || []).length === 2 &&
    (src1.match(/const e = error as Error & \{ status\?: number; code\?: string \};/g) || []).length === 2);

  const src2 = crudo('src/app/api/v1/admin/roles/route.ts');
  ok("roles: 0 ocurrencias de ': any' (2 antes)", sinAny(src2) === 0, `quedan ${sinAny(src2)}`);
  ok('roles: GET tras "const roles = await AdminRepository.getRoles()" -- catch unknown, cast puntual',
    /const roles = await AdminRepository\.getRoles\(\);\s*\n\s*return NextResponse\.json\(\{ success: true, data: roles \}\);\s*\n\s*\} catch \(err: unknown\) \{\s*\n\s*return NextResponse\.json\(\{ success: false, error: \{ message: \(err as Error\)\.message \} \}, \{ status: 500 \}\);/.test(src2));
  ok('roles: POST tras "data: newRole" -- catch unknown, cast puntual',
    /return NextResponse\.json\(\{ success: true, data: newRole \}\);\s*\n\s*\} catch \(err: unknown\) \{\s*\n\s*return NextResponse\.json\(\{ success: false, error: \{ message: \(err as Error\)\.message \} \}, \{ status: 500 \}\);/.test(src2));
}

// ═══════════════════ v1/admin/sessions/route.ts ═══════════════════
console.log('\n=== v1/admin/sessions/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/admin/sessions/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET y DELETE catch unknown, cast puntual (2 catches)',
    (src.match(/catch \(err: unknown\)/g) || []).length === 2 &&
    (src.match(/message: \(err as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ v1/admin/settings/route.ts ═══════════════════
console.log('\n=== v1/admin/settings/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/admin/settings/route.ts');
  ok("0 ocurrencias de ': any' (4 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET catch (status 500) y PATCH catch (status 400): unknown, cast puntual',
    src.includes('} catch (err: unknown) {\n    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 500 });') &&
    src.includes('} catch (err: unknown) {\n    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 });'));
  ok('companyUpdate tipado Partial<typeof companies.$inferInsert> (antes any)',
    src.includes('const companyUpdate: Partial<typeof companies.$inferInsert> = {};'));
  ok('settingsUpdate tipado Partial<typeof companySettings.$inferInsert> (antes any)',
    src.includes('const settingsUpdate: Partial<typeof companySettings.$inferInsert> = {'));
}

// ═══════════════════ v1/admin/subscriptions/[id]/route.ts y v1/admin/subscriptions/route.ts ═══════════════════
console.log('\n=== v1/admin/subscriptions/* ===\n');
{
  const src1 = crudo('src/app/api/v1/admin/subscriptions/[id]/route.ts');
  ok("subscriptions/[id]: 0 ocurrencias de ': any' (2 antes)", sinAny(src1) === 0, `quedan ${sinAny(src1)}`);
  ok('subscriptions/[id]: updateData tipado Partial<typeof subscriptions.$inferInsert>',
    src1.includes('const updateData: Partial<typeof subscriptions.$inferInsert> = {'));
  ok('subscriptions/[id]: catch unknown, cast puntual',
    src1.includes('} catch (err: unknown) {') && src1.includes('message: (err as Error).message'));

  const src2 = crudo('src/app/api/v1/admin/subscriptions/route.ts');
  ok("subscriptions: 0 ocurrencias de ': any' (2 antes)", sinAny(src2) === 0, `quedan ${sinAny(src2)}`);
  ok('subscriptions: GET y POST catch unknown, cast puntual (2 catches)',
    (src2.match(/catch \(err: unknown\)/g) || []).length === 2 &&
    (src2.match(/message: \(err as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ v1/admin/users/[id]/permissions/route.ts ═══════════════════
console.log('\n=== v1/admin/users/[id]/permissions/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/admin/users/[id]/permissions/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('GET y PATCH catch unknown + cast + status/code via e (2 catches)',
    (src.match(/catch \(error: unknown\)/g) || []).length === 2 &&
    (src.match(/const e = error as Error & \{ status\?: number; code\?: string \};/g) || []).length === 2);
}

// ═══════════════════ v1/admin/users/[id]/route.ts ═══════════════════
console.log('\n=== v1/admin/users/[id]/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/admin/users/[id]/route.ts');
  ok("0 ocurrencias de ': any' (1 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('catch unknown, cast puntual', src.includes('} catch (err: unknown) {') && src.includes('message: (err as Error).message'));
}

// ═══════════════════ v1/admin/users/route.ts ═══════════════════
console.log('\n=== v1/admin/users/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/admin/users/route.ts');
  ok("0 ocurrencias de ': any' (5 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok("los 2 'const err' de assertRoleAsignable tipados Error & {status?,code?} (espeja src/middleware/permissions.ts)",
    (src.match(/const err: Error & \{ status\?: number; code\?: string \} = new Error\(/g) || []).length === 2);
  ok('GET catch (status 500): unknown, cast puntual',
    src.includes('} catch (err: unknown) {\n    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 500 });'));
  ok('POST catch: unknown + const e = err as Error&{status,code} (lee .message y .status)',
    src.includes('} catch (err: unknown) {\n    const e = err as Error & { status?: number; code?: string };\n    return NextResponse.json({ success: false, error: { message: e.message } }, { status: e.status || 400 });'));
  ok('PATCH catch (status 400): unknown, cast puntual',
    src.includes('} catch (err: unknown) {\n    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 400 });'));
}

// ═══════════════════ v1/agent/proposals/* ═══════════════════
console.log('\n=== v1/agent/proposals/* ===\n');
{
  const src1 = crudo('src/app/api/v1/agent/proposals/[id]/action/route.ts');
  ok("proposals/[id]/action: 0 ocurrencias de ': any' (1 antes)", sinAny(src1) === 0, `quedan ${sinAny(src1)}`);
  ok('proposals/[id]/action: catch unknown, sin acceso a propiedades del error',
    src1.includes('} catch (error: unknown) {') && src1.includes("return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });"));

  const src2 = crudo('src/app/api/v1/agent/proposals/generate/route.ts');
  ok("proposals/generate: 0 ocurrencias de ': any' (1 antes)", sinAny(src2) === 0, `quedan ${sinAny(src2)}`);
  ok('proposals/generate: catch unknown, cast puntual (conserva el || de fallback)',
    src2.includes('} catch (error: unknown) {') && src2.includes("error: (error as Error).message || 'Internal Server Error'"));

  const src3 = crudo('src/app/api/v1/agent/proposals/route.ts');
  ok("proposals: 0 ocurrencias de ': any' (1 antes)", sinAny(src3) === 0, `quedan ${sinAny(src3)}`);
  ok('proposals: catch unknown, sin acceso a propiedades del error',
    src3.includes('} catch (error: unknown) {') && src3.includes("return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });"));
}

// ═══════════════════ v1/ai/chat/route.ts ═══════════════════
console.log('\n=== v1/ai/chat/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/ai/chat/route.ts');
  ok("0 ocurrencias de ': any' (1 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('catch unknown, sin acceso a propiedades del error (mensaje fijo)',
    src.includes('} catch (error: unknown) {') &&
    src.includes("console.error('[AI Core Route Error]:', error);"));
}

// ═══════════════════ v1/ap/payments/apply-guarantees/route.ts ═══════════════════
console.log('\n=== v1/ap/payments/apply-guarantees/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/ap/payments/apply-guarantees/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('define ResultadoAplicacionGarantia con noAplicados opcional (applySingleGuaranteeCheck no lo devuelve)',
    /interface ResultadoAplicacionGarantia \{\s*\n\s*appliedCount: number;\s*\n\s*totalAppliedAmount: number;\s*\n\s*descuadres: \{ cheque: string; importeCheque: number; saldoDisponible: number \}\[\];\s*\n\s*noAplicados\?: \{ checkId: string; cheque\?: string; motivo: string \}\[\];\s*\n\s*\}/.test(src));
  ok('result tipado con la interfaz (antes any)',
    src.includes('const result: ResultadoAplicacionGarantia = checkId'));
  ok('catch: unknown + cast + status/code via e',
    src.includes('} catch (error: unknown) {') &&
    src.includes('const e = error as Error & { status?: number; code?: string };') &&
    src.includes('{ success: false, error: { code, message: e.message } },'));
}

// ═══════════════════ v1/ap/payments/report/route.ts ═══════════════════
console.log('\n=== v1/ap/payments/report/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/ap/payments/report/route.ts');
  ok("0 ocurrencias de ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok("isGuaranteeCheck tipado via Awaited<ReturnType<typeof ApRepository.getPayments>>['items'][number] (antes any)",
    src.includes("const isGuaranteeCheck = (p: Awaited<ReturnType<typeof ApRepository.getPayments>>['items'][number]) => p.isGuarantee === true;"));
  ok('catch: unknown, cast puntual en el template literal',
    src.includes('} catch (error: unknown) {') &&
    src.includes('return new NextResponse(`Error al generar reporte: ${(error as Error).message}`, {'));
}

// ═══════════════════ v1/ap/payments/route.ts ═══════════════════
console.log('\n=== v1/ap/payments/route.ts ===\n');
{
  const src = crudo('src/app/api/v1/ap/payments/route.ts');
  ok("0 ocurrencias de ': any' (1 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('catch unknown, cast puntual',
    src.includes('} catch (error: unknown) {') &&
    src.includes("{ success: false, error: { code: 'BAD_REQUEST', message: (error as Error).message } },"));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
