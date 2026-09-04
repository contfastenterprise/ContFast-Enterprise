/**
 * P1-24: 'tx: any' sistematico (lote 3/N) -- hrRepository.ts.
 *
 * 15 ocurrencias de ': any' resueltas (el grep por linea daba 14 porque
 * logAudit tiene dos -- oldValues y newValues -- en la misma linea).
 *
 * - 1 parametro tx (recalculatePayrollTx): DbTransaction estricto -- sus dos
 *   callers (createPayroll, recalculatePayroll) siempre pasan una tx real de
 *   db.transaction(), sin default `= db`.
 * - 4 anotaciones any redundantes en .map()/.then() corriente abajo de ese
 *   tx, eliminadas sin reemplazo.
 * - 8 parametros `data: any` (createEmployee, updateEmployee,
 *   updatePayrollConfig, createOvertimeRecord, createIncomeRecord,
 *   createDeductionRecord, createLeave, createSettlement) tipados con el
 *   tipo de insercion real de Drizzle de cada tabla (`$inferInsert`), con
 *   overrides puntuales en los campos que el propio codigo convierte de
 *   numero a string via .toString() antes de insertar -- verificado contra
 *   los schemas zod de cada ruta que llama a estos metodos, no solo contra
 *   el cuerpo de hrRepository.ts.
 * - 2 parametros de logAudit (oldValues/newValues): `unknown`, no un tipo
 *   inventado -- son snapshots JSON (columnas jsonb) de auditoria de
 *   entidades de tipos muy distintos (empleados, nominas, departamentos,
 *   configuracion...), asi que no hay una forma unica honesta que ponerles.
 *
 * Banco de solo-codigo.
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const hr = fuente('src/repositories/hrRepository.ts');
const hrCrudo = crudo('src/repositories/hrRepository.ts');

ok("0 ocurrencias de ': any' (15 antes, incluyendo las 2 de la misma linea en logAudit)",
  (hrCrudo.match(/: any/g) || []).length === 0,
  `quedan ${(hrCrudo.match(/: any/g) || []).length}`);

ok("importa DbTransaction de '@/db' (linea separada)",
  /import type \{ DbTransaction \} from '@\/db';/.test(hr));

ok('recalculatePayrollTx: tx tipado DbTransaction (sin default -- los dos callers pasan una tx real)',
  /private static async recalculatePayrollTx\(tx: DbTransaction, payrollId: string, companyId: string, modo: Modo\) \{/.test(hr));

ok('las 4 anotaciones any corriente abajo de ese tx se eliminaron sin reemplazo (rows/e/b/d)',
  /\.then\(\(rows\) => rows\[0\]\);/.test(hr) &&
  /activeEmployees\.map\(\(e\) => e\.id\)/.test(hr) &&
  /brackets\.map\(\(b\) => \(\{/.test(hr) &&
  /details\.map\(\(d\) => d\.employeeId\)/.test(hr));

ok('createEmployee: data tipado con employees.$inferInsert (salario numerico, se convierte a string antes de insertar)',
  /static async createEmployee\(companyId: string, modo: Modo, data: Omit<typeof employees\.\$inferInsert, 'id' \| 'companyId' \| 'salary' \| 'createdAt' \| 'updatedAt' \| 'deletedAt'> & \{ salary: number \}\) \{/.test(hr));

ok('updateEmployee: mismo tipo pero Partial (es un update parcial)',
  /static async updateEmployee\(id: string, companyId: string, data: Partial<Omit<typeof employees\.\$inferInsert, 'id' \| 'companyId' \| 'salary' \| 'createdAt' \| 'updatedAt' \| 'deletedAt'>> & \{ salary\?: number \}\) \{/.test(hr));

ok('updatePayrollConfig: data tipado con payrollConfigs.$inferInsert (el caller ya envia todo como string, sin coercion adicional)',
  /static async updatePayrollConfig\(companyId: string, data: Partial<Omit<typeof payrollConfigs\.\$inferInsert, 'id' \| 'companyId' \| 'createdAt' \| 'updatedAt'>>\) \{/.test(hr));

ok('createOvertimeRecord: data tipado con overtimeRecords.$inferInsert (horas numericas)',
  /static async createOvertimeRecord\(companyId: string, modo: Modo, data: Omit<typeof overtimeRecords\.\$inferInsert, 'id' \| 'companyId' \| 'modo' \| 'hours' \| 'amount' \| 'status' \| 'createdAt'> & \{ hours: number \}\) \{/.test(hr));

ok('createIncomeRecord: data tipado con employeeIncome.$inferInsert (monto numerico)',
  /static async createIncomeRecord\(companyId: string, modo: Modo, data: Omit<typeof employeeIncome\.\$inferInsert, 'id' \| 'companyId' \| 'modo' \| 'amount' \| 'status' \| 'createdAt'> & \{ amount: number \}\) \{/.test(hr));

ok('createDeductionRecord: data tipado con employeeDeductions.$inferInsert (monto numerico)',
  /static async createDeductionRecord\(companyId: string, modo: Modo, data: Omit<typeof employeeDeductions\.\$inferInsert, 'id' \| 'companyId' \| 'modo' \| 'amount' \| 'status' \| 'createdAt'> & \{ amount: number \}\) \{/.test(hr));

ok('createLeave: data tipado con employeeLeaves.$inferInsert',
  /static async createLeave\(companyId: string, modo: Modo, data: Omit<typeof employeeLeaves\.\$inferInsert, 'id' \| 'companyId' \| 'modo' \| 'status' \| 'createdAt'>\) \{/.test(hr));

ok('createSettlement: data tipado con employeeSettlements.$inferInsert (los 5 montos + total numericos, se convierten a string antes de insertar)',
  /static async createSettlement\(companyId: string, modo: Modo, data: Omit<typeof employeeSettlements\.\$inferInsert, 'id' \| 'companyId' \| 'modo' \| 'preaviso' \| 'cesantia' \| 'vacaciones' \| 'navidad' \| 'otros' \| 'total' \| 'status' \| 'createdAt'> & \{ preaviso: number; cesantia: number; vacaciones: number; navidad: number; otros\?: number; total: number; status\?: string \}\) \{/.test(hr));

ok('logAudit: oldValues/newValues tipados unknown (jsonb generico de auditoria, no un tipo inventado)',
  /oldValues\?: unknown, newValues\?: unknown\) \{/.test(hr));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
