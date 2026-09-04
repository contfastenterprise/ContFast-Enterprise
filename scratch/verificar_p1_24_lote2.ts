/**
 * P1-24: 'tx: any' sistematico (lote 2/N).
 *
 * Cubre src/services/accounting/resolverCuentas.ts (4 ocurrencias),
 * src/repositories/reportRepository.ts (6) y src/services/inventoryService.ts
 * (9) -- 19 ocurrencias de ': any' resueltas.
 *
 * resolverCuentas.ts: los 4 parametros tx no tienen default -- todos los
 * callers reales pasan una transaccion genuina (nunca `db`), asi que se
 * tipan `DbTransaction` (estricto).
 *
 * inventoryService.ts: los 5 parametros tx SI tienen `= db` como default
 * (y al menos dos callers reales -- CheckStockTool.ts y
 * products/[id]/inventory/route.ts -- omiten el argumento y usan ese
 * default), asi que se tipan `typeof db` (el tipo mas amplio, del que
 * DbTransaction es subtipo), igual que en el lote 1. Las 4 anotaciones any
 * restantes eran callbacks de .map()/.reduce() corriente abajo de esos tx,
 * ahora redundantes y eliminadas.
 *
 * reportRepository.ts: sin parametros tx -- solo 6 arrays acumuladores de
 * filas de chartOfAccounts con un campo `net` calculado, tipados con
 * `typeof chartOfAccounts.$inferSelect & { net: number }`.
 *
 * Banco de solo-codigo.
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const sinAny = (path: string) => {
  const c = crudo(path);
  ok(`${path}: 0 ocurrencias de ': any'`,
    (c.match(/: any/g) || []).length === 0,
    `quedan ${(c.match(/: any/g) || []).length}`);
};

console.log('\n=== resolverCuentas.ts ===\n');

const resolver = fuente('src/services/accounting/resolverCuentas.ts');

sinAny('src/services/accounting/resolverCuentas.ts');

ok("importa DbTransaction de '@/db'",
  /import \{ accountingMappings, bankAccounts, chartOfAccounts, type DbTransaction \} from '@\/db';/.test(resolver));

ok('los 4 tx quedan tipados DbTransaction (estricto -- ningun caller real pasa `db`)',
  /async function validarCuenta\(\s*\n\s*tx: DbTransaction,/.test(resolver) &&
  /export async function resolverCuentaDeBanco\(\s*\n\s*tx: DbTransaction,/.test(resolver) &&
  /export async function resolverCuentaPorMapeo\(\s*\n\s*tx: DbTransaction,/.test(resolver) &&
  /export async function resolverCuentaPorPagar\(\s*\n\s*tx: DbTransaction,/.test(resolver));

console.log('\n=== reportRepository.ts ===\n');

const reportRepo = fuente('src/repositories/reportRepository.ts');

sinAny('src/repositories/reportRepository.ts');

const TIPO_CUENTA = '\\(typeof chartOfAccounts\\.\\$inferSelect & \\{ net: number \\}\\)';
ok('getIncomeStatement: revenueAccounts/expenseAccounts/costAccounts tipados con la fila de chartOfAccounts + net',
  new RegExp(`const revenueAccounts: ${TIPO_CUENTA}\\[\\] = \\[\\];`).test(reportRepo) &&
  new RegExp(`const expenseAccounts: ${TIPO_CUENTA}\\[\\] = \\[\\];`).test(reportRepo) &&
  new RegExp(`const costAccounts: ${TIPO_CUENTA}\\[\\] = \\[\\];`).test(reportRepo));

ok('getBalanceSheet: assetAccounts/liabilityAccounts/equityAccounts con el mismo tipo',
  new RegExp(`const assetAccounts: ${TIPO_CUENTA}\\[\\] = \\[\\];`).test(reportRepo) &&
  new RegExp(`const liabilityAccounts: ${TIPO_CUENTA}\\[\\] = \\[\\];`).test(reportRepo) &&
  new RegExp(`const equityAccounts: ${TIPO_CUENTA}\\[\\] = \\[\\];`).test(reportRepo));

console.log('\n=== inventoryService.ts ===\n');

const inv = fuente('src/services/inventoryService.ts');

sinAny('src/services/inventoryService.ts');

ok('los 5 tx con default `= db` quedan tipados `typeof db` (no DbTransaction -- callers reales omiten el argumento y usan `db`)',
  /export async function llevaInventario\(\s*\n\s*companyId: string,\s*\n\s*productId: string,\s*\n\s*tx: typeof db = db\s*\n\s*\): Promise<boolean> \{/.test(inv) &&
  /export async function getProvisionalStock\(companyId: string, modo: 'PRODUCCION' \| 'PRUEBA', productId: string, warehouseId: string, tx: typeof db = db\): Promise<number> \{/.test(inv) &&
  /tx: typeof db = db,\s*\n\s*useProvisional = false/.test(inv) &&
  (inv.match(/tx: typeof db = db\s*\n\)/g) || []).length === 3);

ok('las 4 anotaciones any en .map()\\/.reduce() corriente abajo se eliminaron sin reemplazo',
  /activeInvoices\.map\(\(inv\) => inv\.id\)/.test(inv) &&
  /lines\.reduce\(\(acc: number, line\) => acc \+ Number\(line\.quantity\), 0\)/.test(inv) &&
  /approvedNotes\.map\(\(note\) => note\.id\)/.test(inv) &&
  /delLines\.reduce\(\(acc: number, line\) => acc \+ Number\(line\.quantity\), 0\)/.test(inv));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
