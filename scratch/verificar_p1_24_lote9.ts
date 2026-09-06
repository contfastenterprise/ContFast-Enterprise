import { fuente, crudo as crudoCrudo } from './_fuente';

// Normaliza CRLF -> LF antes de comparar: varios ficheros de este lote tienen
// fin de linea CRLF (confirmado con `file`), y las comprobaciones multilinea
// de este banco usan '\n' literal.
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

// ═══════════════════ ap/print/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ap/print/route.ts');
  ok("ap/print: 0 ': any' (1 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ap/print: catch unknown + cast puntual .message',
    src.includes('} catch (error: unknown) {') &&
    src.includes("message: (error as Error).message } },\n      { status: 500 }"));
}

// ═══════════════════ ap/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ap/route.ts');
  ok("ap/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ap/route: bills tipado con la forma real (apId/amount/balance/dueDate/ncf/issueDate/status)',
    src.includes('bills: {\n        apId: string;\n        amount: number;\n        balance: number;\n        dueDate: string | null;\n        ncf: string | null;\n        issueDate: string | null;\n        status: string;\n      }[];'));
  ok('ap/route: catch status+code+message con const e = ...CAST',
    src.includes(`const e = error as ${CAST};`) &&
    src.includes('const status = e.status || 500;') &&
    src.includes("const code = e.code || 'SERVER_ERROR';") &&
    src.includes('message: e.message } },\n      { status, headers: resHeaders }'));
}

// ═══════════════════ ar/receipts/[id]/print/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ar/receipts/[id]/print/route.ts');
  ok("ar/receipts/[id]/print: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ar/receipts/[id]/print: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('message: (error as Error).message'));
}

// ═══════════════════ ar/receipts/[id]/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ar/receipts/[id]/route.ts');
  ok("ar/receipts/[id]/route: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ar/receipts/[id]/route: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('message: (error as Error).message'));
}

// ═══════════════════ ar/receipts/by-customer/print/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ar/receipts/by-customer/print/route.ts');
  ok("ar/receipts/by-customer/print: 0 ': any' (2 antes; groupedByInvoice sigue Record<string, any[]> a proposito -- 'any[]' sin ': any' literal no lo cuenta este patron, ni el original)",
    sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ar/receipts/by-customer/print: define ReciboDetalle via ReturnType de ArRepository.getCustomerReceiptsBreakdown',
    src.includes('type ReciboDetalle = Awaited<ReturnType<typeof ArRepository.getCustomerReceiptsBreakdown>>[number];'));
  ok('ar/receipts/by-customer/print: processedItems tipado con ReciboDetalle & progressiveBalance',
    src.includes('const processedItems: (ReciboDetalle & { progressiveBalance: number })[] = [];'));
  ok('ar/receipts/by-customer/print: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('message: (error as Error).message'));
}

// ═══════════════════ ar/receipts/by-customer/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ar/receipts/by-customer/route.ts');
  ok("ar/receipts/by-customer/route: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ar/receipts/by-customer/route: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('message: (error as Error).message'));
}

// ═══════════════════ ar/receipts/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ar/receipts/route.ts');
  ok("ar/receipts/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ar/receipts/route: GET catch unknown + .message',
    src.includes("console.error('Error fetching receipts:', error);") &&
    src.includes("message: (error as Error).message } },\n      { status: 500 }"));
  ok('ar/receipts/route: POST catch unknown, .message castea 3 veces (sesion de caja, CASH_SESSION_CLOSED, BAD_REQUEST)',
    src.includes("console.error('Error registering receipt:', error);") &&
    src.includes("if ((error as Error).message.includes('sesión de caja abierta')) {") &&
    (src.match(/\(error as Error\)\.message/g) || []).length >= 3);
}

// ═══════════════════ ar/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ar/route.ts');
  ok("ar/route: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ar/route: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('message: (error as Error).message'));
}

// ═══════════════════ auth/audit/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/auth/audit/route.ts');
  ok("auth/audit: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('auth/audit: catch (err: unknown) + .message',
    src.includes('} catch (err: unknown) {') && src.includes('message: (err as Error).message'));
}

// ═══════════════════ auth/login, logout, me, refresh, register (sin acceso a error.X) ═══════════════════
for (const [ruta, mensajeConsola] of [
  ['src/app/api/v1/auth/login/route.ts', "console.error('Login error:', error);"],
  ['src/app/api/v1/auth/logout/route.ts', "console.error('Logout error:', error);"],
  ['src/app/api/v1/auth/me/route.ts', "console.error('Error fetching current user:', error);"],
  ['src/app/api/v1/auth/refresh/route.ts', "console.error('Refresh token error:', error);"],
  ['src/app/api/v1/auth/register/route.ts', "console.error('Registration API error:', error);"],
  ['src/app/api/v1/auth/switch-company/route.ts', "console.error('Error switching company:', error);"],
] as const) {
  const src = crudo(ruta);
  ok(`${ruta.split('/').slice(-2, -1)}: 0 ': any'`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta.split('/').slice(-2, -1)}: catch unknown sin acceso a error.X (mensaje fijo)`,
    src.includes('} catch (error: unknown) {') && src.includes(mensajeConsola));
}

// ═══════════════════ auth/profile/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/auth/profile/route.ts');
  ok("auth/profile: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('auth/profile: PUT catch unknown + .message||fallback',
    src.includes("console.error('Profile update error:', error);") &&
    src.includes("message: (error as Error).message || 'Error interno del servidor'"));
  ok('auth/profile: GET catch unknown + .message||fallback',
    src.includes("message: (error as Error).message || 'Error interno'"));
}

// ═══════════════════ auth/route-mappings/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/auth/route-mappings/route.ts');
  ok("auth/route-mappings: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('auth/route-mappings: catch (err: unknown) + .message',
    src.includes('} catch (err: unknown) {') && src.includes('message: (err as Error).message'));
}

// ═══════════════════ bank/accounts/[id]/transactions/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/bank/accounts/[id]/transactions/route.ts');
  ok("bank/accounts/[id]/transactions: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('bank/.../transactions: importa DbTransaction de @/db',
    src.includes("import { db, type DbTransaction, bankAccounts, bankTransactions, auditLogs, chartOfAccounts } from '@/db';"));
  ok('bank/.../transactions: getOrCreateAccount(tx: DbTransaction, ...)',
    src.includes('async function getOrCreateAccount(tx: DbTransaction, companyId: string'));
  ok('bank/.../transactions: GET y POST catch status+code+message (const e = ...CAST)',
    (src.match(new RegExp(`const e = error as ${CAST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'g')) || []).length === 2);
}

// ═══════════════════ bank/accounts/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/bank/accounts/route.ts');
  ok("bank/accounts: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('bank/accounts: GET + POST catch unknown + .message',
    (src.match(/\(error as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ bank/reconciliations/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/bank/reconciliations/route.ts');
  ok("bank/reconciliations: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('bank/reconciliations: GET + POST catch status+code+message (const e = ...CAST x2)',
    (src.match(new RegExp(`const e = error as ${CAST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'g')) || []).length === 2);
}

// ═══════════════════ bank/transactions/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/bank/transactions/route.ts');
  ok("bank/transactions: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('bank/transactions: GET + POST catch unknown + .message',
    (src.match(/\(error as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ bi/stats/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/bi/stats/route.ts');
  ok("bi/stats: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('bi/stats: result tipado unknown', src.includes('let result: unknown = null;'));
  ok('bi/stats: catch (err: unknown) + .message',
    src.includes('} catch (err: unknown) {') && src.includes('message: (err as Error).message'));
}

// ═══════════════════ cash/registers/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/cash/registers/route.ts');
  ok("cash/registers: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('cash/registers: GET status+code+message',
    src.includes("console.error('Error in GET /api/v1/cash/registers:', error);") &&
    src.includes(`const e = error as ${CAST};`));
  ok('cash/registers: POST conserva el chequeo 23505/unique constraint con e.code/e.message',
    src.includes("if (e.code === '23505' || e.message?.includes('unique constraint')) {"));
}

// ═══════════════════ cash/sessions/[id]/approve, close, summary, active, sessions/route (status+code+message) ═══════════════════
for (const ruta of [
  'src/app/api/v1/cash/sessions/[id]/approve/route.ts',
  'src/app/api/v1/cash/sessions/[id]/close/route.ts',
  'src/app/api/v1/cash/sessions/[id]/summary/route.ts',
  'src/app/api/v1/cash/sessions/active/route.ts',
] as const) {
  const src = crudo(ruta);
  ok(`${ruta}: 0 ': any'`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta}: catch status+code+message (const e = ...CAST)`,
    src.includes(`const e = error as ${CAST};`) && src.includes('message: e.message } },\n      { status, headers: resHeaders }'));
}

// ═══════════════════ cash/sessions/[id]/movements/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/cash/sessions/[id]/movements/route.ts');
  ok("cash/sessions/[id]/movements: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('cash/sessions/[id]/movements: GET + POST catch status+code+message (const e = ...CAST x2)',
    (src.match(new RegExp(`const e = error as ${CAST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'g')) || []).length === 2);
}

// ═══════════════════ cash/sessions/[id]/print/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/cash/sessions/[id]/print/route.ts');
  ok("cash/sessions/[id]/print: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('cash/sessions/[id]/print: catch unknown + .message||fallback',
    src.includes('} catch (error: unknown) {') && src.includes("message: (error as Error).message || 'Ocurrió un error al generar el reporte.'"));
}

// ═══════════════════ cash/sessions/[id]/ticket/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/cash/sessions/[id]/ticket/route.ts');
  ok("cash/sessions/[id]/ticket: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('cash/sessions/[id]/ticket: catch unknown + .message',
    src.includes("return NextResponse.json({ error: (error as Error).message }, { status: 500, headers: resHeaders });"));
}

// ═══════════════════ cash/sessions/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/cash/sessions/route.ts');
  ok("cash/sessions: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('cash/sessions: GET + POST catch status+code+message (const e = ...CAST x2)',
    (src.match(new RegExp(`const e = error as ${CAST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'g')) || []).length === 2);
}

// ═══════════════════ categories/[id]/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/categories/[id]/route.ts');
  ok("categories/[id]: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('categories/[id]: PUT catch unknown sin acceso a error.X',
    src.includes("console.error('Error updating category:', error);") && src.includes('} catch (error: unknown) {'));
  ok('categories/[id]: DELETE catch unknown, cast puntual solo para .code (no .message en este bloque)',
    src.includes("if ((error as { code?: string }).code === '23503') { // Foreign key violation"));
}

// ═══════════════════ categories/route.ts (2, sin acceso) ═══════════════════
{
  const src = crudo('src/app/api/v1/categories/route.ts');
  ok("categories/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('categories/route: GET + POST catch unknown sin acceso a error.X',
    (src.match(/\} catch \(error: unknown\) \{/g) || []).length === 2);
}

// ═══════════════════ company/settings/logo/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/company/settings/logo/route.ts');
  ok("company/settings/logo: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('company/settings/logo: catch unknown + .message||fallback',
    src.includes("message: (error as Error).message || 'Error interno del servidor'"));
}

// ═══════════════════ company/settings/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/company/settings/route.ts');
  ok("company/settings: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('company/settings: catch unknown + .message||fallback',
    src.includes("message: (error as Error).message || 'Error interno'"));
}

// ═══════════════════ cron/sincronizar-ecf/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/cron/sincronizar-ecf/route.ts');
  ok("cron/sincronizar-ecf: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('cron/sincronizar-ecf: catch unknown, preserva ?. en las 2 lecturas de .message',
    src.includes("{ error: (error as Error)?.message }") &&
    src.includes("message: (error as Error)?.message || 'Error desconocido.'"));
}

// ═══════════════════ customers/[id]/history/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/customers/[id]/history/route.ts');
  ok("customers/[id]/history: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('customers/[id]/history: catch unknown, .message casteado 3 veces',
    src.includes('} catch (error: unknown) {') &&
    (src.match(/\(error as Error\)\.message/g) || []).length === 3);
}

// ═══════════════════ customers/[id]/route.ts (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/customers/[id]/route.ts');
  ok("customers/[id]/route: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('customers/[id]/route: GET + PUT + DELETE catch status+code+message (const e = ...CAST x3)',
    (src.match(new RegExp(`const e = error as ${CAST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'g')) || []).length === 3);
  ok('customers/[id]/route: PUT conserva isDuplicate via e.message.includes',
    src.includes("const isDuplicate = e.message.includes('en uso');"));
}

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
