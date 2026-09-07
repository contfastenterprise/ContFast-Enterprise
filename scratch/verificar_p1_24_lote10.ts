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

// ═══════════════════ customers/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/customers/route.ts');
  ok("customers/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('customers/route: GET + POST catch status+code+message (const e = ...CAST x2)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
  ok('customers/route: POST conserva isDuplicate via e.message.includes',
    src.includes("const isDuplicate = e.message.includes('ya existe') || e.message.includes('duplicate');"));
}

// ═══════════════════ dashboard/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/dashboard/route.ts');
  ok("dashboard/route: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('dashboard/route: catch (err: unknown) + .message',
    src.includes('} catch (err: unknown) {') && src.includes('message: (err as Error).message'));
}

// ═══════════════════ delivery-notes/[id]/approve, [id]/route (2), apply-code, route (2) -- todos status+code+message ═══════════════════
for (const [ruta, n] of [
  ['src/app/api/v1/delivery-notes/[id]/approve/route.ts', 1],
  ['src/app/api/v1/delivery-notes/[id]/route.ts', 2],
  ['src/app/api/v1/delivery-notes/apply-code/route.ts', 1],
  ['src/app/api/v1/delivery-notes/route.ts', 2],
] as const) {
  const src = crudo(ruta);
  ok(`${ruta}: 0 ': any' (${n} antes)`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta}: catch status+code+message (const e = ...CAST x${n})`,
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === n);
}

// ═══════════════════ delivery-notes/[id]/print/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/delivery-notes/[id]/print/route.ts');
  ok("delivery-notes/[id]/print: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('delivery-notes/[id]/print: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('${(error as Error).message}`'));
}

// ═══════════════════ dgii/rnc/[rnc]/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/dgii/rnc/[rnc]/route.ts');
  ok("dgii/rnc/[rnc]: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('dgii/rnc/[rnc]: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('message: (error as Error).message'));
}

// ═══════════════════ ecf/[id]/dgii-status/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/[id]/dgii-status/route.ts');
  ok("ecf/[id]/dgii-status: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/[id]/dgii-status: catch interno (err) unknown + .message',
    src.includes('} catch (err: unknown) {') && src.includes("message: (err as Error).message } },\n        { status: 500, headers: resHeaders }"));
  ok('ecf/[id]/dgii-status: catch externo status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`) && src.includes("code: e.code || 'SERVER_ERROR', message: e.message"));
}

// ═══════════════════ ecf/[id]/resubmit/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/[id]/resubmit/route.ts');
  ok("ecf/[id]/resubmit: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/[id]/resubmit: catch status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`) && src.includes("code: e.code || 'SERVER_ERROR', message: e.message"));
}

// ═══════════════════ ecf/dgii-status/batch/route.ts (5) ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/dgii-status/batch/route.ts');
  ok("ecf/dgii-status/batch: 0 ': any' (5 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/dgii-status/batch: catch interno (err) unknown + .message',
    src.includes('} catch (err: unknown) {') && src.includes("message: (err as Error).message } },\n        { status: 500, headers: resHeaders }"));
  ok('ecf/dgii-status/batch: dgiiMessages tipado con la forma real (valor/codigo)',
    src.includes('let dgiiMessages: { valor?: string; codigo?: number }[] = [];'));
  ok('ecf/dgii-status/batch: filter/map de dgiiMessages sin any (infiere del array tipado)',
    src.includes("dgiiMessages.filter((m) => m.valor && m.valor.trim() !== '' && m.codigo !== 0)") &&
    src.includes('validMsgs.map((m) => m.valor)'));
  ok('ecf/dgii-status/batch: catch externo status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`) && src.includes("code: e.code || 'SERVER_ERROR', message: e.message"));
}

// ═══════════════════ ecf/queue/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/queue/route.ts');
  ok("ecf/queue: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/queue: catch status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ ecf/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/route.ts');
  ok("ecf/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/route: importa type SQL de drizzle-orm',
    src.includes("import { eq, and, isNull, desc, count, ilike, gte, lte, sql, notInArray, type SQL } from 'drizzle-orm';"));
  ok('ecf/route: conditions tipado SQL[]', src.includes('const conditions: SQL[] = ['));
  ok('ecf/route: catch status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ ecf/sequences/[id]/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/sequences/[id]/route.ts');
  ok("ecf/sequences/[id]: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/sequences/[id]: updateFields tipado Partial<typeof ecfSequences.$inferInsert>',
    src.includes('const updateFields: Partial<typeof ecfSequences.$inferInsert> = { updatedAt: new Date() };'));
  ok('ecf/sequences/[id]: catch status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ ecf/sequences/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/sequences/route.ts');
  ok("ecf/sequences/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/sequences/route: GET + POST catch status+code+message (const e = ...CAST x2)',
    (src.match(new RegExp(`const e = error as ${CAST_RE};`, 'g')) || []).length === 2);
}

// ═══════════════════ ecf/stats/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/ecf/stats/route.ts');
  ok("ecf/stats: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('ecf/stats: catch status+code+message (const e = ...CAST)',
    src.includes(`const e = error as ${CAST};`));
}

// ═══════════════════ expenses/[id]/print/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/expenses/[id]/print/route.ts');
  ok("expenses/[id]/print: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('expenses/[id]/print: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('${(error as Error).message}`'));
}

// ═══════════════════ expenses/[id]/route.ts (16) ═══════════════════
{
  const src = crudo('src/app/api/v1/expenses/[id]/route.ts');
  ok("expenses/[id]/route: 0 ': any' (16 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('expenses/[id]/route: importa type DbTransaction de @/db',
    src.includes("import { db, type DbTransaction, expenses, expenseLines,"));
  ok('expenses/[id]/route: revertirAsientoContable(tx: DbTransaction, ...)',
    src.includes('async function revertirAsientoContable(\n  tx: DbTransaction,\n  companyId: string,'));
  ok('expenses/[id]/route: revertirMovimientosInventario(tx: DbTransaction, ...)',
    src.includes('async function revertirMovimientosInventario(\n  tx: DbTransaction,\n  companyId: string,'));
  ok('expenses/[id]/route: lineas.map/originales.map/yaRevertidos.map/snapshotAsientos*.map sin any (infieren de tx tipado)',
    src.includes('lines: lineas.map((l) => ({') &&
    src.includes('const idsOriginales = originales.map((m) => m.id);') &&
    src.includes('const idsYaRevertidos = new Set(yaRevertidos.map((r) => r.referenceId));') &&
    src.includes('const idsAsientosSnapshot = snapshotAsientos.map((j) => j.id);') &&
    src.includes('const idsAsientosPut = snapshotAsientosPut.map((j) => j.id);'));
  ok('expenses/[id]/route: GET + PUT catch (err: unknown) + .message (2)',
    (src.match(/\} catch \(err: unknown\) \{\n    console\.error\('Error (fetching expense details|editing expense):', err\);\n    return NextResponse\.json\(\{ success: false, error: \{ message: \(err as Error\)\.message \} \}, \{ status: 500 \}\);/g) || []).length === 2);
  ok('expenses/[id]/route: 4 errores tipados Error & {status?, code?} con err.status = 409 (periodo cerrado x2, pagos aplicados, pagos suplidor)',
    (src.match(/const err: Error & \{ status\?: number; code\?: string \} = new Error\(/g) || []).length === 4);
  ok('expenses/[id]/route: appliedCount filter + linkedCheckIds map sin any',
    src.includes("const appliedCount = apPaymentRows.filter((r) => r.status === 'applied').length;") &&
    src.includes('.map((r) => r.checkId)'));
  ok('expenses/[id]/route: DELETE catch unknown, cast compartido para status+message',
    src.includes("} catch (err: unknown) {\n    console.error('Error deleting expense:', err);") &&
    src.includes(`const e = err as ${CAST};`) &&
    src.includes('status: e.status || 500'));
}

// ═══════════════════ expenses/report/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/expenses/report/route.ts');
  ok("expenses/report: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('expenses/report: filters tipado SQL[] (con type SQL importado)',
    src.includes("import { eq, and, sql, between, type SQL } from 'drizzle-orm';") &&
    src.includes('const filters: SQL[] = ['));
  ok('expenses/report: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes('${(error as Error).message}`'));
}

// ═══════════════════ expenses/route.ts (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/expenses/route.ts');
  ok("expenses/route: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('expenses/route: filters tipado SQL[] (con type SQL importado)',
    src.includes("import { eq, sql, and, between, inArray, type SQL } from 'drizzle-orm';") &&
    src.includes('const filters: SQL[] = ['));
  ok('expenses/route: POST + GET catch status+message (const e = ...CAST x2)',
    (src.match(new RegExp(`const e = err as ${CAST_RE};`, 'g')) || []).length === 2);
}

// ═══════════════════ expenses/types/[id]/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/expenses/types/[id]/route.ts');
  ok("expenses/types/[id]: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('expenses/types/[id]: PUT + DELETE catch unknown + .message (2)',
    (src.match(/\(err as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ expenses/types/route.ts (2) ═══════════════════
{
  const src = crudo('src/app/api/v1/expenses/types/route.ts');
  ok("expenses/types/route: 0 ': any' (2 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('expenses/types/route: GET + POST catch unknown + .message (2)',
    (src.match(/\(err as Error\)\.message/g) || []).length === 2);
}

// ═══════════════════ financial/dashboard/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/financial/dashboard/route.ts');
  ok("financial/dashboard: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('financial/dashboard: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes("message: (error as Error).message"));
}

// ═══════════════════ financial/statements/customers/[id]/print/route.ts (6) ═══════════════════
{
  const src = crudo('src/app/api/v1/financial/statements/customers/[id]/print/route.ts');
  ok("financial/statements/customers/[id]/print: 0 ': any' (6 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('financial/statements/customers/[id]/print: pendingInvoices.map/movements.filter sin any (5 callbacks)',
    src.includes('statementData.pendingInvoices.map((pi) => pi.ncf || pi.codigoFactura)') &&
    src.includes('movements.filter((m) => pendingIds.has(m.documentNumber));') &&
    src.includes('.filter((pi) => pi.dueDate < today)') &&
    src.includes('.map((pi) => pi.ncf || pi.codigoFactura)') &&
    src.includes('movements.filter((m) => overdueIds.has(m.documentNumber));'));
  ok('financial/statements/customers/[id]/print: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes("message: (error as Error).message"));
}

// ═══════════════════ financial/statements/customers/[id]/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/financial/statements/customers/[id]/route.ts');
  ok("financial/statements/customers/[id]/route: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('financial/statements/customers/[id]/route: catch unknown, .message casteado 3 veces',
    src.includes('} catch (error: unknown) {') &&
    (src.match(/\(error as Error\)\.message/g) || []).length === 3);
}

// ═══════════════════ financial/statements/suppliers/[id]/print/route.ts (3) ═══════════════════
{
  const src = crudo('src/app/api/v1/financial/statements/suppliers/[id]/print/route.ts');
  ok("financial/statements/suppliers/[id]/print: 0 ': any' (3 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('financial/statements/suppliers/[id]/print: movements.filter sin any (2 callbacks)',
    src.includes('movements.filter((m) => pendingNcfs.has(m.documentNumber));') &&
    src.includes('movements.filter((m) => overdueNcfs.has(m.documentNumber));'));
  ok('financial/statements/suppliers/[id]/print: catch unknown + .message',
    src.includes('} catch (error: unknown) {') && src.includes("message: (error as Error).message"));
}

// ═══════════════════ financial/statements/suppliers/[id]/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/financial/statements/suppliers/[id]/route.ts');
  ok("financial/statements/suppliers/[id]/route: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('financial/statements/suppliers/[id]/route: catch unknown, .message casteado 3 veces',
    src.includes('} catch (error: unknown) {') &&
    (src.match(/\(error as Error\)\.message/g) || []).length === 3);
}

// ═══════════════════ hr/config, departments, entries, payroll, positions, settlements (catches "simples", sin acceso mas que .message) ═══════════════════
for (const [ruta, n] of [
  ['src/app/api/v1/hr/config/route.ts', 2],
  ['src/app/api/v1/hr/departments/route.ts', 4],
  ['src/app/api/v1/hr/entries/route.ts', 3],
  ['src/app/api/v1/hr/payroll/[id]/receipts/route.ts', 1],
  ['src/app/api/v1/hr/payroll/route.ts', 4],
  ['src/app/api/v1/hr/positions/route.ts', 4],
  ['src/app/api/v1/hr/settlements/[id]/print/route.ts', 1],
  ['src/app/api/v1/hr/settlements/route.ts', 3],
] as const) {
  const src = crudo(ruta);
  ok(`${ruta}: 0 ': any' (${n} antes)`, sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok(`${ruta}: ${n} catch(es) unknown + .message inline`,
    (src.match(/\} catch \(error: unknown\) \{\n    return NextResponse\.json\(\{ success: false, error: \{ message: \(error as Error\)\.message \} \}, \{ status: 500 \}\);\n  \}/g) || []).length === n);
}

// ═══════════════════ hr/employees/route.ts (4) ═══════════════════
{
  const src = crudo('src/app/api/v1/hr/employees/route.ts');
  ok("hr/employees: 0 ': any' (4 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('hr/employees: GET + PUT + DELETE catch unknown + .message inline (3)',
    (src.match(/\} catch \(error: unknown\) \{\n    return NextResponse\.json\(\{ success: false, error: \{ message: \(error as Error\)\.message \} \}, \{ status: 500 \}\);\n  \}/g) || []).length === 3);
  ok('hr/employees: POST catch unknown, const e = error as Error, isDup via e.message',
    src.includes('} catch (error: unknown) {\n    const e = error as Error;\n    const isDup = e.message.includes'));
}

// ═══════════════════ hr/vacations/route.ts (5) ═══════════════════
{
  const src = crudo('src/app/api/v1/hr/vacations/route.ts');
  ok("hr/vacations: 0 ': any' (5 antes)", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('hr/vacations: GET saldos.map sin any', src.includes('const data = saldos.map((s) => {'));
  ok('hr/vacations: GET catch unknown + .message inline',
    src.includes("} catch (error: unknown) {\n    return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });\n  }\n}\n\nexport async function POST(req: NextRequest) {"));
  ok('hr/vacations: POST actual = saldos.find sin any (sin anotacion, se infiere)',
    src.includes('const actual = saldos.find((s) => s.employeeId === employeeId);'));
  ok('hr/vacations: POST catch unknown, const e = error as Error',
    src.includes("} catch (error: unknown) {\n    const e = error as Error;\n    const status = e.message === 'Empleado no encontrado' ? 404 : 500;"));
}

// ═══════════════════ inventory/adjustments/route.ts ═══════════════════
{
  const src = crudo('src/app/api/v1/inventory/adjustments/route.ts');
  ok("inventory/adjustments: 0 ': any'", sinAny(src) === 0, `quedan ${sinAny(src)}`);
  ok('inventory/adjustments: catch status+message (const e = ...CAST)',
    src.includes(`const e = err as ${CAST};`) && src.includes('const status = e.status || 500;'));
}

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
