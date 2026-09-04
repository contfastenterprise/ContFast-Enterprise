/**
 * P1-24: 'tx: any' sistematico en repositorios financieros/contables.
 *
 * Primer lote (de 172 ocurrencias totales en el repo): los 4 archivos que
 * la propia auditoria senala como concentracion --
 * accountingRepository.ts, apRepository.ts, arRepository.ts,
 * middleware/permissions.ts -- 30 ocurrencias de ': any' resueltas.
 *
 * La mayoria son parametros de transaccion (tx/externalTx/transactionContext)
 * tipados con `DbTransaction` (ya existente en src/db/index.ts). Dos casos
 * (isPeriodOpen y createJournalEntry en accountingRepository.ts,
 * seedRolePermissionsForCompany en permissions.ts) aceptan EN LA PRACTICA
 * tanto `db` como una transaccion real -- `DbTransaction` no acepta `db`
 * (PgTransaction extends PgDatabase, con miembros protected extra que
 * PgDatabase no tiene), asi que esos tres usan el tipo mas amplio
 * `typeof db`, del que DbTransaction es subtipo. El resto son anotaciones
 * `any` redundantes en callbacks de .map()/.find() sobre resultados ya
 * tipados (se eliminan sin reemplazo) o arrays de fragmentos where de
 * Drizzle (tipados como SQL[]).
 *
 * Banco de solo-codigo.
 */
import { fuente, bloque, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const sinAny = (path: string) => {
  const c = crudo(path);
  ok(`${path}: 0 ocurrencias de ': any' (solo-codigo, no toca la logica)`,
    (c.match(/: any/g) || []).length === 0,
    `quedan ${(c.match(/: any/g) || []).length}`);
};

console.log('\n=== accountingRepository.ts ===\n');

const accRepo = fuente('src/repositories/accountingRepository.ts');

sinAny('src/repositories/accountingRepository.ts');

ok("importa DbTransaction de '@/db'",
  /import type \{ DbTransaction \} from '@\/db';/.test(accRepo));

ok('isPeriodOpen: tx tipado como `typeof db = db` (no DbTransaction -- el default es `db`, que no es una transaccion real)',
  /tx: typeof db = db\): Promise<boolean> \{/.test(accRepo));

ok('createJournalEntry: firma acepta DbTransaction o el payload de datos (union), sin any',
  /static async createJournalEntry\(txOrData: DbTransaction \| CreateJournalEntryInput \| NewJournalEntry, dataInput\?: CreateJournalEntryInput \| NewJournalEntry\) \{/.test(accRepo));

ok('createJournalEntry: variable local tx tipada `typeof db = db`, con aserto a DbTransaction cuando en verdad viene una transaccion',
  /let tx: typeof db = db;/.test(accRepo) &&
  /data = txOrData as CreateJournalEntryInput \| NewJournalEntry;/.test(accRepo) &&
  /tx = txOrData as DbTransaction;/.test(accRepo));

ok('createJournalEntry: el llamado a executeInsertion en el branch "ya es una tx real" (else de `tx === db`) tiene el aserto a DbTransaction',
  /\} else \{\s*\n\s*return await executeInsertion\(tx as DbTransaction\);\s*\n\s*\}/.test(accRepo));

ok('executeInsertion tipado DbTransaction (ya no any)',
  /const executeInsertion = async \(transactionContext: DbTransaction\) => \{/.test(accRepo));

ok('anotaciones any redundantes en .map()/.find() eliminadas sin reemplazo (line/c/cuenta/m/a/p)',
  /data\.lines\.map\(\(line\) => line\.accountId\)/.test(accRepo) &&
  /cuentasEncontradas\.map\(\(c\) => \[c\.id, c\]\)/.test(accRepo) &&
  /const cuenta = cuentaPorId\.get\(cuentaId\);/.test(accRepo) &&
  /mappings\.map\(\(m\) => m\.mappingKey\)/.test(accRepo) &&
  /chart\.find\(\(a\) => a\.code === mapping\.code\)/.test(accRepo) &&
  /existentes\.map\(\(p\) => `\$\{p\.modo\}\|\$\{p\.startDate\}`\)/.test(accRepo));

ok('createAccountsReceivable y createAccountsPayable: tx tipado DbTransaction',
  /static async createAccountsReceivable\(tx: DbTransaction, data: \{/.test(accRepo) &&
  /static async createAccountsPayable\(tx: DbTransaction, data: \{/.test(accRepo));

ok('sembrarPeriodosContables / seedDefaultChartOfAccounts / seedDefaultExpenseTypes: externalTx?: DbTransaction (x3) y execute (tx: DbTransaction) (x3)',
  (accRepo.match(/externalTx\?: DbTransaction/g) || []).length === 3 &&
  (accRepo.match(/const execute = async \(tx: DbTransaction\) => \{/g) || []).length === 3);

console.log('\n=== apRepository.ts ===\n');

const apRepo = fuente('src/repositories/apRepository.ts');

sinAny('src/repositories/apRepository.ts');

ok("importa DbTransaction y SQL",
  /import \{ db, type DbTransaction \} from '@\/db';/.test(apRepo) &&
  /import \{ eq, and, sql, desc, isNull, lte, gte, ilike, or, inArray, type SQL \} from 'drizzle-orm';/.test(apRepo));

ok('los 6 metodos con tx quedan tipados DbTransaction (createPayment, bloquearAp, marcarChequeCobrado, marcarPagoAplicado, updateApBalance, createCheck)',
  /static async createPayment\(tx: DbTransaction, data: \{/.test(apRepo) &&
  /static async bloquearAp\(\s*\n\s*tx: DbTransaction,/.test(apRepo) &&
  /static async marcarChequeCobrado\(\s*\n\s*tx: DbTransaction,/.test(apRepo) &&
  /static async marcarPagoAplicado\(\s*\n\s*tx: DbTransaction,/.test(apRepo) &&
  /static async updateApBalance\(tx: DbTransaction, id: string, companyId: string, newBalance: number\) \{/.test(apRepo) &&
  /static async createCheck\(tx: DbTransaction, data: \{/.test(apRepo));

ok('los dos arrays de fragmentos where (conditions) quedan tipados SQL[] (antes any[])',
  (apRepo.match(/conditions: SQL\[\] = \[/g) || []).length === 2);

console.log('\n=== arRepository.ts ===\n');

const arRepo = fuente('src/repositories/arRepository.ts');

sinAny('src/repositories/arRepository.ts');

ok("importa DbTransaction de '@/db' (en la misma lista que el resto de tablas)",
  /type DbTransaction \} from '@\/db';/.test(arRepo));

ok('getOrCreateAccount: tx tipado DbTransaction',
  /private static async getOrCreateAccount\(tx: DbTransaction, companyId: string, code: string, name: string, type: 'asset' \| 'liability' \| 'equity' \| 'revenue' \| 'expense'\) \{/.test(arRepo));

console.log('\n=== middleware/permissions.ts ===\n');

const perms = fuente('src/middleware/permissions.ts');

sinAny('src/middleware/permissions.ts');

ok('los dos objetos de error con status/code quedan tipados Error & { status?, code? } (sin any)',
  (perms.match(/const err: Error & \{ status\?: number; code\?: string \} = new Error\(/g) || []).length === 2);

ok('seedRolePermissionsForCompany: tx tipado `typeof db` (se llama con `db` directo en auth\\/register\\/route.ts, y con una tx real en admin\\/companies y setup\\/confirm -- DbTransaction no acepta `db`)',
  /export async function seedRolePermissionsForCompany\(\s*\n\s*tx: typeof db,/.test(perms));

ok('DbTransaction ya no se importa en permissions.ts (no se volvio a usar tras tipar seedRolePermissionsForCompany como `typeof db`)',
  !/DbTransaction/.test(perms));

console.log('\n=== Ningun caller real pasa `db` donde se exige DbTransaction (verificado en el codigo fuente) ===\n');

ok('auth/register/route.ts sigue llamando a seedRolePermissionsForCompany con `db` directo (el motivo de por que ese parametro no puede ser DbTransaction)',
  /await seedRolePermissionsForCompany\(db, companyId, allRoles\);/.test(fuente('src/app/api/v1/auth/register/route.ts')));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
