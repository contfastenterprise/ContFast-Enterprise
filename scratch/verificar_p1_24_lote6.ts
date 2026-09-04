/**
 * P1-24: ': any' sistematico (lote 6/N) -- 14 archivos, 17 ocurrencias.
 *
 * Convenciones reutilizadas de lotes anteriores:
 *   - `tx: any = db` (parametro CON valor por defecto) -> `tx: typeof db = db`
 *     (DbTransaction no admite el objeto `db` completo: PgTransaction
 *     extiende PgDatabase con miembros protegidos que PgDatabase no tiene).
 *   - `tx: any` SIN valor por defecto (siempre una transaccion real) ->
 *     `tx: DbTransaction` (tipo exportado desde src/db/index.ts).
 *   - arrays de condiciones para `and(...conditions)` -> `SQL[]`.
 *   - objetos de update armados a mano para `.update(tabla).set(...)` ->
 *     `Partial<typeof tabla.$inferInsert>`.
 *   - `let` con default `any[]` reasignado condicionalmente -> se reescribe
 *     como un solo `const` con ternario, sin necesitar ningun tipo explicito
 *     (customerRepository.ts).
 *   - formas de datos armadas a mano que necesitan nombre -> interface local
 *     (DashboardAlert, CashFlowMetrics, CashFlowProposal).
 *
 * dashboardRepository.ts importa un tipo desde geminiService.ts hacia
 * agentRepository.ts -- patron ya presente en el repo (arRepository.ts,
 * companyRepository.ts, deliveryRepository.ts, dgiiSubmissionRepository.ts,
 * hrRepository.ts ya importan tipos de services/).
 *
 * Fuera del conteo de ': any' (no lleva los dos puntos, no es de las 17):
 * en bankRepository.ts se quito ademas `parseFloat(cuenta.balance as any)`
 * -> `parseFloat(cuenta.balance)`. bankAccounts.balance es `decimal(...)`,
 * que drizzle tipa como string por defecto -- el cast era innecesario.
 *
 * Banco de solo-codigo.
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const sinAny = (src: string) => (src.match(/: any/g) || []).length;

// ═══════════════════ supplierRepository.ts ═══════════════════
console.log('\n=== supplierRepository.ts ===\n');
{
  const src = fuente('src/repositories/supplierRepository.ts');
  const crd = crudo('src/repositories/supplierRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok("importa 'type SQL' de drizzle-orm",
    /import \{ eq, and, or, ilike, desc, sql, isNull, exists, type SQL \} from 'drizzle-orm';/.test(src));

  ok("findAll: conditions tipado SQL[] (antes any[])",
    /let conditions: SQL\[\] = \[/.test(src));
}

// ═══════════════════ productRepository.ts ═══════════════════
console.log('\n=== productRepository.ts ===\n');
{
  const src = fuente('src/repositories/productRepository.ts');
  const crd = crudo('src/repositories/productRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('update: updateValues tipado Partial<typeof products.$inferInsert> (antes any)',
    /const updateValues: Partial<typeof products\.\$inferInsert> = \{/.test(src));
}

// ═══════════════════ financialRepository.ts ═══════════════════
console.log('\n=== financialRepository.ts ===\n');
{
  const src = fuente('src/repositories/financialRepository.ts');
  const crd = crudo('src/repositories/financialRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok("importa 'type SQLWrapper' de drizzle-orm",
    /import \{ eq, and, desc, asc, sql, lte, gte, ilike, or, notInArray, type SQLWrapper \} from 'drizzle-orm';/.test(src));

  ok('isNull local: col tipado SQLWrapper (antes any)',
    /function isNull\(col: SQLWrapper\) \{/.test(src));
}

// ═══════════════════ deliveryRepository.ts ═══════════════════
console.log('\n=== deliveryRepository.ts ===\n');
{
  const src = fuente('src/repositories/deliveryRepository.ts');
  const crd = crudo('src/repositories/deliveryRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('getNextDeliveryNumber: tx tipado typeof db = db (antes any = db)',
    /getNextDeliveryNumber\(\s*\n\s*companyId: string,\s*\n\s*modo: 'PRODUCCION' \| 'PRUEBA',\s*\n\s*tx: typeof db = db\s*\n\s*\): Promise<string> \{/.test(src));
}

// ═══════════════════ dashboardRepository.ts ═══════════════════
console.log('\n=== dashboardRepository.ts ===\n');
{
  const src = fuente('src/repositories/dashboardRepository.ts');
  const crd = crudo('src/repositories/dashboardRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('define DashboardAlert con los campos exactos que arma el metodo',
    /interface DashboardAlert \{\s*\n\s*id: string;\s*\n\s*type: 'invoice_rejected' \| 'check_due';\s*\n\s*title: string;\s*\n\s*description: string;\s*\n\s*actionText: string;\s*\n\s*actionLink: string;\s*\n\s*\}/.test(src));

  ok('alertsDetails tipado DashboardAlert[] (antes any[])',
    /let alertsDetails: DashboardAlert\[\] = \[\];/.test(src));
}

// ═══════════════════ customerRepository.ts ═══════════════════
console.log('\n=== customerRepository.ts ===\n');
{
  const src = fuente('src/repositories/customerRepository.ts');
  const crd = crudo('src/repositories/customerRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('recentPayments reescrito como un solo const con ternario (ya no let any[] + reasignacion condicional)',
    /const recentPayments = customerInvoiceIds\.length > 0\s*\n\s*\? await db/.test(src) &&
    !/let recentPayments/.test(src));

  ok('la rama vacia del ternario devuelve []',
    /\.limit\(10\)\s*\n\s*: \[\];/.test(src));
}

// ═══════════════════ companyRepository.ts ═══════════════════
console.log('\n=== companyRepository.ts ===\n');
{
  const src = fuente('src/repositories/companyRepository.ts');
  const crd = crudo('src/repositories/companyRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok("importa 'type DbTransaction' de @/db",
    /import \{ db, companies, companySettings, ecfSequences, type DbTransaction \} from '@\/db';/.test(src));

  ok('allocateNextNcf: tx tipado DbTransaction (antes any, sin default -- siempre transaccion real)',
    /static async allocateNextNcf\(tx: DbTransaction, companyId: string, ecfType: string, modo: 'PRODUCCION' \| 'PRUEBA' = 'PRODUCCION'\): Promise<string> \{/.test(src));
}

// ═══════════════════ cashRepository.ts ═══════════════════
console.log('\n=== cashRepository.ts ===\n');
{
  const src = fuente('src/repositories/cashRepository.ts');
  const crd = crudo('src/repositories/cashRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok("importa 'type DbTransaction' de @/db",
    /import \{ db, cashRegisters, cashSessions, cashMovements, cashSessionSummary, type DbTransaction \} from '@\/db';/.test(src));

  ok('addMovement: tx tipado DbTransaction (antes any, sin default)',
    /static async addMovement\(tx: DbTransaction, data: \{/.test(src));
}

// ═══════════════════ geminiService.ts ═══════════════════
console.log('\n=== geminiService.ts ===\n');
{
  const src = fuente('src/services/geminiService.ts');
  const crd = crudo('src/services/geminiService.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('define CashFlowMetrics con la forma exacta que le pasa el llamador',
    /export interface CashFlowMetrics \{\s*\n\s*periodDays: number;\s*\n\s*metrics: \{\s*\n\s*totalInvoiced: number;\s*\n\s*totalCollected: number;\s*\n\s*totalExpenses: number;\s*\n\s*netCashFlow: number;\s*\n\s*pendingAccountsReceivable: number;\s*\n\s*\};\s*\n\s*\}/.test(src));

  ok('define CashFlowProposal con la forma exacta que devuelve/consume createProposal',
    /export interface CashFlowProposal \{\s*\n\s*summary: string;\s*\n\s*justification: string;\s*\n\s*confidenceLevel: 'alta' \| 'media' \| 'baja';\s*\n\s*riskLevel: 'bajo' \| 'medio' \| 'alto';\s*\n\s*\}/.test(src));

  ok('analyzeCashFlow: firma metrics: CashFlowMetrics, retorno Promise<CashFlowProposal>',
    /static async analyzeCashFlow\(metrics: CashFlowMetrics\): Promise<CashFlowProposal> \{/.test(src));

  ok('el JSON.parse final se castea a CashFlowProposal (antes devolvia any implicito)',
    /return JSON\.parse\(textResponse\) as CashFlowProposal;/.test(src));
}

// ═══════════════════ agentRepository.ts ═══════════════════
console.log('\n=== agentRepository.ts ===\n');
{
  const src = fuente('src/repositories/agentRepository.ts');
  const crd = crudo('src/repositories/agentRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok("importa 'type CashFlowProposal' de @/services/geminiService (patron ya usado en el repo: repositorios importando tipos de services/)",
    /import type \{ CashFlowProposal \} from '@\/services\/geminiService';/.test(src));

  ok('createProposal: aiResult tipado CashFlowProposal (antes any)',
    /static async createProposal\(companyId: string, modo: 'PRODUCCION' \| 'PRUEBA', area: string, aiResult: CashFlowProposal\) \{/.test(src));
}

// ═══════════════════ adminRepository.ts ═══════════════════
console.log('\n=== adminRepository.ts ===\n');
{
  const src = fuente('src/repositories/adminRepository.ts');
  const crd = crudo('src/repositories/adminRepository.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('updateData tipado Partial<typeof users.$inferInsert> (antes any)',
    /const updateData: Partial<typeof users\.\$inferInsert> = \{/.test(src));
}

// ═══════════════════ invoiceRepository.ts ═══════════════════
console.log('\n=== invoiceRepository.ts ===\n');
{
  const src = fuente('src/repositories/invoiceRepository.ts');
  const crd = crudo('src/repositories/invoiceRepository.ts');

  ok("0 ocurrencias de ': any' (2 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok("importa 'type DbTransaction' de @/db",
    /import \{ db, invoices, invoiceLines, invoiceTaxes, products, customers, invoiceRetentions, RepositoryContext, withTenantMode, type DbTransaction \} from '@\/db';/.test(src));

  ok('create: externalTx?: DbTransaction (antes any)',
    /static async create\(data: CreateInvoiceInput, externalTx\?: DbTransaction\) \{/.test(src));

  ok('runInTx: tx tipado DbTransaction (antes any)',
    /const runInTx = async \(tx: DbTransaction\) => \{/.test(src));

  ok('sigue llamando db.transaction(runInTx) cuando no hay externalTx, y runInTx(externalTx) cuando si',
    /if \(externalTx\) \{\s*\n\s*return await runInTx\(externalTx\);\s*\n\s*\}\s*\n\s*return await db\.transaction\(runInTx\);/.test(src));
}

// ═══════════════════ dgiiSubmissionRepository.ts ═══════════════════
console.log('\n=== dgiiSubmissionRepository.ts ===\n');
{
  const src = fuente('src/repositories/dgiiSubmissionRepository.ts');
  const crd = crudo('src/repositories/dgiiSubmissionRepository.ts');

  ok("0 ocurrencias de ': any' (2 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('envioVigente: tx tipado typeof db = db (antes any = db)',
    /export async function envioVigente\(\s*\n\s*invoiceId: string,\s*\n\s*companyId: string,\s*\n\s*modo: Modo,\s*\n\s*tx: typeof db = db\s*\n\s*\) \{/.test(src));

  ok('envioEnCurso: tx tipado typeof db = db (antes any = db)',
    /export async function envioEnCurso\(\s*\n\s*invoiceId: string,\s*\n\s*companyId: string,\s*\n\s*tx: typeof db = db\s*\n\s*\): Promise<string \| null> \{/.test(src));
}

// ═══════════════════ bankRepository.ts ═══════════════════
console.log('\n=== bankRepository.ts ===\n');
{
  const src = fuente('src/repositories/bankRepository.ts');
  const crd = crudo('src/repositories/bankRepository.ts');

  ok("0 ocurrencias de ': any' (2 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('saldo: tx tipado typeof db = db (antes any = db)',
    /bankAccountId: string,\s*\n\s*companyId: string,\s*\n\s*modo: 'PRODUCCION' \| 'PRUEBA',\s*\n\s*tx: typeof db = db\s*\n\s*\): Promise<number> \{\s*\n\s*const \[fila\] = await tx\.select/.test(src));

  ok('ajustarSaldo: tx tipado typeof db = db (antes any = db)',
    /delta: number,\s*\n\s*tx: typeof db = db\s*\n\s*\): Promise<number> \{/.test(src));

  ok('cuenta.balance sin cast `as any` (bonus, fuera del conteo de : any)',
    /return cuenta \? parseFloat\(cuenta\.balance\) : 0;/.test(src) &&
    !/cuenta\.balance as any/.test(crd));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
