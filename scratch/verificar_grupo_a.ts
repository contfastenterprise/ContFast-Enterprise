/**
 * Grupo A: los INSERT que no fijaban `modo` y caian siempre en PRODUCCION.
 * Se ejercitan las rutas corregidas EN MODO PRUEBA y se comprueba que la fila
 * aterriza en PRUEBA, no en PRODUCCION.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { QuoteService } from '../src/services/quoteService';
import { AccountingRepository } from '../src/repositories/accountingRepository';
import { CashRepository } from '../src/repositories/cashRepository';
import { BankRepository } from '../src/repositories/bankRepository';

const A='11111111-1111-1111-1111-111111111111';
const USER='bbbbbbbb-0000-0000-0000-000000000001';
const CAJA='ffff0000-0000-0000-0000-000000000001';
const BANCO='ffff0000-0000-0000-0000-000000000002';
let f=0; const ok=(t:string,c:boolean,d='')=>{console.log(`${c?'  OK  ':' FALLA'}  ${t}${d?` -- ${d}`:''}`); if(!c)f++;};

async function modosDe(tabla:string){
  const r:any = await db.execute(sql.raw(`SELECT modo::text AS modo, count(*)::int AS n FROM ${tabla} GROUP BY modo ORDER BY modo`));
  return (r as any[]).map(x=>`${x.modo}:${x.n}`).join(' ');
}

async function cuentaContable(codigo:string):Promise<string>{
  const r:any = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE company_id=${A}::uuid AND code=${codigo}`);
  if(!(r as any[])[0]) throw new Error(`PRECONDICION ROTA: el catalogo sembrado no tiene ${codigo}`);
  return (r as any[])[0].id;
}

async function main(){
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo(['cash_registers', 'bank_accounts', 'accounting_periods']);
  await db.execute(sql`INSERT INTO cash_registers (id,company_id,name,code) VALUES (${CAJA}::uuid,${A}::uuid,'Caja 1','C-01')`);
  await db.execute(sql`INSERT INTO bank_accounts (id,company_id,bank_name,account_number,balance,chart_account_id)
    VALUES (${BANCO}::uuid,${A}::uuid,'Popular','123',10000,${await cuentaContable('1.1.01.02')}::uuid)`);

  // 1. Secuencia de cotizaciones
  const cot = await QuoteService.generateSequence(A,'PRUEBA');
  ok('la secuencia de cotizaciones se crea en PRUEBA', (await modosDe('quote_sequences'))==='PRUEBA:1', await modosDe('quote_sequences'));
  ok('  y devuelve un numero', /^COT-\d{4}-\d{6}$/.test(cot), cot);
  // La de PRODUCCION es independiente: debe empezar tambien en 1
  const cotProd = await QuoteService.generateSequence(A,'PRODUCCION');
  ok('cada entorno lleva su propia numeracion', cot.slice(-6)==='000001' && cotProd.slice(-6)==='000001', `${cot} / ${cotProd}`);

  // 2. Periodo contable por entorno.
  // Este bloque comprobaba que `isPeriodOpen` AUTOCREABA el periodo en el modo
  // pedido. JRN-11 quito la autocreacion a proposito (un control que crea lo
  // que valida no valida nada), asi que eso ya no se defiende. Lo que se
  // vigilaba sigue: el periodo de un entorno no le sirve al otro.
  await db.execute(sql`INSERT INTO accounting_periods (company_id,modo,name,start_date,end_date,status)
    VALUES (${A}::uuid,'PRODUCCION','Junio 2026','2026-06-01','2026-06-30','open')`);
  ok('un periodo abierto de PRODUCCION no abre PRUEBA',
    (await AccountingRepository.isPeriodOpen(A,'2026-06-15','PRUEBA'))===false
    && (await AccountingRepository.isPeriodOpen(A,'2026-06-15','PRODUCCION'))===true);
  ok('  y comprobar no crea periodos (JRN-11)', (await modosDe('accounting_periods'))==='PRODUCCION:1', await modosDe('accounting_periods'));
  // PRUEBA abre el suyo, que el paso 4 necesita para asentar el movimiento.
  await db.execute(sql`INSERT INTO accounting_periods (company_id,modo,name,start_date,end_date,status)
    VALUES (${A}::uuid,'PRUEBA','Junio 2026','2026-06-01','2026-06-30','open')`);

  // 3. Sesion de caja y su resumen
  const ses:any = await CashRepository.openSession({companyId:A, modo:'PRUEBA', cashRegisterId:CAJA, userId:USER, initialBalance:1000} as any);
  ok('la sesion de caja se abre en PRUEBA', (await modosDe('cash_sessions'))==='PRUEBA:1', await modosDe('cash_sessions'));
  await CashRepository.closeSession(ses.id, A, 'PRUEBA', {actualBalance:1000, expectedBalance:1000, difference:0} as any);
  ok('el resumen hereda el modo de su sesion', (await modosDe('cash_session_summary'))==='PRUEBA:1', await modosDe('cash_session_summary'));

  // 4. Transaccion bancaria
  // Desde el lote 137 el movimiento lleva contrapartida y la cuenta bancaria
  // su cuenta contable (ver el INSERT de arriba).
  await BankRepository.registerTransaction({companyId:A, modo:'PRUEBA', bankAccountId:BANCO, date:'2026-06-15', type:'deposit', amount:500,
    contraAccountId: await cuentaContable('3.1.01')} as any);
  ok('la transaccion bancaria se registra en PRUEBA', (await modosDe('bank_transactions'))==='PRUEBA:1', await modosDe('bank_transactions'));

  // 5. Nada se colo en PRODUCCION
  const fugas:any = await db.execute(sql`
    SELECT 'quote_sequences' t, count(*)::int n FROM quote_sequences WHERE modo='PRODUCCION' AND id NOT IN (SELECT id FROM quote_sequences WHERE modo='PRUEBA')
    UNION ALL SELECT 'cash_sessions', count(*)::int FROM cash_sessions WHERE modo='PRODUCCION'
    UNION ALL SELECT 'cash_session_summary', count(*)::int FROM cash_session_summary WHERE modo='PRODUCCION'
    UNION ALL SELECT 'bank_transactions', count(*)::int FROM bank_transactions WHERE modo='PRODUCCION'
  `);
  const fuga=(fugas as any[]).filter(x=>x.t!=='quote_sequences' && x.n>0);
  ok('ninguna fila de la sesion de PRUEBA aterrizo en PRODUCCION', fuga.length===0, JSON.stringify(fugas));

  console.log(f===0?'\nTODO CORRECTO\n':`\n${f} FALLIDAS\n`); process.exit(f?1:0);
}
main().catch(e=>{console.error(e);process.exit(1)});
