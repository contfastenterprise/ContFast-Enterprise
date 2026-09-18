/**
 * Avisar ANTES: el cheque en garantia que se va a cobrar, y la caja sin cerrar.
 *
 * EL HUECO (lote 158)
 * -------------------
 * El panel avisaba del cheque en garantia el dia del cobro o despues
 * (`due_date <= hoy`). Medido el 2026-09-18 en Latin Doors (PRODUCCION): el 120
 * vencio el dia antes (avisaba), el 123 se cobraba al dia siguiente por
 * RD$144.092,15 (no avisaba nada) y el 125 el 08/10. Un cheque en garantia sale
 * de la cuenta el dia de su fecha.
 *
 * Y de la caja no avisaba nadie: una sesion abierta desde el 06/08 (43 dias) en
 * PRODUCCION y otra de 17 dias en PRUEBA; de la unica sesion cerrada en toda la
 * historia, ninguna se cerro el mismo dia.
 *
 * Decidido por el dueño el 2026-09-18: 3 dias de antelacion para el cheque, y
 * avisar de la caja que no se cerro el MISMO DIA.
 *
 * Se EJECUTAN las reglas de fecha; el cableado del panel se lee. LO QUE NO
 * PRUEBA: que el aviso salga contra la base real.
 */
import fs from 'fs';
import { fuente } from './_fuente';

const leer = (ruta: string) => (fs.existsSync(ruta) ? fuente(ruta) : '');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

async function main() {
  const PANEL = fuente('src/repositories/dashboardRepository.ts');

  console.log('\n0) Precondiciones\n');
  exige('el panel sigue armando avisos con enlace y contandolos',
    /alertsDetails\.push\(\{/.test(PANEL) && /actionLink:/.test(PANEL) && /alertCount:/.test(PANEL));
  exige('el aviso del cheque sigue exigiendo pago pendiente y cuenta por pagar viva (1:1 con la pantalla de compras)',
    /eq\(apPayments\.status, 'pending_guarantee'\)/.test(PANEL) && /\$\{accountsPayable\.balance\} > 0/.test(PANEL)
    && /eq\(checks\.isGuarantee, true\)/.test(PANEL) && /eq\(checks\.status, 'pending'\)/.test(PANEL));

  let m: typeof import('../src/services/avisos/vencimientos') | null = null;
  try { m = await import('../src/services/avisos/vencimientos'); } catch { m = null; }

  console.log('\n1) El dia es el de Republica Dominicana, no el del servidor\n');
  //  Vercel corre en UTC. A las 02:00 UTC del dia 19 en RD son las 22:00 del 18.
  ok('un instante de madrugada UTC pertenece al dia anterior en RD',
    !!m && m.diaRD(new Date('2026-09-19T02:00:00Z')) === '2026-09-18');
  ok('y a partir de las 04:00 UTC ya es el dia siguiente',
    !!m && m.diaRD(new Date('2026-09-19T05:00:00Z')) === '2026-09-19');

  console.log('\n2) El cheque: se avisa 3 dias antes, sin dejar fuera lo vencido\n');
  const ahora = new Date('2026-09-18T15:00:00Z'); // 11:00 en RD
  ok('la antelacion decidida son 3 dias', !!m && m.DIAS_AVISO_CHEQUE === 3);
  ok('el limite del aviso es hoy + 3 dias', !!m && m.limiteDeAvisoDeCheques(ahora) === '2026-09-21');
  ok('el caso real: el 123 (19/09) entra en el aviso y el 125 (08/10) no',
    !!m && '2026-09-19' <= m.limiteDeAvisoDeCheques(ahora) && !('2026-10-08' <= m.limiteDeAvisoDeCheques(ahora)));
  ok('lo ya vencido sigue avisando', !!m && m.urgenciaDelCheque('2026-09-17', ahora) === 'vencido');
  ok('el de hoy se distingue del de mañana',
    !!m && m.urgenciaDelCheque('2026-09-18', ahora) === 'hoy' && m.urgenciaDelCheque('2026-09-19', ahora) === 'proximo');
  ok('los dias que faltan salen bien en los dos sentidos',
    !!m && m.diasHastaElCobro('2026-09-21', ahora) === 3 && m.diasHastaElCobro('2026-09-17', ahora) === -1
    && m.diasHastaElCobro('2026-09-18', ahora) === 0);
  ok('el titulo dice de que se trata en cada caso',
    !!m && m.tituloDelCheque('120', '2026-09-17', ahora) === 'Cheque en garantía vencido (#120)'
    && m.tituloDelCheque('121', '2026-09-18', ahora) === 'Cheque en garantía se cobra HOY (#121)'
    && m.tituloDelCheque('123', '2026-09-19', ahora) === 'Cheque en garantía se cobra en 1 día(s) (#123)');

  console.log('\n3) La caja: solo la que no se cerro el mismo dia\n');
  ok('abierta ayer y todavia abierta: se avisa',
    !!m && m.cajaSinCerrar({ status: 'open', openedAt: new Date('2026-09-17T14:00:00Z') }, ahora) === true);
  ok('abierta hoy: NO se avisa (es la caja del dia)',
    !!m && m.cajaSinCerrar({ status: 'open', openedAt: new Date('2026-09-18T13:00:00Z') }, ahora) === false);
  //  La frontera del dia es la de RD, no la de UTC, y esto lo tenia escrito al
  //  reves al empezar: las 02:00 UTC del 18 son las 22:00 del 17 en RD, asi que
  //  esa sesion es de AYER y si se avisa. Y una abierta a las 04:30 UTC del 18
  //  (00:30 de RD del 18) es de HOY y no se avisa. Si se mirara el dia UTC, las
  //  dos saldrian al reves.
  ok('abierta a las 22:00 de RD de ayer (madrugada UTC de hoy): SE avisa',
    !!m && m.cajaSinCerrar({ status: 'open', openedAt: new Date('2026-09-18T02:00:00Z') }, new Date('2026-09-18T15:00:00Z')) === true,
    String(m?.diaRD('2026-09-18T02:00:00Z')));
  ok('abierta a las 00:30 de RD de hoy: no se avisa',
    !!m && m.cajaSinCerrar({ status: 'open', openedAt: new Date('2026-09-18T04:30:00Z') }, new Date('2026-09-18T15:00:00Z')) === false);
  ok('una sesion ya cerrada no avisa, ni una sin fecha',
    !!m && m.cajaSinCerrar({ status: 'closed', openedAt: new Date('2026-08-06T00:00:00Z') }, ahora) === false
    && m.cajaSinCerrar({ status: 'open', openedAt: null }, ahora) === false);
  ok('el caso real: la sesion del 06/08 llevaba 43 dias',
    !!m && m.diasAbierta(new Date('2026-08-07T00:33:19Z'), ahora) === 43, String(m?.diasAbierta(new Date('2026-08-07T00:33:19Z'), ahora)));

  console.log('\n4) El cableado del panel\n');
  ok('el filtro de cheques usa el limite con antelacion, no el dia de hoy',
    /const limiteCheques = limiteDeAvisoDeCheques\(today\);/.test(PANEL) && /lte\(checks\.dueDate, limiteCheques\)/.test(PANEL)
    && !/lte\(checks\.dueDate, formattedToday\)/.test(PANEL));
  ok('el aviso del cheque trae su fecha y titula segun lo cerca que este',
    /dueDate: checks\.dueDate/.test(PANEL) && /title: tituloDelCheque\(check\.checkNumber, check\.dueDate, today\)/.test(PANEL)
    && /urgenciaDelCheque\(check\.dueDate, today\)/.test(PANEL));
  ok('un cheque sin fecha de cobro se descarta a proposito',
    /dueChecks\.filter\(\(c\): c is typeof c & \{ dueDate: string \} => !!c\.dueDate\)/.test(PANEL));
  ok('las sesiones de caja se leen acotadas a la empresa y el modo, solo las abiertas',
    /\.from\(cashSessions\)\s*\.where\(withTenantMode\(cashSessions, ctx, eq\(cashSessions\.status, 'open'\)\)\)/.test(PANEL));
  ok('se avisa solo de las que no se cerraron el mismo dia, y se cuentan',
    /const cajasSinCerrar = sesionesAbiertas\.filter\(\(s\) => cajaSinCerrar\(\{ status: 'open', openedAt: s\.openedAt \}, today\)\);/.test(PANEL)
    && /alertCount: alertCount \+ dueGuaranteeChecksCount \+ avisoPeriodos \+ cajasSinCerrar\.length,/.test(PANEL));
  ok('el aviso de caja lleva a Caja y dice por que importa',
    /type: 'caja_sin_cerrar',/.test(PANEL) && /actionLink: '\/dashboard\/cash'/.test(PANEL)
    && /el arqueo no cuadra contra nada/.test(PANEL));
  //  Esta es una NEGACION, y sola seria cierta de balde: sin aviso ninguno
  //  tampoco hay cierre automatico. Va unida a la marca del estado posterior
  //  -que el aviso exista- para que la contraprueba la vea fallar.
  ok('se avisa de la caja, pero NO se cierra sola',
    /type: 'caja_sin_cerrar',/.test(PANEL) && !!m
    && !/update\(cashSessions\)/.test(PANEL) && !/'closed'/.test(leer('src/services/avisos/vencimientos.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
