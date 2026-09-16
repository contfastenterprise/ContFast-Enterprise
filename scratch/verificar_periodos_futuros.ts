/**
 * Los periodos contables no se acaban sin aviso, y no se pisan.
 *
 * EL FALLO (lote 145)
 * -------------------
 * Medido el 2026-09-16: las 6 empresas, en los dos modos, tienen periodos solo
 * hasta el 31/12/2026. El sembrador corria solo al dar de alta la empresa y
 * sembraba hasta diciembre; nadie creaba los siguientes. El 01/01/2027 ninguna
 * podria asentar. Y crear un periodo a mano no validaba ni el orden de las
 * fechas ni el solape: asi nacio "periodo 2026" de Latin Doors, que se pisa con
 * septiembre a diciembre.
 *
 * Se EJECUTA el calculo (que meses faltan, cuantos dias cubren, cuando se
 * niega un periodo). La creacion escribe en base y se lee su cableado.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

/** Los periodos de PRODUCCION de Latin Doors, tal cual el 2026-09-16. */
const LATIN_DOORS = [
  { name: '07/2026', startDate: '2026-07-01', endDate: '2026-07-31', status: 'closed' },
  { name: 'periodo 2026', startDate: '2026-08-01', endDate: '2026-12-31', status: 'open' },
  { name: '09/2026', startDate: '2026-09-01', endDate: '2026-09-30', status: 'open' },
  { name: '10/2026', startDate: '2026-10-01', endDate: '2026-10-31', status: 'open' },
  { name: '11/2026', startDate: '2026-11-01', endDate: '2026-11-30', status: 'open' },
  { name: '12/2026', startDate: '2026-12-01', endDate: '2026-12-31', status: 'open' },
];

async function main() {
  const REPO = 'src/repositories/accountingRepository.ts';
  const RUTA = 'src/app/api/v1/accounting/periods/route.ts';
  console.log('\n0) Precondiciones\n');
  {
    const repo = fuente(REPO);
    const i = repo.indexOf('static async isPeriodOpen');
    const j = repo.indexOf('static async createJournalEntry');
    exige('isPeriodOpen sigue sin crear periodos (JRN-11)', i > 0 && j > i && !repo.slice(i, j).includes('insert(accountingPeriods)'));
    exige('las tres altas de empresa siembran', ['src/app/api/v1/admin/companies/route.ts', 'src/app/api/v1/auth/register/route.ts', 'src/app/api/v1/setup/confirm/route.ts']
      .every((r) => fuente(r).includes('sembrarPeriodosContables')));
    exige('crear y abrir/cerrar periodos exige escritura en contabilidad',
      /'contabilidad', 'write'/.test(fuente(RUTA)) && /'contabilidad', 'write'/.test(fuente('src/app/api/v1/accounting/periods/[id]/route.ts')));
  }

  let c: typeof import('../src/services/accounting/coberturaPeriodos') | null = null;
  try { c = await import('../src/services/accounting/coberturaPeriodos'); } catch { c = null; }

  console.log('\n1) Que meses faltan\n');
  {
    const faltan = c ? c.mesesQueFaltan(LATIN_DOORS, new Date(2026, 8, 16), 12) : [];
    ok('desde septiembre de 2026, faltan enero a agosto de 2027 (8)',
      JSON.stringify(faltan.map((m) => m.name)) === JSON.stringify(['01/2027', '02/2027', '03/2027', '04/2027', '05/2027', '06/2027', '07/2027', '08/2027']),
      JSON.stringify(faltan.map((m) => m.name)));
    ok('no crea los meses que ya toca "periodo 2026", aunque no haya mensual de agosto',
      !!c && !c.mesesQueFaltan(LATIN_DOORS, new Date(2026, 7, 1), 12).some((m) => m.name === '08/2026'));
    ok('cruza de año con fechas bien formadas (febrero de 2027 acaba el 28)',
      faltan.find((m) => m.name === '02/2027')?.endDate === '2027-02-28' && faltan[0]?.startDate === '2027-01-01');
    //  M1 sobrevivia: el solape medido solo con periodos que empiezan el dia 1.
    //  Un periodo del 15/01 al 10/02 toca enero Y febrero.
    ok('un periodo a mitad de mes bloquea los dos meses que toca',
      !!c && JSON.stringify(c.mesesQueFaltan([{ startDate: '2027-01-15', endDate: '2027-02-10' }], new Date(2027, 0, 1), 3).map((m) => m.name)) === JSON.stringify(['03/2027']));
    ok('idempotente: con lo que crea, no falta nada',
      !!c && c.mesesQueFaltan([...LATIN_DOORS, ...faltan], new Date(2026, 8, 16), 12).length === 0);
    ok('una empresa nueva, dada de alta en noviembre, nace con 12 meses',
      !!c && c.mesesQueFaltan([], new Date(2026, 10, 20), c.MESES_A_ABRIR).length === 12 && c.MESES_A_ABRIR === 12);
  }

  console.log('\n2) Cuantos dias cubren\n');
  {
    const abiertos = LATIN_DOORS.filter((p) => p.status === 'open');
    ok('hoy (16/09/2026) hasta el 31/12: 107 dias, hoy incluido', !!c && c.diasDeCobertura(abiertos, new Date(2026, 8, 16)) === 107,
      String(c?.diasDeCobertura(abiertos, new Date(2026, 8, 16))));
    ok('un dia sin periodo abierto: 0', !!c && c.diasDeCobertura(abiertos, new Date(2027, 0, 1)) === 0);
    ok('un hueco corta la cuenta aunque haya periodos despues',
      !!c && c.diasDeCobertura([{ startDate: '2026-09-01', endDate: '2026-09-30' }, { startDate: '2026-11-01', endDate: '2026-11-30' }], new Date(2026, 8, 16)) === 15);
    ok('el aviso salta por debajo de 45 dias', !!c && c.DIAS_AVISO_PERIODOS === 45);
  }

  console.log('\n3) Crear un periodo a mano se niega cuando debe\n');
  {
    const m = c?.motivoParaNoCrearPeriodo;
    ok('fin antes que inicio: se niega', !!m && typeof m({ startDate: '2027-02-01', endDate: '2027-01-31' }, []) === 'string');
    ok('pisarse con otro: se niega, y dice con cual', !!m && /periodo 2026/.test(m({ startDate: '2026-12-01', endDate: '2027-03-31' }, LATIN_DOORS) ?? ''));
    ok('pegado al anterior, sin compartir dias: se permite', !!m && m({ startDate: '2027-01-01', endDate: '2027-01-31' }, LATIN_DOORS) === null);
    //  M2 sobrevivia: faltaba el borde. Compartir UN dia ya es pisarse.
    ok('compartir un solo dia (el 31/12) ya es pisarse', !!m && typeof m({ startDate: '2026-12-31', endDate: '2027-01-31' }, LATIN_DOORS) === 'string');
  }

  console.log('\n4) El cableado\n');
  {
    const repo = fuente(REPO);
    const i = repo.indexOf('static async abrirPeriodosSiguientes(');
    const cuerpo = i < 0 ? '' : repo.slice(i, repo.indexOf('\n  }\n', i));
    ok('el repositorio abre los siguientes con el calculo compartido, en el modo pedido',
      /mesesQueFaltan\(existentes, desde, MESES_A_ABRIR\)/.test(cuerpo) && /modo: modo,/.test(cuerpo) && /eq\(accountingPeriods\.modo, modo\)/.test(cuerpo));
    ok('y deja rastro en auditoria', /action: 'abrir_periodos_siguientes'/.test(cuerpo));
    const sembrador = repo.slice(repo.indexOf('static async sembrarPeriodosContables('), repo.indexOf('static async seedDefaultChartOfAccounts('));
    //  M8 sobrevivia: bastaba nombrar mesesQueFaltan. Se fija que pida los doce.
    ok('el sembrador de empresas nuevas ya no para en diciembre: pide MESES_A_ABRIR',
      /mesesQueFaltan\(delEntorno, desde, MESES_A_ABRIR\)/.test(sembrador) && !/mes <= 12/.test(sembrador));

    let abrir = '';
    try { abrir = fuente('src/app/api/v1/accounting/periods/abrir-siguientes/route.ts'); } catch { abrir = ''; }
    ok('ruta: exige escritura en contabilidad y usa la empresa y el modo de la sesion',
      /'contabilidad', 'write'/.test(abrir) && /abrirPeriodosSiguientes\(session\.companyId, session\.modo, session\.userId\)/.test(abrir));

    const crear = fuente(RUTA);
    //  M11 sobrevivia: bastaba que existieran la llamada y un 409 (el del nombre
    //  repetido). Se fija que el motivo DECIDA la respuesta.
    ok('crear a mano consulta los existentes y se niega con el motivo',
      /const motivo = motivoParaNoCrearPeriodo\(/.test(crear)
      && /if \(motivo\) \{\s*return NextResponse\.json\(\s*\{ success: false, error: \{ code: 'CONFLICT', message: motivo \} \},\s*\{ status: 409 \}/.test(crear)
      && /eq\(accountingPeriods\.modo, session\.modo\)/.test(crear));

    const pantalla = fuente('src/app/dashboard/accounting/page.tsx');
    const manejador = pantalla.slice(pantalla.indexOf('const handleAbrirSiguientes = async () =>'));
    ok('boton en la pantalla, con confirmacion antes de llamar',
      /onClick=\{handleAbrirSiguientes\}/.test(pantalla)
      //  M13 sobrevivia: el confirm estaba antes del fetch pero nadie miraba su
      //  respuesta. Se fija el `return` si no se confirma, entre los dos.
      && manejador.indexOf('await confirm(') >= 0
      && manejador.indexOf('if (!confirmado) return;') > manejador.indexOf('await confirm(')
      && manejador.indexOf('/api/v1/accounting/periods/abrir-siguientes') > manejador.indexOf('if (!confirmado) return;'));

    const panel = fuente('src/repositories/dashboardRepository.ts');
    ok('el panel de inicio avisa con el calculo compartido',
      /type: 'periodos_por_agotarse'/.test(panel) && /diasDeCobertura\(periodosAbiertos, new Date\(\)\)/.test(panel) && /diasCubiertos < DIAS_AVISO_PERIODOS/.test(panel)
      && /eq\(accountingPeriods\.status, 'open'\)/.test(panel) && /actionLink: '\/dashboard\/accounting\?tab=periods'/.test(panel));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
