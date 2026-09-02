/**
 * Grupo C: escrituras que no se localizaban por id y no filtraban por empresa
 * ni entorno, asi que podian tocar filas de varios de golpe.
 *
 * El caso con dano real es la conciliacion bancaria: marcaba como conciliadas
 * TODAS las transacciones pendientes de la cuenta en el rango de fechas. La
 * misma cuenta tiene movimientos en PRUEBA y en PRODUCCION, y una fecha no los
 * distingue.
 */
import { db } from '../src/db';
import { limpiar as limpiarTodo } from './_limpieza';
import { sql, and, eq, gte, lte } from 'drizzle-orm';
import { bankTransactions } from '../src/db/schema';

const A='11111111-1111-1111-1111-111111111111';
const B='22222222-2222-2222-2222-222222222222';
const CTA='ffff0000-0000-0000-0000-000000000002';
const CTA_B='ffff0000-0000-0000-0000-000000000003';
let f=0; const ok=(t:string,c:boolean,d='')=>{console.log(`${c?'  OK  ':' FALLA'}  ${t}${d?` -- ${d}`:''}`); if(!c)f++;};

async function estado(){
  const r:any = await db.execute(sql`
    SELECT c.name AS empresa, t.modo::text AS modo, t.status, count(*)::int AS n
    FROM bank_transactions t JOIN companies c ON c.id=t.company_id
    GROUP BY 1,2,3 ORDER BY 1,2,3`);
  const o:Record<string,number>={};
  for(const x of r as any[]) o[`${x.empresa}/${x.modo}/${x.status}`]=x.n;
  return o;
}

async function main(){
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  // bank_accounts no es transaccional (no tiene columna `modo`), asi que la
  // limpieza derivada no la toca: hay que nombrarla.
  await limpiarTodo(['bank_accounts']);
  await db.execute(sql`INSERT INTO bank_accounts (id,company_id,bank_name,account_number,balance) VALUES
    (${CTA}::uuid,${A}::uuid,'Popular','111',0), (${CTA_B}::uuid,${B}::uuid,'BHD','222',0)`);
  // Misma cuenta, mismo rango de fechas, los dos entornos. Y una de otra empresa.
  await db.execute(sql`INSERT INTO bank_transactions (company_id,modo,bank_account_id,date,type,amount,status) VALUES
    (${A}::uuid,'PRODUCCION',${CTA}::uuid,'2026-06-10','deposit',100,'pending'),
    (${A}::uuid,'PRODUCCION',${CTA}::uuid,'2026-06-20','deposit',200,'pending'),
    (${A}::uuid,'PRUEBA',    ${CTA}::uuid,'2026-06-15','deposit',999,'pending'),
    (${B}::uuid,'PRODUCCION',${CTA_B}::uuid,'2026-06-15','deposit',500,'pending')`);

  const antes = await estado();
  ok('escenario sembrado: 4 pendientes en 2 empresas y 2 entornos',
     Object.values(antes).reduce((a,b)=>a+b,0)===4, JSON.stringify(antes));

  // Conciliacion tal como queda ahora: empresa + modo + cuenta + rango
  await db.update(bankTransactions).set({status:'reconciled'}).where(and(
    eq(bankTransactions.companyId, A),
    eq(bankTransactions.modo, 'PRODUCCION'),
    eq(bankTransactions.bankAccountId, CTA),
    gte(bankTransactions.date,'2026-06-01'),
    lte(bankTransactions.date,'2026-06-30'),
    eq(bankTransactions.status,'pending')));

  const d = await estado();
  ok('concilia las 2 de PRODUCCION de esa empresa', d['Alfa SRL/PRODUCCION/reconciled']===2, JSON.stringify(d));
  ok('NO toca la de PRUEBA de la misma cuenta',     d['Alfa SRL/PRUEBA/pending']===1, JSON.stringify(d));
  ok('NO toca la de la otra empresa',               d['Beta SRL/PRODUCCION/pending']===1, JSON.stringify(d));

  // Lo que hacia antes: sin empresa ni modo
  await db.execute(sql`UPDATE bank_transactions SET status='pending'`);
  await db.update(bankTransactions).set({status:'reconciled'}).where(and(
    eq(bankTransactions.bankAccountId, CTA),
    gte(bankTransactions.date,'2026-06-01'),
    lte(bankTransactions.date,'2026-06-30'),
    eq(bankTransactions.status,'pending')));
  const viejo = await estado();
  ok('el filtro viejo SI arrastraba la de PRUEBA (fallo reproducido)',
     viejo['Alfa SRL/PRUEBA/reconciled']===1, JSON.stringify(viejo));

  console.log(f===0?'\nTODO CORRECTO\n':`\n${f} FALLIDAS\n`); process.exit(f?1:0);
}
main().catch(e=>{console.error(e);process.exit(1)});
