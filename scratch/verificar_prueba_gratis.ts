/**
 * Lote 300 -- toda empresa nueva nace con una prueba gratis: suscripcion
 * `trialing`, 30 dias desde la alta (dia de RD), con los limites del Plan Basico.
 *
 * Lo que este banco EJECUTA: la regla de las fechas (`periodoDePrueba`), con el
 * caso que rompe una cuenta en UTC: una alta a las 21:00 de RD del ultimo dia del
 * mes, que en UTC ya es el dia 1 del mes siguiente. Lo que LEE: que las TRES altas
 * (`crearEmpresaConSuSiembra` -- registro y Administracion -- y `setup/confirm`)
 * llaman a la misma funcion dentro de su transaccion, y que esa funcion resuelve el
 * plan por nombre y no por un id escrito a mano. El comportamiento contra una base
 * lo comprueba `verificar_prueba_gratis_db.ts`.
 *
 *   npx tsx scratch/verificar_prueba_gratis.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
/** Sin comentarios: una comprobacion no puede pasar porque el codigo EXPLIQUE lo que hace. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
/** Identificador entero, no prefijo (`crearPruebaGratisX` no es `crearPruebaGratis`). */
const llamaA = (src: string, id: string, args: string) => new RegExp(`\\bawait\\s+${id}\\(\\s*${args}\\s*\\)`).test(src);

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
/** Lo que lanza, falla: un mutante que hace reventar la regla no puede abortar el banco. */
const prueba = <T,>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };

const ALTA = 'src/services/empresas/altaDeEmpresa.ts';
const SETUP = 'src/app/api/v1/setup/confirm/route.ts';
const REGISTRO = 'src/app/api/v1/auth/register/route.ts';
const ADMIN = 'src/app/api/v1/admin/companies/route.ts';
const PRUEBA = 'src/services/suscripcion/pruebaGratis.ts';
const PLAN = 'src/services/suscripcion/planDePrueba.ts';
const MIGRACION = 'drizzle/0022_plan_de_prueba.sql';
const RUTA_PLANES = 'src/app/api/v1/admin/plans/route.ts';
const RUTA_PLAN = 'src/app/api/v1/admin/plans/[id]/route.ts';
const PANTALLA = 'src/app/dashboard/admin/page.tsx';
const DIA = 24 * 60 * 60 * 1000;

async function main() {
  //  Precondiciones: valen en los dos estados (las tres altas existen antes y despues,
  //  y las dos rutas del lote 287 siguen pasando por `crearEmpresaConSuSiembra`).
  for (const f of [ALTA, SETUP, REGISTRO, ADMIN]) if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: falta ${f}`);
  for (const f of [REGISTRO, ADMIN]) {
    if (!/\bcrearEmpresaConSuSiembra\(tx,/.test(sinComentarios(leer(f)))) throw new Error(`Precondicion: ${f} ya no da de alta con crearEmpresaConSuSiembra`);
  }

  console.log('\n1) Las fechas de la prueba, ejecutadas\n');
  let P: typeof import('../src/services/suscripcion/periodoDePrueba') | null = null;
  try { P = await import('../src/services/suscripcion/periodoDePrueba'); } catch { P = null; }
  const T1 = [
    'la prueba dura 30 dias (constante de la decision del dueno)',
    'alta el 31/10 a las 21:00 de RD (ya 01/11 en UTC): empieza el 31/10, no el 01/11',
    '  el inicio es la medianoche de RD de ese dia (04:00 UTC)',
    '  el fin es el ultimo instante del dia 30 (29/11 23:59:59.999 de RD) = inicio + 30 dias - 1 ms',
    'alta a las 00:30 de RD (04:30 UTC): ese mismo dia, no el anterior',
    'alta a las 19:59 de RD del 05/10 (23:59 UTC): el 05/10',
    'el plan se busca por el nombre "Plan Básico", sin mayusculas ni espacios de los bordes',
  ];
  if (!P) { for (const t of T1) ok(t, false, 'no existe services/suscripcion/periodoDePrueba.ts'); }
  else {
    ok(T1[0], P.DIAS_DE_PRUEBA === 30, String(P.DIAS_DE_PRUEBA));
    //  31/10/2026 21:00 RD = 01/11/2026 01:00 UTC.
    const a = prueba(() => P!.periodoDePrueba(new Date('2026-11-01T01:00:00.000Z')));
    ok(T1[1], a !== 'LANZO' && a.primerDia === '2026-10-31', a === 'LANZO' ? 'lanzo' : a.primerDia);
    ok(T1[2], a !== 'LANZO' && a.inicio.toISOString() === '2026-10-31T04:00:00.000Z', a === 'LANZO' ? 'lanzo' : a.inicio.toISOString());
    ok(T1[3], a !== 'LANZO' && a.fin.toISOString() === '2026-11-30T03:59:59.999Z' && a.ultimoDia === '2026-11-29'
      && a.fin.getTime() - a.inicio.getTime() === 30 * DIA - 1, a === 'LANZO' ? 'lanzo' : `${a.fin.toISOString()} ${a.ultimoDia}`);
    const b = prueba(() => P!.periodoDePrueba(new Date('2026-10-05T04:30:00.000Z')));
    ok(T1[4], b !== 'LANZO' && b.primerDia === '2026-10-05' && b.inicio.toISOString() === '2026-10-05T04:00:00.000Z',
      b === 'LANZO' ? 'lanzo' : b.inicio.toISOString());
    const c = prueba(() => P!.periodoDePrueba(new Date('2026-10-05T23:59:00.000Z')));
    ok(T1[5], c !== 'LANZO' && c.primerDia === '2026-10-05' && c.ultimoDia === '2026-11-03',
      c === 'LANZO' ? 'lanzo' : `${c.primerDia} - ${c.ultimoDia}`);
    ok(T1[6], P.NOMBRE_DEL_PLAN_DE_PRUEBA === 'Plan Básico' && P.nombreDePlanComparable('  PLAN Básico ') === 'plan básico',
      P.NOMBRE_DEL_PLAN_DE_PRUEBA);
  }

  console.log('\n2) La funcion unica y su cableado en las altas\n');
  const pr = sinComentarios(leer(PRUEBA));
  const alta = sinComentarios(leer(ALTA));
  const setup = sinComentarios(leer(SETUP));
  const IMPORT = /from\s+'@\/services\/suscripcion\/pruebaGratis'/;
  const cuerpoAlta = alta.slice(alta.indexOf('export async function crearEmpresaConSuSiembra'));
  ok('crearPruebaGratis crea la suscripcion en estado `trialing`, con inicio y fin de periodoDePrueba',
    /\.insert\(subscriptions\)/.test(pr) && /status:\s*'trialing'/.test(pr) && /periodoDePrueba\(ahora\)/.test(pr)
    && /currentPeriodStart:\s*inicio/.test(pr) && /currentPeriodEnd:\s*fin/.test(pr));
  //  Desde la segunda parte del lote el plan lo resuelve `planDePrueba.ts` (la casilla, o el
  //  nombre sin la 0022); la funcion lo pide y no atrapa lo que lance.
  const pp = sinComentarios(leer(PLAN));
  ok('  el plan no lleva ningun uuid escrito: sin la 0022 se busca por nombre',
    /lower\(btrim\(\$\{plans\.name\}\)\)/.test(pp) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(pr + pp));
  ok('  sin plan de prueba lanza (la alta se deshace), en vez de seguir sin prueba',
    /if\s*\(!porNombre\)\s*throw new PlanDePruebaNoExiste\(\)/.test(pp) && /const plan = await planDePrueba\(tx\);/.test(pr)
    && !/\bcatch\b/.test(pr));
  ok('  bloquea la empresa y no crea otra si ya tiene suscripcion',
    /\.for\('update'\)/.test(pr) && /if\s*\(yaTiene\)\s*return\s*\{\s*creada:\s*false/.test(pr));
  ok('crearEmpresaConSuSiembra (registro y Administracion) llama a crearPruebaGratis con SU tx y la empresa nueva',
    IMPORT.test(alta) && /import\s*\{[^}]*\bcrearPruebaGratis\b[^}]*\}/.test(alta) && llamaA(cuerpoAlta, 'crearPruebaGratis', 'tx,\\s*empresa\\.id'));
  const iSembrarPlanes = setup.indexOf('insert(plans)');
  const iTx = setup.indexOf('db.transaction(');
  const iLlamada = setup.search(/\bawait\s+crearPruebaGratis\(\s*tx,\s*newCompany\.id\s*\)/);
  const iEmpresa = setup.indexOf('.insert(companies)');
  ok('setup/confirm (que da de alta por su cuenta) llama a crearPruebaGratis dentro de su transaccion',
    IMPORT.test(setup) && iTx >= 0 && iLlamada > iTx && iLlamada > iEmpresa && iEmpresa > 0, `tx ${iTx} llamada ${iLlamada}`);
  ok('  y DESPUES de sembrar los planes, para que el Plan Basico exista en una base nueva',
    iSembrarPlanes >= 0 && iLlamada > iSembrarPlanes, `planes ${iSembrarPlanes} llamada ${iLlamada}`);
  //  Una sola puerta: fuera de la funcion, solo Administracion > Suscripciones (a mano)
  //  inserta suscripciones.
  const rutasConInsert = ['src/app/api/v1/auth/register/route.ts', ADMIN, SETUP, ALTA].filter((f) => /insert\(subscriptions\)/.test(sinComentarios(leer(f))));
  ok('ninguna alta inserta su propia suscripcion: todas pasan por la funcion', rutasConInsert.length === 0 && /insert\(subscriptions\)/.test(pr),
    rutasConInsert.join(', '));

  console.log('\n3) El plan de prueba es el MARCADO (casilla de Administracion > Planes, migracion 0022)\n');
  const mig = leer(MIGRACION).replace(/--[^\n]*/g, ' ');
  ok('la 0022 anade la columna `es_plan_de_prueba boolean not null default false` a plans',
    /ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "es_plan_de_prueba" boolean DEFAULT false NOT NULL/.test(mig));
  ok('  y un indice UNICO parcial: la base impide dos marcados',
    /CREATE UNIQUE INDEX IF NOT EXISTS "\w+" ON "plans" \("es_plan_de_prueba"\) WHERE "es_plan_de_prueba"/.test(mig));
  ok('  y marca el "Plan Básico" (el mas antiguo) solo si no hay ninguno marcado, sin avisos (sin DROP ... IF EXISTS)',
    /UPDATE "plans" SET "es_plan_de_prueba" = true\s+WHERE "id" = \(SELECT "id" FROM "plans" WHERE lower\(btrim\("name"\)\) = 'plan básico' ORDER BY "created_at", "id" LIMIT 1\)\s+AND NOT EXISTS \(SELECT 1 FROM "plans" WHERE "es_plan_de_prueba"\)/.test(mig)
    && !/DROP/i.test(mig));
  ok('la columna NO se declara en el esquema de Drizzle (plans se lee entera): se mira si existe antes de nombrarla',
    mig.length > 0 && !/es_plan_de_prueba|esPlanDePrueba/.test(leer('src/db/schema/companies.ts'))
    && /information_schema\.columns[\s\S]{0,120}table_name = 'plans' AND column_name = 'es_plan_de_prueba'/.test(pp));
  const conColumna = pp.slice(pp.indexOf('export async function planDePrueba'), pp.indexOf('const [porNombre]'));
  ok('con la columna manda la casilla, y SIN plan marcado lanza (no cae al nombre)',
    /if \(await hayColumnaPlanDePrueba\(tx\)\)/.test(conColumna) && /WHERE es_plan_de_prueba LIMIT 1/.test(conColumna)
    && /if \(!marcado\) throw new NingunPlanDePrueba\(\)/.test(conColumna) && /return \{ \.\.\.marcado, porCasilla: true \}/.test(conColumna));
  let PL: typeof import('../src/services/suscripcion/planDePrueba') | null = null;
  try { process.env.DATABASE_URL ||= 'postgres://nadie@127.0.0.1:1/ninguna'; PL = await import('../src/services/suscripcion/planDePrueba'); } catch { PL = null; }
  ok('  con el mensaje que dice donde arreglarlo',
    !!PL && new PL.NingunPlanDePrueba().message === 'No hay plan de prueba: marque uno en Administración > Planes'
    && new PL.FaltaMigracionPlanDePrueba().message.includes('drizzle/0022_plan_de_prueba.sql'));
  const marcar = pp.slice(pp.indexOf('export async function marcarPlanDePrueba'), pp.indexOf('export async function marcarPlanDePruebaInicial'));
  const iDesmarca = marcar.search(/SET es_plan_de_prueba = false WHERE es_plan_de_prueba AND id <> \$\{planId\}::uuid/);
  const iMarca = marcar.search(/SET es_plan_de_prueba = true WHERE id = \$\{planId\}::uuid/);
  ok('marcar un plan desmarca ANTES el que estaba (el indice rechazaria dos), y sin columna marcar lanza',
    iDesmarca > 0 && iMarca > iDesmarca && /if \(marcado\) throw new FaltaMigracionPlanDePrueba\(\)/.test(marcar), `${iDesmarca} ${iMarca}`);
  for (const [f, nombre] of [[RUTA_PLANES, 'crear'], [RUTA_PLAN, 'editar']] as const) {
    const r = sinComentarios(leer(f));
    ok(`la ruta de ${nombre} plan acepta la casilla, la marca en SU transaccion, y sin la 0022 contesta 409`,
      /esPlanDePrueba: z\.boolean\(\)\.optional\(\),/.test(r) && /db\.transaction\(async \(tx\) =>[\s\S]*?await marcarPlanDePrueba\(tx,/.test(r)
      && /if \(parsed\.data\.esPlanDePrueba && !\(await hayColumnaPlanDePrueba\(db\)\)\)[\s\S]{0,200}status: 409/.test(r));
  }
  ok('la lista de planes dice cual es el de prueba, y si la base tiene la casilla',
    /planesMarcados\(db\)/.test(sinComentarios(leer(RUTA_PLANES))) && /esPlanDePrueba: marcados\?\.has\(p\.id\)/.test(leer(RUTA_PLANES))
    && /planDePrueba: \{ disponible: marcados !== null/.test(leer(RUTA_PLANES)));
  const pant = sinComentarios(leer(PANTALLA));
  ok('la pantalla pinta la casilla en el formulario y la insignia en la lista, y manda lo que dice `cuerpoDelPlan`',
    /<CasillaPlanDePrueba marcado=\{planForm\.esPlanDePrueba\} estado=\{estadoPrueba\}/.test(pant)
    && /\{plan\.esPlanDePrueba && <div className="mt-1"><InsigniaPlanDePrueba \/><\/div>\}/.test(pant)
    && (pant.match(/JSON\.stringify\(cuerpoDelPlan\(planForm, estadoPrueba\)\)/g) || []).length === 2
    && /setEstadoPrueba\(estadoPlanDePrueba\(pData\)\)/.test(pant));
  let PP: typeof import('../src/app/dashboard/admin/planDePrueba') | null = null;
  try { PP = await import('../src/app/dashboard/admin/planDePrueba'); } catch { PP = null; }
  const form = { name: 'X', active: true, esPlanDePrueba: true };
  ok('sin la 0022 lo que se manda NO lleva la casilla (un 409 que nadie pidio); con ella, si',
    !!PP && !('esPlanDePrueba' in PP.cuerpoDelPlan(form, { disponible: false, migracion: 'm' }))
    && PP.cuerpoDelPlan(form, { disponible: true, migracion: 'm' }).esPlanDePrueba === true
    && PP.estadoPlanDePrueba({ planDePrueba: { disponible: true, migracion: 'm' } }).disponible === true
    && PP.estadoPlanDePrueba({ data: [] }).disponible === false);
  let htmlSin = ''; let htmlCon = '';
  try {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { CasillaPlanDePrueba } = await import('../src/app/dashboard/admin/components/PlanDePrueba');
    htmlSin = renderToStaticMarkup(React.createElement(CasillaPlanDePrueba, { marcado: true, estado: { disponible: false, migracion: 'drizzle/0022_plan_de_prueba.sql' }, alCambiar: () => {} }));
    htmlCon = renderToStaticMarkup(React.createElement(CasillaPlanDePrueba, { marcado: true, estado: { disponible: true, migracion: 'x' }, alCambiar: () => {} }));
  } catch { /* sin el componente: FALLA abajo */ }
  ok('sin la 0022 la casilla sale deshabilitada, sin marcar, y dice que migracion falta',
    /<input[^>]*\sdisabled=""/.test(htmlSin) && !/<input[^>]*\schecked=""/.test(htmlSin) && htmlSin.includes('drizzle/0022_plan_de_prueba.sql'), htmlSin.slice(0, 160));
  ok('  con ella, habilitada y con su etiqueta', htmlCon.length > 0 && !/<input[^>]*\sdisabled=""/.test(htmlCon)
    && /<input[^>]*\schecked=""/.test(htmlCon) && /<label for="planDePrueba"/.test(htmlCon));
  const iSemilla = setup.search(/await marcarPlanDePruebaInicial\(tx\);/);
  ok('setup/confirm marca el plan de prueba al sembrar los planes, antes de crear la prueba',
    iSemilla > iSembrarPlanes && iSembrarPlanes >= 0 && iSemilla < iLlamada && /from '@\/services\/suscripcion\/planDePrueba'/.test(setup));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
