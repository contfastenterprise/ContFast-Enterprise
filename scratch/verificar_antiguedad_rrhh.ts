/**
 * La antiguedad de un empleado, calculada en UN sitio.
 *
 * EL BARRIDO DECIA UNA COSA Y ERA OTRA
 * ------------------------------------
 * `docs/auditoria/fechas_barrido_src.md` puso estos tres sitios como prioridad
 * 2 y los describio como "inflado en 1 siempre". Al medirlos resulto que no:
 *
 *  - El resto del año salia BIEN, y por accidente. `startOfCurrentYear` era
 *    medianoche LOCAL (04:00 UTC) y `term` medianoche UTC, asi que la resta
 *    salia cuatro horas corta y el `Math.ceil` la devolvia al numero bueno. El
 *    desajuste de husos estaba entero; lo tapaba un redondeo que nadie habia
 *    puesto para eso. El dia que alguien cambiara ese `ceil` por un `round`, se
 *    rompian los 365 dias del año a la vez.
 *
 *  - Y habia un fallo que el barrido no vio: EL 1 DE ENERO.
 *    `new Date('2026-01-01')` es medianoche UTC, y leida con `getFullYear()` en
 *    RD son las 20:00 del 31 de diciembre de 2025. La ruta hacia
 *    `new Date(term.getFullYear(), 0, 1)` y le salia el 1 de enero de 2025: una
 *    liquidacion con salida el 1 de enero acumulaba un AÑO ENTERO de salario
 *    devengado en vez de cero. Con un sueldo de 40.000, 40.021 de regalia en
 *    lugar de 0. Barridas 336 fechas de salida, fallaba esa y solo esa.
 *
 *  - Y la pantalla y el servidor no coincidian NUNCA: seis de seis casos daban
 *    cifras distintas. Lo que el usuario veia antes de guardar no era lo que se
 *    guardaba.
 *
 * EL PERIODO ES UN INTERVALO SEMIABIERTO
 * --------------------------------------
 * Se decidio que el dia de salida no se cuenta -- es lo que el servidor ya
 * guardaba, asi que ninguna liquidacion emitida cambia. Pero aplicar eso a
 * secas al 31 de diciembre daria 364 dias para quien trabajo el año entero, y
 * eso seria bajarle la regalia a toda la plantilla.
 *
 * El 31 de diciembre no es una salida: es que el año se acabo. El periodo se
 * cuenta como [desde, hasta) donde `hasta` es el dia en que la persona se fue
 * -- que no trabajo -- o el 1 de enero del año siguiente, que aun no ha
 * trabajado.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Si los tramos del Codigo de Trabajo son los correctos. Eso no es nuestro y no
 * se ha tocado. Lo que se comprueba -- EJECUTANDO la cuenta, no leyendola -- es
 * que solo cambie lo que tenia que cambiar: el 1 de enero, y el dia de mas que
 * llevaba la pantalla.
 */
import { fuente, crudo } from './_fuente';

// `antiguedad.ts` es de este lote: contra el arbol ANTERIOR no existe. Con un
// `import` estatico la contraprueba revienta antes de imprimir una sola linea.
type Modulo = typeof import('@/services/hr/antiguedad');

const MO = 'src/services/hr/antiguedad.ts';
const SV = 'src/services/payrollCalculationService.ts';
const RT = 'src/app/api/v1/hr/settlements/route.ts';
const PG = 'src/app/dashboard/hr/settlements/page.tsx';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

// --- Lo que hacian los tres sitios ANTES, copiado tal cual para comparar.
const rutaAntes = (h: string, t: string): number => {
  const hire = new Date(h), term = new Date(t);
  const soy = new Date(term.getFullYear(), 0, 1);
  const desde = hire > soy ? hire : soy;
  return Math.max(0, Math.ceil((term.getTime() - desde.getTime()) / 86400000));
};
const servicioAntes = (h: string, t: string) => {
  const d = Math.ceil(Math.abs(new Date(t).getTime() - new Date(h).getTime()) / 86400000);
  return { anios: d / 365.25, meses: (d / 365.25) * 12 };
};

const leer = (ruta: string, conComentarios = false): string => {
  try { return (conComentarios ? crudo(ruta) : fuente(ruta)).replace(/\r\n/g, '\n'); }
  catch { return ''; }
};
const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);
const noTiene = (s: string, t: string): boolean => s.length > 0 && !s.includes(t);

async function main(): Promise<void> {

let M: Modulo | null = null;
try { M = await import('@/services/hr/antiguedad'); } catch { M = null; }
const con = (t: string, f: (m: Modulo) => boolean): void => ok(t, M !== null && f(M));

// ============================================================================
// A. LA CUENTA, EJECUTADA
// ============================================================================
con('el 1 de enero deja de leerse como el año anterior',
  (m) => m.anioDe('2026-01-01') === 2026 && m.anioDe('2025-12-31') === 2025);

// ESTE es el fallo: 365 dias de salario devengado donde no habia ninguno.
con('una salida el 1 de enero da CERO dias, no un año entero',
  (m) => rutaAntes('2019-03-15', '2026-01-01') === 365
    && m.diasTrabajadosEnElAnio('2019-03-15', '2026-01-01') === 0);

// Y solo eso: el resto del año no se toca. Si cambiara algun otro dia, seria
// una liquidacion distinta para gente que hoy cobra bien.
con('y NINGUNA otra fecha de salida del año cambia de cifra', (m) => {
  let distintas = 0;
  for (let mes = 1; mes <= 12; mes++) for (let d = 1; d <= 28; d++) {
    const t = `2026-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (rutaAntes('2019-03-15', t) !== m.diasTrabajadosEnElAnio('2019-03-15', t)) distintas++;
  }
  return distintas === 1;
});

// La promesa que se le hizo al usuario: cesantia y preaviso no se mueven.
con('cesantia y preaviso: ni una cifra se mueve en 600 pares de fechas', (m) => {
  let distintas = 0, pares = 0;
  for (const h of ['2019-03-15', '2025-01-01', '2020-06-30', '2015-08-01', '2026-01-01']) {
    for (let mes = 1; mes <= 12; mes++) for (let d = 1; d <= 28; d += 3) {
      const t = `2026-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (t < h) continue;
      pares++;
      const a = servicioAntes(h, t);
      if (Math.abs(a.meses - m.mesesDeServicio(h, t)) > 1e-9
        || Math.abs(a.anios - m.aniosDeServicio(h, t)) > 1e-9) distintas++;
    }
  }
  return pares > 500 && distintas === 0;
});

// Si el año entero diera 364, la regalia le bajaria a TODA la plantilla. El
// limite superior tiene que ser abierto.
con('quien trabaja el año entero sigue teniendo 12 meses, no 11,97',
  (m) => m.diasTrabajadosEnAnio('2019-03-15', null, 2026) === 365
    && Math.abs(m.mesesEnAnio('2019-03-15', null, 2026) - 12) < 0.02);

con('el dia de salida no se cuenta: entrar y salir el mismo dia son cero dias',
  (m) => m.diasTrabajadosEnElAnio('2026-03-01', '2026-03-01') === 0
    && m.diasTrabajadosEnElAnio('2026-03-01', '2026-03-02') === 1);

con('una salida el 31 de diciembre son 364 dias, no 365',
  (m) => m.diasTrabajadosEnAnio('2019-01-01', '2026-12-31', 2026) === 364);

// Las columnas son `date` y llegan como texto, pero algun sitio puede pasar un
// Date de verdad. Los dos caminos tienen que dar lo mismo.
con('da igual recibir texto o un Date',
  (m) => m.diasTrabajadosEnElAnio('2026-01-10', '2026-06-30')
    === m.diasTrabajadosEnElAnio(new Date(2026, 0, 10), new Date(2026, 5, 30)));

// Ojo: probar solo `diasTrabajadosEnElAnio` no basta -- tiene su propio
// `Math.max(0, ...)`, asi que quitarle el suyo a `diasDeServicio` se escapaba.
// Una baja anterior al alta ahi da antiguedad negativa, y la cesantia se
// calcula sobre ella. Lo cazo un mutante, no la lectura.
con('dato malo no inventa numeros negativos, en NINGUNA de las dos cuentas',
  (m) => m.diasTrabajadosEnElAnio('2026-06-01', '2026-03-01') === 0
    && m.diasTrabajadosEnElAnio(null, '2026-03-01') === 0
    && m.diasTrabajadosEnElAnio('2026-03-01', undefined) === 0
    && m.diasDeServicio('2026-06-01', '2026-03-01') === 0
    && m.mesesDeServicio('2026-06-01', '2026-03-01') === 0
    && m.diasDeServicio(null, '2026-03-01') === 0);

// El filtro de la lista del doble sueldo leia el año con el mismo `getFullYear`.
con('quien entra en la lista del doble sueldo se decide sin husos',
  (m) => m.trabajoEnElAnio('2026-01-01', null, 2026) === true
    && m.trabajoEnElAnio('2027-01-01', null, 2026) === false
    && m.trabajoEnElAnio('2019-01-01', '2026-01-01', 2026) === true
    && m.trabajoEnElAnio('2019-01-01', '2025-12-31', 2026) === false);

// ============================================================================
// B. LOS TRES SITIOS LO USAN
// ============================================================================
const mo = leer(MO), sv = leer(SV), rt = leer(RT), pg = leer(PG);

// Precondicion: casi todo lo que sigue son negaciones, y una negacion sobre una
// cadena vacia es cierta gratis.
if (sv.length < 5000 || rt.length < 3000 || pg.length < 20000) {
  throw new Error('No se pudieron leer los fuentes de RRHH. Revisa las rutas.');
}

ok('el servicio de nomina usa el modulo, no su propia resta',
  tiene(sv, "from '@/services/hr/antiguedad'")
  && tiene(sv, 'aniosDeServicio(params.hireDate, params.terminationDate)')
  && noTiene(sv, 'Math.ceil(diffTime'));

ok('la ruta usa el modulo y pierde el getFullYear sobre medianoche UTC',
  tiene(rt, "from '@/services/hr/antiguedad'")
  && tiene(rt, 'mesesEnElAnio(emp.hireDate, terminationDate)')
  && noTiene(rt, 'new Date(term.getFullYear(), 0, 1)'));

ok('la pantalla usa el modulo y se le va el +1',
  tiene(pg, "from '@/services/hr/antiguedad'")
  && tiene(pg, 'mesesEnAnio(emp.hireDate, emp.terminationDate, currentYear)')
  && tiene(pg, 'trabajoEnElAnio(emp.hireDate, emp.terminationDate, currentYear)')
  && noTiene(pg, '/ (1000 * 60 * 60 * 24)) + 1'));

// El servicio recibia `Date` por tipo, asi que pasarle la cadena de la columna
// no compilaba. Si se estrecha otra vez, la ruta deja de poder pasar el dato
// crudo y vuelve el `new Date` en medio.
ok('el servicio acepta la cadena de la columna, no solo Date',
  tiene(sv, 'hireDate: string | Date') && tiene(sv, 'terminationDate: string | Date'));

// Ninguno de los tres puede volver a hacer la resta por su cuenta.
ok('ninguno de los tres vuelve a restar milisegundos a mano',
  [sv, rt, pg].every((s) => noTiene(s, '1000 * 60 * 60 * 24')));

// ============================================================================
// C. EL CONTRATO ESCRITO
// ============================================================================
const plano = leer(MO, true).replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ');
ok('el modulo explica el fallo del 1 de enero',
  tiene(plano, 'EL FALLO DEL 1 DE ENERO'));

ok('y por que el limite superior es abierto',
  tiene(plano, 'INTERVALO SEMIABIERTO'));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);

}

main().catch((e) => { console.error(e); process.exit(1); });
