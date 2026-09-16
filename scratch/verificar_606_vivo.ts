/**
 * Banco del lote 134: la pantalla del 606 no funcionaba, por tres motivos a la
 * vez, y ninguno de los tres se veia.
 *
 *     pnpm exec tsx scratch/verificar_606_vivo.ts
 *
 * 1. MANDABA EL LITERAL 'TODO_COMPANY_ID'. La ruta exigia `companyId` y
 *    contestaba 403 si no era el de la sesion, asi que la tabla salia vacia
 *    SIEMPRE. Medido contra la base el 2026-09-15: en PRODUCCION hay 48 gastos
 *    en julio (RD$1.154.281,30, con RD$109.033,68 de ITBIS retenido), 33 en
 *    agosto (RD$1.682.138,88) y 19 en septiembre (RD$440.346,80). La pantalla
 *    decia "No hay gastos registrados para este periodo".
 *
 * 2. EL BOTON DE EXPORTAR APUNTABA A UNA RUTA QUE NO EXISTE,
 *    `/api/v1/reports/606/txt`: el 606 tiene `download/` y el que tiene `txt/`
 *    es el 607. Y `res.blob()` no mira el estado, asi que el 404 se descargaba
 *    como si fuera el fichero. Eso es lo que se le habria remitido a la DGII.
 *
 * 3. EL MES SE CERRABA EL DIA 31 a pelo (`${year}-${month}-31`), contra
 *    `issue_date`, que es columna `date`. En los meses de 30 dias y en febrero
 *    ese literal NO ES UNA FECHA: Postgres no devuelve de menos, rechaza la
 *    consulta entera con "date/time field value out of range". Comprobado
 *    contra la base (`scratch/_to_delete/medir_606_dia31.ts`): julio contesta
 *    48; septiembre y febrero revientan. Hoy es 15 de septiembre.
 *
 * La seccion A ejecuta: `ultimoDiaDelMes` es una funcion pura y se le pueden
 * pedir los doce meses.
 */
import fs from 'fs';
import { sinComentarios, bloque } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const codigo = (f: string) => sinComentarios(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
const hay = (f: string) => fs.existsSync(f);

const FECHAS = 'src/utils/fechasLocales.ts';
const SERVICIO = 'src/services/expenseService.ts';
const P606 = 'src/app/dashboard/reports/606/page.tsx';
const P607 = 'src/app/dashboard/reports/607/page.tsx';
const R606 = 'src/app/api/v1/reports/606/route.ts';
const R606D = 'src/app/api/v1/reports/606/download/route.ts';
const R607T = 'src/app/api/v1/reports/607/txt/route.ts';

async function main() {
  // ───────────────────────────────────────────────────────────────────────
  //  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
  // ───────────────────────────────────────────────────────────────────────
  //  El hecho que hacia mala la URL vieja, y que sigue siendo cierto.
  exige(hay(R606D), 'la ruta de descarga del 606 ya no existe');
  exige(!hay('src/app/api/v1/reports/606/txt/route.ts'),
        'ahora SI existe /api/v1/reports/606/txt: la correccion de la URL sobraria');
  exige(hay(R607T), 'la ruta txt del 607 ya no existe');
  //  Las tres rutas siguen comprobando de quien es la empresa: hacer opcional
  //  el parametro no puede abrir la puerta a mirar empresas ajenas.
  for (const r of [R606, R606D, R607T]) {
    exige(/auth\.role !== 'sistemas' && auth\.companyId !== companyId/.test(codigo(r)),
          `${r} ya no comprueba que la empresa sea la de la sesion`);
  }
  //  Y el 606 sigue filtrando por modo (lo que separa PRUEBA de PRODUCCION).
  exige(codigo(SERVICIO).includes('eq(expenses.modo, modo),'),
        'getExpenses ya no filtra por modo: el TXT de la DGII mezclaria PRUEBA');

  const fechas = await import('../src/utils/fechasLocales').catch(() => null);
  const ultimoDiaDelMes = (fechas as { ultimoDiaDelMes?: (p: unknown) => string | null } | null)?.ultimoDiaDelMes;
  const esDiaReal = (fechas as { esDiaReal?: (d: unknown) => boolean } | null)?.esDiaReal;

  // ───────────────────────────────────────────────────────────────────────
  console.log('A. EL FIN DE MES, EJECUTANDO');
  // ───────────────────────────────────────────────────────────────────────
  if (!ultimoDiaDelMes || !esDiaReal) {
    ok('existe ultimoDiaDelMes', false);
    ok('los doce meses de 2026 dan un dia que existe', false);
    ok('septiembre cierra el 30, no el 31', false);
    ok('y los de 31 siguen cerrando el 31', false);
    ok('febrero: 28 los años normales, 29 los bisiestos, y el siglo cuenta', false);
    ok('un periodo que no es un periodo da null, no una fecha inventada', false);
  } else {
    ok('existe ultimoDiaDelMes', true);

    const doce = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const dados = doce.map((p) => ultimoDiaDelMes(p));
    ok(`los doce meses de 2026 dan un dia que existe (${dados.filter((d) => d && esDiaReal(d)).length}/12)`,
       dados.every((d) => typeof d === 'string' && esDiaReal(d)));

    //  El caso que reventaba: septiembre tiene 30, no 31.
    ok('septiembre cierra el 30, no el 31',
       ultimoDiaDelMes('2026-09') === '2026-09-30'
       && ultimoDiaDelMes('2026-04') === '2026-04-30'
       && ultimoDiaDelMes('2026-06') === '2026-06-30'
       && ultimoDiaDelMes('2026-11') === '2026-11-30');
    ok('y los de 31 siguen cerrando el 31',
       ultimoDiaDelMes('2026-07') === '2026-07-31'
       && ultimoDiaDelMes('2026-01') === '2026-01-31'
       && ultimoDiaDelMes('2026-12') === '2026-12-31');
    ok('febrero: 28 los años normales, 29 los bisiestos, y el siglo cuenta',
       ultimoDiaDelMes('2026-02') === '2026-02-28'
       && ultimoDiaDelMes('2024-02') === '2024-02-29'
       && ultimoDiaDelMes('2000-02') === '2000-02-29'   // divisible por 400: si
       && ultimoDiaDelMes('1900-02') === '1900-02-28'); // divisible por 100: no
    ok('un periodo que no es un periodo da null, no una fecha inventada',
       ultimoDiaDelMes('2026-13') === null
       && ultimoDiaDelMes('2026-00') === null
       && ultimoDiaDelMes('2026-9') === null
       && ultimoDiaDelMes('2026-09-01') === null
       && ultimoDiaDelMes('') === null
       && ultimoDiaDelMes(null) === null);
  }
  //  No se arma con `Date`: `new Date(anio, mes, 0)` da el ultimo dia en hora
  //  LOCAL, y pasarlo por toISOString lo corre un dia al este de Greenwich.
  //  Es la forma, asi que se mira en la fuente.
  //
  //  Ojo: "no hay `new Date(` ahi dentro" es cierto DE BALDE mientras la
  //  funcion no existe (el bloque sale vacio). Va pegado a una marca del
  //  estado posterior -- que el bloque existe y cuenta los dias con la tabla
  //  del mes -- o se regalaria un OK en la contraprueba.
  {
    const cuerpo = bloque(codigo(FECHAS), 'export function ultimoDiaDelMes(');
    ok('no se arma construyendo un Date (que traeria el huso de vuelta)',
       cuerpo.includes('DIAS_DEL_MES[mm - 1]') && !/new Date\(/.test(cuerpo));
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('B. EL 606 PREGUNTA POR UN MES QUE EXISTE');
  // ───────────────────────────────────────────────────────────────────────
  {
    const src = codigo(SERVICIO);
    const carga = bloque(src, 'export async function getExpenses(');
    ok('getExpenses ya no cierra el mes el dia 31 a pelo',
       !/\$\{year\}-\$\{month\}-31/.test(carga) && !/-31`/.test(carga));
    ok('lo pregunta al ayudante, y no sigue si el periodo no vale',
       /const end = ultimoDiaDelMes\(period\);/.test(carga)
       && /if \(!end\) throw/.test(carga)
       && src.includes("import { ultimoDiaDelMes } from '@/utils/fechasLocales';"));
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('C. LA PANTALLA DEL 606 ESTA VIVA');
  // ───────────────────────────────────────────────────────────────────────
  {
    const src = codigo(P606);
    ok('ya no manda el literal TODO_COMPANY_ID',
       !/TODO_COMPANY_ID/.test(src));
    ok('pide el listado sin decir de que empresa es',
       /fetch\(`\/api\/v1\/reports\/606\?period=\$\{period\}`\)/.test(src));
    ok('y descarga por la ruta que EXISTE',
       /fetch\(`\/api\/v1\/reports\/606\/download\?period=\$\{period\}`\)/.test(src)
       && !/reports\/606\/txt/.test(src));
    ok('no se traga el error como si fuera el fichero: mira el estado antes del blob',
       /if \(!res\.ok\)[\s\S]{0,300}toast\.error/.test(bloque(src, 'const exportTxt = async () => {'))
       && /if \(!res\.ok\)/.test(bloque(src, 'const fetchExpenses = async () => {')));
    ok('y "no pude leerlo" deja de ser "no hay gastos"',
       /<ErrorDeCarga mensaje=\{errorCarga\}/.test(src)
       && src.includes("import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';"));
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('D. LAS RUTAS YA NO EXIGEN QUE SE LES DIGA LA EMPRESA');
  // ───────────────────────────────────────────────────────────────────────
  for (const r of [R606, R606D, R607T]) {
    const src = codigo(r);
    ok(`${r.split('/').slice(-3).join('/')}: si no viene, es la de la sesion`,
       /const companyId = searchParams\.get\('companyId'\) \|\| auth\.companyId;/.test(src)
       && !/if \(!companyId \|\| !period\)/.test(src));
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('E. EL 607 NO DA EL RODEO NI DESCARGA ERRORES');
  // ───────────────────────────────────────────────────────────────────────
  {
    const exportar = bloque(codigo(P607), 'const exportTxt = async () => {');
    ok('no va a auth/me a preguntar lo que la ruta ya sabe',
       !/auth\/me/.test(exportar)
       && /fetch\(`\/api\/v1\/reports\/607\/txt\?period=\$\{period\}`\)/.test(exportar));
    ok('mira el estado antes de descargar',
       /if \(!res\.ok\)[\s\S]{0,300}toast\.error/.test(exportar));
    ok('y el fin de mes del listado tampoco pasa por un Date con huso',
       /const end = ultimoDiaDelMes\(period\);/.test(bloque(codigo(P607), 'const fetchSales = async () => {'))
       && !/toISOString\(\)\.split\('T'\)/.test(codigo(P607)));
  }

  console.log('\n' + '='.repeat(72));
  if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
  console.log('TODO OK');
}

main();
