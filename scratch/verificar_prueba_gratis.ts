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
  ok('  el plan sale de buscarlo por nombre: ningun uuid escrito en la funcion',
    /lower\(btrim\(\$\{plans\.name\}\)\)/.test(pr) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(pr));
  ok('  sin Plan Basico lanza (la alta se deshace), en vez de seguir sin prueba',
    /if\s*\(!plan\)\s*throw new PlanDePruebaNoExiste\(\)/.test(pr));
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

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
