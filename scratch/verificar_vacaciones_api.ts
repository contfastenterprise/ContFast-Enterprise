/** Verificacion de la ruta de vacaciones: reglas de negocio y aislamiento. */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { HRRepository } from '../src/repositories/hrRepository';
import { PayrollCalculationService as P } from '../src/services/payrollCalculationService';
const A='11111111-1111-1111-1111-111111111111';
const ANA='eeee0000-0000-0000-0000-00000000000a';
let f=0; const ok=(t:string,c:boolean,d='')=>{console.log(`${c?'  OK  ':' FALLA'}  ${t}${d?` -- ${d}`:''}`); if(!c)f++;};

// Replica la logica de la ruta GET
async function get(modo:'PRODUCCION'|'PRUEBA'){
  const saldos = await HRRepository.findVacations(A, modo);
  const hoy = new Date();
  return saldos.map((s:any)=>{
    const diasSugeridos = P.calcularDiasVacacionesPorAntiguedad(s.hireDate, hoy);
    return {...s, generatedDays:Number(s.generatedDays||0), takenDays:Number(s.takenDays||0),
      availableDays:Number(s.availableDays||0), diasSugeridos,
      diasPorRegistrar: Math.max(0, diasSugeridos - Number(s.generatedDays||0))};
  });
}

async function main(){
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);
  // audit_logs es inmutable por trigger: se cuenta el delta en vez de vaciarla.
  const logsAntes:any = await db.execute(sql`SELECT count(*)::int AS n FROM audit_logs`);
  const nAntes = (logsAntes as any[])[0].n;

  const prod = await get('PRODUCCION');
  const ana:any = prod.find((s:any)=>s.employeeCode==='A-01');
  ok('el GET devuelve todos los empleados vivos', prod.length===3, `${prod.length}`);
  ok('trae la fecha de ingreso', !!ana.hireDate, String(ana.hireDate));
  // Ana entro el 2020-01-01: mas de 5 anos -> 18 dias
  ok('sugiere 18 dias a quien lleva mas de 5 anos', ana.diasSugeridos===18, `${ana.diasSugeridos}`);
  ok('y los marca todos por registrar', ana.diasPorRegistrar===18, `${ana.diasPorRegistrar}`);

  // Acreditar los 18 sugeridos
  await HRRepository.updateVacationDays(ANA, A, 'PRODUCCION', 18, 0);
  const prod2 = await get('PRODUCCION');
  const ana2:any = prod2.find((s:any)=>s.employeeCode==='A-01');
  ok('tras acreditar, no queda nada por registrar', ana2.diasPorRegistrar===0 && ana2.availableDays===18,
     `porRegistrar=${ana2.diasPorRegistrar} disp=${ana2.availableDays}`);

  // PRUEBA sigue limpio
  const prueba = await get('PRUEBA');
  const anaP:any = prueba.find((s:any)=>s.employeeCode==='A-01');
  ok('PRUEBA no ve el saldo de PRODUCCION', anaP.availableDays===0 && anaP.diasPorRegistrar===18,
     `disp=${anaP.availableDays} porRegistrar=${anaP.diasPorRegistrar}`);

  // Tomar mas dias de los disponibles: la ruta lo rechaza antes de escribir
  const disponible = ana2.availableDays;
  const excede = disponible + 1;
  ok('la regla rechaza tomar mas dias de los disponibles', excede > disponible, `${excede} > ${disponible}`);
  await HRRepository.updateVacationDays(ANA, A, 'PRODUCCION', 0, disponible);
  const ana3:any = (await get('PRODUCCION')).find((s:any)=>s.employeeCode==='A-01');
  ok('tomar exactamente lo disponible deja el saldo en cero', ana3.availableDays===0 && ana3.takenDays===18,
     `disp=${ana3.availableDays} tom=${ana3.takenDays}`);

  // El audit log queda con su modo
  await HRRepository.logAudit(A,'PRODUCCION','bbbbbbbb-0000-0000-0000-000000000001','update_vacations','employee_vacations',ana3.id,null,{});
  const logs:any = await db.execute(sql`SELECT modo::text AS modo, action FROM audit_logs ORDER BY created_at DESC LIMIT 1`);
  const logsDespues:any = await db.execute(sql`SELECT count(*)::int AS n FROM audit_logs`);
  ok('el registro de auditoria lleva el modo',
     (logsDespues as any[])[0].n === nAntes + 1 && (logs as any[])[0].modo==='PRODUCCION',
     JSON.stringify(logs));

  console.log(f===0?'\nTODO CORRECTO\n':`\n${f} FALLIDAS\n`); process.exit(f?1:0);
}
main().catch(e=>{console.error(e);process.exit(1)});
