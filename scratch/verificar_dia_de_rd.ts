/**
 * Lote 174 -- "Ventas de hoy" es el dia de REPUBLICA DOMINICANA.
 *
 * EL DEFECTO
 * ----------
 * `biRepository.getGeneralStats` calculaba el dia asi:
 *
 *     const todayStr = new Date().toISOString().split('T')[0];   // dia UTC
 *     ... WHERE DATE(created_at) = todayStr
 *
 * y Vercel corre en UTC. Republica Dominicana es UTC-4 todo el año, asi que a
 * partir de las 20:00 hora de RD el dia UTC YA ES EL SIGUIENTE: el panel perdia
 * la jornada entera y solo contaba lo vendido despues de esa hora. Cuatro horas
 * cada dia, que es por lo que llevaba escondido. Misma trampa que cerro el lote
 * 158 en los avisos, en otro sitio.
 *
 * Salio solo porque la verificacion se corrio a las 20:22 hora de RD.
 *
 * POR QUE `verificar_bi.ts` NO BASTA COMO GUARDA
 * ----------------------------------------------
 * Sus facturas se crean con `now()`, asi que su dia UTC y su dia de RD casi
 * siempre coinciden y las dos logicas dan lo mismo. Este banco fija el
 * `created_at` A PROPOSITO en la franja donde discrepan -- las 23:30 hora de
 * RD, que en UTC ya es el dia siguiente -- y ahi la logica vieja falla y la
 * nueva acierta, a cualquier hora en que se corra.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { BIRepository } from '../src/repositories/biRepository';
// Los ayudantes del dia de RD se cargan PEREZOSAMENTE: antes del lote 174 no
// existen en `utils/fechasLocales`, y un import estatico haria reventar la
// contraprueba al cargar -- en vez de fallar comprobacion a comprobacion, que
// es lo que tiene que hacer (docs/metodo_y_traspaso.md, seccion 3).
type Fechas = typeof import('../src/utils/fechasLocales');

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const CLIENTE = 'ffffffff-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const exige = (t: string, c: boolean, d = '') => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`); console.log(`  pre   ${t}`); };

/** El instante UTC que corresponde a las `hora` de RD de ese dia. */
const instanteRD = (dia: string, hora: string) => `${dia}T${hora}-04:00`;

async function main() {
  console.log('\n0) Precondiciones\n');
  // La base tiene que estar en UTC, como Supabase: si guardara hora local, este
  // banco mediria otra cosa. Lo pone `base_desechable.ps1` desde el lote 174.
  const [zona] = (await db.execute(sql`SELECT current_setting('TimeZone') AS z`)) as unknown as { z: string }[];
  exige('la base corre en UTC, como produccion', zona.z === 'UTC', zona.z);

  console.log('\n1) El dia de RD, ejecutado\n');
  let F: Fechas | null = null;
  try {
    const m = await import('../src/utils/fechasLocales');
    F = ('diaRD' in m && 'primerDiaDelMesRD' in m) ? m as Fechas : null;
  } catch { F = null; }

  if (!F) {
    for (const t of [
      'un instante de la noche de RD pertenece al dia ANTERIOR en UTC',
      'a las 04:00 UTC ya es el dia siguiente en RD',
      'una fecha ilegible no inventa un dia',
      'sumar dias cruza el fin de mes',
      'el primer dia del mes se saca del dia de RD, no del UTC',
      'y el del año igual (el 1 de enero a las 02:00 UTC es 31 de diciembre en RD)',
      'la venta de las 23:30 de hoy cuenta como de HOY (el dia UTC diria que es de mañana)',
      '  y la de anoche NO cuenta como de hoy (el dia UTC diria que si)',
      'el dia de RD de una factura no cambia con la zona de la sesion',
    ]) ok(t, false, 'utils/fechasLocales no exporta el dia de RD (diaRD / primerDiaDelMesRD)');
    console.log(`\n${fallos} FALLIDAS\n`);
    process.exit(1);
  }
  const { diaRD, diaRDMas, primerDiaDelMesRD, primerDiaDelAnoRD } = F;

  // 02:00 UTC del dia 21 son las 22:00 del dia 20 en RD.
  ok('un instante de la noche de RD pertenece al dia ANTERIOR en UTC',
    diaRD('2026-09-21T02:00:00Z') === '2026-09-20', diaRD('2026-09-21T02:00:00Z'));
  ok('  y justo antes de medianoche de RD, tambien',
    diaRD('2026-09-21T03:59:59Z') === '2026-09-20', diaRD('2026-09-21T03:59:59Z'));
  ok('a las 04:00 UTC ya es el dia siguiente en RD',
    diaRD('2026-09-21T04:00:00Z') === '2026-09-21', diaRD('2026-09-21T04:00:00Z'));
  ok('el mediodia UTC es el mismo dia', diaRD('2026-09-20T12:00:00Z') === '2026-09-20');
  ok('una fecha ilegible no inventa un dia', diaRD('no es una fecha') === '');
  ok('sumar dias cruza el fin de mes', diaRDMas('2026-09-30T12:00:00Z', 1) === '2026-10-01',
    diaRDMas('2026-09-30T12:00:00Z', 1));
  ok('  y el fin de año', diaRDMas('2026-12-31T12:00:00Z', 1) === '2027-01-01');
  // El 1 de octubre a las 02:00 UTC es todavia el 30 de septiembre en RD: el
  // mes al que pertenece esa venta es septiembre, no octubre.
  ok('el primer dia del mes se saca del dia de RD, no del UTC',
    primerDiaDelMesRD('2026-10-01T02:00:00Z') === '2026-09-01', primerDiaDelMesRD('2026-10-01T02:00:00Z'));
  ok('y el del año igual (el 1 de enero a las 02:00 UTC es 31 de diciembre en RD)',
    primerDiaDelAnoRD('2027-01-01T02:00:00Z') === '2026-01-01', primerDiaDelAnoRD('2027-01-01T02:00:00Z'));

  console.log('\n2) El panel, contra la base\n');
  await limpiarTodo([]);
  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente Uno')
    ON CONFLICT (id) DO NOTHING`);

  const hoyRD = diaRD();
  const ayerRD = diaRDMas(new Date(), -1);

  // Las dos facturas se crean A LAS 23:30 HORA DE RD, que en UTC ya es el dia
  // siguiente. Ahi es donde las dos logicas discrepan: para el dia UTC, la de
  // hoy "es de mañana" y la de ayer "es de hoy" -- exactamente al reves.
  const meter = async (ncf: string, total: number, dia: string) => db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, ncf, ecf_type,
                          subtotal, total_taxes, total, codigo_factura, status, created_at)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER_A}::uuid, ${CLIENTE}::uuid, ${ncf}, '31',
            ${total}, 0, ${total}, ${'FAC-' + ncf}, 'accepted',
            (${instanteRD(dia, '23:30:00')}::timestamptz AT TIME ZONE 'UTC'))`);

  await meter('E310000000801', 1000, hoyRD);
  await meter('E310000000802', 700, ayerRD);

  const guardado = (await db.execute(sql`
    SELECT ncf, created_at::text AS guardado,
           ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santo_Domingo')::date::text AS dia_rd
      FROM invoices ORDER BY ncf`)) as unknown as { ncf: string; guardado: string; dia_rd: string }[];
  exige('la de hoy quedo guardada en el dia UTC SIGUIENTE (si no, este banco no prueba nada)',
    guardado[0].guardado.slice(0, 10) !== hoyRD, `${guardado[0].guardado} / hoy RD ${hoyRD}`);
  exige('  pero su dia de RD es hoy', guardado[0].dia_rd === hoyRD, guardado[0].dia_rd);

  const sinFiltros = {} as Parameters<typeof BIRepository.getGeneralStats>[2];
  const g = await BIRepository.getGeneralStats(A, 'PRODUCCION', sinFiltros) as Record<string, number>;

  ok('la venta de las 23:30 de hoy cuenta como de HOY (el dia UTC diria que es de mañana)',
    g.salesToday === 1000, String(g.salesToday));
  ok('  y la de anoche NO cuenta como de hoy (el dia UTC diria que si)',
    g.salesToday === 1000 && g.countInvoices === 2, `${g.salesToday} / ${g.countInvoices}`);
  ok('las dos cuentan en el mes', g.salesMonth === 1700 || ayerRD.slice(0, 7) !== hoyRD.slice(0, 7),
    `${g.salesMonth} (ayer ${ayerRD}, hoy ${hoyRD})`);
  ok('y las dos en el año', g.salesYear === 1700 || ayerRD.slice(0, 4) !== hoyRD.slice(0, 4),
    String(g.salesYear));

  console.log('\n3) El calculo no depende de la zona de quien pregunta\n');
  // Sin el `AT TIME ZONE 'UTC'` de entrada, Postgres interpretaria el
  // `timestamp sin zona` en la zona de la SESION, y el mismo panel daria
  // cifras distintas segun quien lo abriera.
  await db.execute(sql`SET LOCAL TIME ZONE 'Asia/Tokyo'`);
  const enTokio = (await db.execute(sql`
    SELECT ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santo_Domingo')::date::text AS dia_rd
      FROM invoices WHERE ncf = 'E310000000801'`)) as unknown as { dia_rd: string }[];
  ok('el dia de RD de una factura no cambia con la zona de la sesion',
    enTokio[0].dia_rd === hoyRD, `${enTokio[0].dia_rd} vs ${hoyRD}`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
