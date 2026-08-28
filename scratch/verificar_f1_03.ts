/**
 * Verificacion empirica de F1-03 contra PostgreSQL real.
 * No forma parte del proyecto: es el banco de pruebas del arreglo.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { HRRepository } from '../src/repositories/hrRepository';

const A = '11111111-1111-1111-1111-111111111111'; // Alfa
const B = '22222222-2222-2222-2222-222222222222'; // Beta

// El sembrado lo hace /tmp/seed_hr.sql via psql (postgres.js no acepta multiples
// sentencias en una sola consulta preparada).

async function pendientes(): Promise<Record<string, string>> {
  const r: any = await db.execute(sql`
    SELECT e.employee_code AS cod, 'horas' AS concepto, o.status FROM overtime_records o JOIN employees e ON e.id=o.employee_id
    UNION ALL
    SELECT e.employee_code, 'ingreso', i.status FROM employee_income i JOIN employees e ON e.id=i.employee_id
    UNION ALL
    SELECT e.employee_code, 'deduccion', d.status FROM employee_deductions d JOIN employees e ON e.id=d.employee_id
    ORDER BY 1,2
  `);
  const out: Record<string, string> = {};
  for (const row of r as any[]) out[`${row.cod}/${row.concepto}`] = row.status;
  return out;
}

async function pendientesPorModo(): Promise<Record<string, string>> {
  const r: any = await db.execute(sql`
    SELECT e.employee_code AS cod, 'horas' AS concepto, o.modo::text AS modo, o.status FROM overtime_records o JOIN employees e ON e.id=o.employee_id
    UNION ALL
    SELECT e.employee_code, 'ingreso', i.modo::text, i.status FROM employee_income i JOIN employees e ON e.id=i.employee_id
    UNION ALL
    SELECT e.employee_code, 'deduccion', d.modo::text, d.status FROM employee_deductions d JOIN employees e ON e.id=d.employee_id
  `);
  const out: Record<string, string> = {};
  for (const row of r as any[]) out[`${row.cod}/${row.concepto}/${row.modo}`] = row.status;
  return out;
}

let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '  OK  ' : ' FALLA'}  ${titulo}${detalle ? ` -- ${detalle}` : ''}`);
  if (!ok) fallos++;
}

async function main() {
  console.log('\n1) Alfa crea y aprueba su nomina mensual de junio\n');
  const nominaA = await HRRepository.createPayroll(A, 'PRODUCCION', {
    periodStart: '2026-06-01', periodEnd: '2026-06-30', paymentDate: '2026-06-30', frequency: 'mensual',
  });
  const detalles = await HRRepository.findPayrollDetails(nominaA.id, A, 'PRODUCCION');
  comprobar('la nomina de Alfa incluye solo a los 2 mensuales de Alfa', detalles.length === 2,
    `${detalles.length} detalles`);

  const ana: any = detalles.find((d: any) => d.employeeCode === 'A-01') || detalles[0];
  comprobar('a Ana se le imputan sus 2000 de horas extra', Number(ana.overtimeAmount) === 2000, `= ${ana.overtimeAmount}`);
  comprobar('a Ana se le imputan 3000 de comision', Number(ana.commissionAmount) === 3000, `= ${ana.commissionAmount}`);
  comprobar('a Ana se le imputan 1000 de bono', Number(ana.bonusAmount) === 1000, `= ${ana.bonusAmount}`);
  comprobar('a Ana se le imputan 500 de deduccion', Number(ana.otherDeductions) === 500, `= ${ana.otherDeductions}`);

  await HRRepository.approvePayroll(nominaA.id, A, 'PRODUCCION', 'bbbbbbbb-0000-0000-0000-000000000001');

  const est = await pendientes();
  console.log('\n   estado tras aprobar:', JSON.stringify(est, null, 2).replace(/\n/g, '\n   '));

  console.log('\n2) Lo que el fallo destruia\n');
  comprobar('los conceptos de Beto (Beta) siguen PENDIENTES',
    est['B-01/horas'] === 'pending' && est['B-01/ingreso'] === 'pending' && est['B-01/deduccion'] === 'pending');
  comprobar('los conceptos de Sara (quincenal, no entro en la nomina) siguen PENDIENTES',
    est['A-03/horas'] === 'pending' && est['A-03/ingreso'] === 'pending' && est['A-03/deduccion'] === 'pending');
  comprobar('los conceptos de Ana si quedan PROCESADOS',
    est['A-01/horas'] === 'processed' && est['A-01/ingreso'] === 'processed' && est['A-01/deduccion'] === 'processed');

  console.log('\n3) Aislamiento entre empresas sobre el id de nomina ajeno\n');
  const nominaB = await HRRepository.createPayroll(B, 'PRODUCCION', {
    periodStart: '2026-06-01', periodEnd: '2026-06-30', paymentDate: '2026-06-30', frequency: 'mensual',
  });
  const detallesB_antes = await HRRepository.findPayrollDetails(nominaB.id, B, 'PRODUCCION');

  for (const [nombre, fn] of [
    ['recalculatePayroll', () => HRRepository.recalculatePayroll(nominaB.id, A, 'PRODUCCION')],
    ['approvePayroll', () => HRRepository.approvePayroll(nominaB.id, A, 'PRODUCCION', 'bbbbbbbb-0000-0000-0000-000000000001')],
    ['deletePayroll', () => HRRepository.deletePayroll(nominaB.id, A, 'PRODUCCION')],
  ] as [string, () => Promise<any>][]) {
    let lanzo = false;
    try { await fn(); } catch { lanzo = true; }
    comprobar(`${nombre} de Alfa sobre la nomina de Beta se rechaza`, lanzo);
  }

  const detallesB_despues = await HRRepository.findPayrollDetails(nominaB.id, B, 'PRODUCCION');
  comprobar('la nomina de Beta conserva sus detalles intactos',
    detallesB_despues.length === detallesB_antes.length && detallesB_antes.length === 1,
    `antes ${detallesB_antes.length}, despues ${detallesB_despues.length}`);
  const nomB = await HRRepository.findPayrollById(nominaB.id, B, 'PRODUCCION');
  comprobar('la nomina de Beta sigue viva y sin aprobar', !!nomB && nomB.status === 'calculated', `status=${nomB?.status}`);


  console.log('\n4) Aislamiento entre PRUEBA y PRODUCCION\n');

  // Se anaden conceptos NUEVOS pendientes en PRODUCCION para Ana y Luis, los dos
  // mensuales de Alfa (los del paso 1 ya se consumieron alli). Una nomina de
  // PRUEBA sobre el mismo periodo y los mismos empleados no debe ni verlos ni
  // consumirlos.
  await db.execute(sql`
    INSERT INTO overtime_records (company_id,employee_id,date_worked,hours,type,amount,modo) VALUES
      (${A}::uuid,'eeee0000-0000-0000-0000-00000000000a','2026-06-25',3,'diurna',900,'PRODUCCION'),
      (${A}::uuid,'eeee0000-0000-0000-0000-00000000000b','2026-06-25',2,'diurna',600,'PRODUCCION')
  `);

  const nominaPrueba = await HRRepository.createPayroll(A, 'PRUEBA', {
    periodStart: '2026-06-01', periodEnd: '2026-06-30', paymentDate: '2026-06-30', frequency: 'mensual',
  });
  const detPrueba = await HRRepository.findPayrollDetails(nominaPrueba.id, A, 'PRUEBA');
  const anaPrueba: any = detPrueba.find((d: any) => d.employeeCode === 'A-01');

  comprobar('los empleados si se comparten entre modos', detPrueba.length === 2, `${detPrueba.length} detalles`);
  comprobar('la nomina de PRUEBA no ve las horas extra de PRODUCCION',
    Number(anaPrueba.overtimeAmount) === 0, `= ${anaPrueba.overtimeAmount} (hay 900 pendientes en PRODUCCION)`);
  comprobar('la nomina de PRUEBA no ve las comisiones de PRODUCCION',
    Number(anaPrueba.commissionAmount) === 0 && Number(anaPrueba.bonusAmount) === 0,
    `com=${anaPrueba.commissionAmount} bono=${anaPrueba.bonusAmount}`);

  await HRRepository.approvePayroll(nominaPrueba.id, A, 'PRUEBA', 'bbbbbbbb-0000-0000-0000-000000000001');
  const estTrasPrueba = await pendientesPorModo();
  const prodPendientes: any = await db.execute(sql`
    SELECT count(*)::int AS n FROM overtime_records
    WHERE modo='PRODUCCION' AND status='pending' AND date_worked='2026-06-25'
  `);
  comprobar('aprobar en PRUEBA no consume los conceptos de PRODUCCION',
    (prodPendientes as any[])[0].n === 2, `${(prodPendientes as any[])[0].n} de 2 siguen pendientes`);

  const listaProd = await HRRepository.findPayrolls(A, 'PRODUCCION');
  const listaPrueba = await HRRepository.findPayrolls(A, 'PRUEBA');
  comprobar('cada modo lista solo sus nominas',
    listaProd.total === 1 && listaPrueba.total === 1,
    `PRODUCCION=${listaProd.total} PRUEBA=${listaPrueba.total}`);

  const cruzada = await HRRepository.findPayrollById(nominaPrueba.id, A, 'PRODUCCION');
  comprobar('una nomina de PRUEBA no se alcanza desde PRODUCCION', !cruzada);

  let lanzoCruzado = false;
  try { await HRRepository.deletePayroll(nominaPrueba.id, A, 'PRODUCCION'); } catch { lanzoCruzado = true; }
  comprobar('borrar una nomina de PRUEBA desde PRODUCCION se rechaza', lanzoCruzado);

  const filas: any = await db.execute(sql`SELECT modo, count(*)::int AS n FROM payroll_details GROUP BY modo ORDER BY modo`);
  comprobar('los detalles se escriben en el modo correcto',
    (filas as any[]).every((r: any) => r.n > 0) && (filas as any[]).length === 2,
    JSON.stringify(filas));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} COMPROBACIONES FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
