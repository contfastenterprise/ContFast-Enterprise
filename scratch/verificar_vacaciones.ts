import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { HRRepository } from '../src/repositories/hrRepository';
const A='11111111-1111-1111-1111-111111111111';
let f=0; const ok=(t:string,c:boolean,d='')=>{console.log(`${c?'  OK  ':' FALLA'}  ${t}${d?` -- ${d}`:''}`); if(!c)f++;};
async function main(){
  await db.execute(sql`DELETE FROM employee_vacations`);
  // El empleado se creo en PRODUCCION: solo tiene fila de saldo alli.
  const vp = await HRRepository.findVacations(A,'PRODUCCION');
  const vt = await HRRepository.findVacations(A,'PRUEBA');
  ok('sin ninguna fila de saldo, los 3 empleados salen igual en PRODUCCION', vp.length===3, `${vp.length}`);
  ok('y tambien en PRUEBA', vt.length===3, `${vt.length}`);
  ok('con cero dias', vp.every((v:any)=>Number(v.availableDays)===0));

  // Mover dias en PRUEBA crea la fila de ese modo
  await HRRepository.updateVacationDays('eeee0000-0000-0000-0000-00000000000a',A,'PRUEBA',14,4);
  const vt2:any = (await HRRepository.findVacations(A,'PRUEBA')).find((v:any)=>v.employeeCode==='A-01');
  const vp2:any = (await HRRepository.findVacations(A,'PRODUCCION')).find((v:any)=>v.employeeCode==='A-01');
  ok('el saldo se crea al vuelo en PRUEBA', Number(vt2.generatedDays)===14 && Number(vt2.takenDays)===4 && Number(vt2.availableDays)===10,
     `gen=${vt2.generatedDays} tom=${vt2.takenDays} disp=${vt2.availableDays}`);
  ok('PRODUCCION sigue en cero', Number(vp2.availableDays)===0, `${vp2.availableDays}`);

  // Acumula, no reemplaza
  await HRRepository.updateVacationDays('eeee0000-0000-0000-0000-00000000000a',A,'PRUEBA',0,6);
  const vt3:any = (await HRRepository.findVacations(A,'PRUEBA')).find((v:any)=>v.employeeCode==='A-01');
  ok('los movimientos se acumulan', Number(vt3.takenDays)===10 && Number(vt3.availableDays)===4, `tom=${vt3.takenDays} disp=${vt3.availableDays}`);

  const filas:any = await db.execute(sql`SELECT modo::text AS modo, count(*)::int AS n FROM employee_vacations GROUP BY modo`);
  ok('solo existe la fila del modo en el que se movio', (filas as any[]).length===1 && (filas as any[])[0].modo==='PRUEBA', JSON.stringify(filas));

  let lanzo=false;
  try{ await HRRepository.updateVacationDays('eeee0000-0000-0000-0000-00000000000d',A,'PRUEBA',5,0);}catch{lanzo=true;}
  ok('un empleado de otra empresa se rechaza', lanzo);

  console.log(f===0?'\nTODO CORRECTO\n':`\n${f} FALLIDAS\n`); process.exit(f?1:0);
}
main().catch(e=>{console.error(e);process.exit(1)});
