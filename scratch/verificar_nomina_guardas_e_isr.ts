/**
 * Lote 290 (lote A del diseno de los asientos de nomina) -- las guardas de la
 * nomina y la escala del ISR. Banco de CODIGO: ejecuta las reglas puras y mira
 * el cableado. Lo que pasa contra una base esta en
 * `verificar_nomina_guardas_e_isr_db.ts`.
 *
 * Lo que vigila:
 *  1. una regla de estados, UNA: recalcular solo `draft`/`calculated`, aprobar
 *     solo `calculated` con detalle, y la pantalla ofreciendo lo mismo;
 *  2. la escala del ISR de 2026 tal como la publica la DGII (CA687, Ley 11-92
 *     art. 296), en una constante unica de la que la toman la siembra y los
 *     guiones; ningun tramo escrito en el calculo;
 *  3. el ISR por tramos en sus fronteras exactas, el centavo entre tramos, y
 *     ejemplos de nomina de cada tramo con la base bruto - AFP - SFS;
 *  4. la escala vacia ya no da 0 en silencio: se niega.
 *
 * Los modulos que crea el lote se cargan con `import()` perezoso: en la
 * contraprueba (bac5a91) no existen y cada comprobacion debe dar FALLA, no
 * reventar el banco.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { leerPantallaDeNomina } from './pantallaDeNomina';

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => {
  total++;
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
/** Ejecuta y da FALLA (no revienta) si lanza. */
const intenta = (t: string, f: () => boolean, d?: () => string) => {
  try { ok(t, f(), d ? d() : ''); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
};

const raiz = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(raiz, r)) ? readFileSync(join(raiz, r), 'utf8') : '');
const nombra = (f: string, id: string) => new RegExp(`\\b${id}\\b`).test(f);
/** El cuerpo de un metodo estatico: desde su firma hasta la firma siguiente. */
function metodo(f: string, firma: string): string {
  const i = f.indexOf(firma);
  if (i < 0) return '';
  const j = f.indexOf('\n  static ', i + firma.length);
  const k = f.indexOf('\n  private static ', i + firma.length);
  const fin = [j, k].filter((x) => x > 0);
  return f.slice(i, fin.length ? Math.min(...fin) : undefined);
}
/** Sin comentarios: que la prosa de un comentario no haga pasar nada. */
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

type Estado = typeof import('../src/services/nomina/estadoDeNomina');
type Escala = typeof import('../src/services/nomina/escalaIsr');
type Calculo = typeof import('../src/services/payrollCalculationService');

async function main() {
  let E: Estado | null = null;
  let S: Escala | null = null;
  try { E = await import('../src/services/nomina/estadoDeNomina'); } catch { E = null; }
  try { S = await import('../src/services/nomina/escalaIsr'); } catch { S = null; }
  const C: Calculo = await import('../src/services/payrollCalculationService');
  const P = C.PayrollCalculationService;

  // ─── 1. La regla de estados ──────────────────────────────────────────────
  console.log('\n1. Transiciones de estado (regla pura)');
  const sinE = 'no existe services/nomina/estadoDeNomina.ts';
  if (!E) {
    for (const t of [
      'recalcular: solo borrador y calculada',
      'recalcular: aprobada, pagada y cancelada se niegan, con motivo',
      'aprobar: calculada con detalle si',
      'aprobar: calculada SIN detalle no',
      'aprobar: un borrador no, aunque tenga lineas',
      'aprobar: aprobada y pagada no',
      'acciones de la pantalla = lo que admite la regla, en todos los estados',
      'el error de la regla es un 409',
    ]) ok(t, false, sinE);
  } else {
    const e = E;
    intenta('recalcular: solo borrador y calculada', () =>
      e.motivoParaNoRecalcular('draft') === null && e.motivoParaNoRecalcular('calculated') === null);
    intenta('recalcular: aprobada, pagada y cancelada se niegan, con motivo', () =>
      ['approved', 'paid', 'cancelled'].every((s) => (e.motivoParaNoRecalcular(s) ?? '').includes('No se puede recalcular')));
    intenta('aprobar: calculada con detalle si', () =>
      e.motivoParaNoAprobar('calculated', 1) === null && e.motivoParaNoAprobar('calculated', 40) === null);
    intenta('aprobar: calculada SIN detalle no', () =>
      /sin detalle/.test(e.motivoParaNoAprobar('calculated', 0) ?? ''), () => String(e.motivoParaNoAprobar('calculated', 0)));
    intenta('aprobar: un borrador no, aunque tenga lineas', () =>
      /borrador/.test(e.motivoParaNoAprobar('draft', 3) ?? '') && /borrador/.test(e.motivoParaNoAprobar('draft', 0) ?? ''));
    intenta('aprobar: aprobada y pagada no', () =>
      e.motivoParaNoAprobar('approved', 5) !== null && e.motivoParaNoAprobar('paid', 5) !== null && e.motivoParaNoAprobar('cancelled', 5) !== null);
    intenta('acciones de la pantalla = lo que admite la regla, en todos los estados', () => {
      for (const s of [...e.ESTADOS_DE_NOMINA, 'raro']) {
        for (const n of [0, 1]) {
          const a = e.accionesDeNomina(s, n);
          if (a.recalcular !== (e.motivoParaNoRecalcular(s) === null)) return false;
          if (a.aprobar !== (e.motivoParaNoAprobar(s, n) === null)) return false;
          if (a.eliminar !== (e.motivoParaNoEliminar(s) === null)) return false;
        }
      }
      // y lo que ofrece es exactamente esto:
      const c1 = e.accionesDeNomina('calculated', 1);
      const ap = e.accionesDeNomina('approved', 1);
      return c1.recalcular && c1.aprobar && c1.eliminar && !ap.recalcular && !ap.aprobar && !ap.eliminar
        && !e.accionesDeNomina('draft', 0).aprobar && e.accionesDeNomina('draft', 0).recalcular;
    });
    intenta('el error de la regla es un 409', () => {
      const err = new e.NominaNoPermitidaError('x');
      return err instanceof Error && err.status === 409 && err.message === 'x';
    });
  }

  // ─── 2. La escala del ISR, con su fuente ─────────────────────────────────
  console.log('\n2. La escala del ISR de 2026 (DGII, CA687; Ley 11-92 art. 296)');
  const sinS = 'no existe services/nomina/escalaIsr.ts';
  const esc = S?.escalaDelAnio(2026) ?? null;
  intenta('la escala de 2026 esta, tramo a tramo, como la publica la DGII', () => {
    if (!esc) return false;
    const t = esc.tramos;
    return t.length === 4
      && t[0].desde === 0 && t[0].hasta === 416220 && t[0].fijo === 0 && t[0].porcentaje === 0
      && t[1].desde === 416220.01 && t[1].hasta === 624329 && t[1].fijo === 0 && t[1].porcentaje === 15
      && t[2].desde === 624329.01 && t[2].hasta === 867123 && t[2].fijo === 31216 && t[2].porcentaje === 20
      && t[3].desde === 867123.01 && t[3].hasta === null && t[3].fijo === 79776 && t[3].porcentaje === 25;
  }, () => (S ? '' : sinS));
  intenta('cita su fuente (DGII, Ley 11-92 art. 296) y no hay escala inventada para 2027', () => {
    if (!S || !esc) return false;
    const fich = leer('src/services/nomina/escalaIsr.ts');
    return /ayuda\.dgii\.gov\.do/.test(fich) && /11-92/.test(esc.fuente) && /296/.test(esc.fuente) && S.escalaDelAnio(2027) === null;
  });
  intenta('el año sale del texto de la fecha (el 01/01 no cae en el año anterior)', () => {
    if (!S) return false;
    return S.anioDeLaNomina('2027-01-01') === 2027 && S.anioDeLaNomina('2026-12-31') === 2026;
  });
  intenta('sin escala del año, el motivo lo dice con el año', () =>
    !!S && /^Falta la escala del ISR de 2027/.test(S.motivoSinEscala(2027)));
  intenta('plan de siembra: vacia inserta, igual no toca, distinta no pisa', () => {
    if (!S || !esc) return false;
    const comoTabla = S.filasDeLaEscala(esc);
    const otra = comoTabla.map((f, i) => (i === 2 ? { ...f, fixedAmount: '31216.35' } : f));
    return S.planDeSiembra([], esc) === 'insertar'
      && S.planDeSiembra(comoTabla, esc) === 'nada'
      && S.planDeSiembra(comoTabla.slice(0, 3), esc) === 'distinta'
      && S.planDeSiembra(otra, esc) === 'distinta'
      && comoTabla.every((f) => f.year === 2026) && comoTabla[1].fromAmount === '416220.01' && comoTabla[3].toAmount === null;
  });

  // ─── 3. El ISR por tramos ────────────────────────────────────────────────
  console.log('\n3. ISR por tramos: fronteras exactas (retencion MENSUAL = anual / 12)');
  const tramos = esc
    ? esc.tramos.map((t) => ({ fromAmount: t.desde, toAmount: t.hasta, fixedAmount: t.fijo, percentage: t.porcentaje }))
    : null;
  // Calculados a mano, con la regla de la DGII ("x % del excedente de ..."):
  const fronteras: [number, number, string][] = [
    [416220.0, 0, 'tope del exento'],
    [416220.01, 0, 'primer centavo del 15 %: excedente 0'],
    [500000, 1047.25, '(500.000 - 416.220,01) x 15 % = 12.566,9985 / 12'],
    [624329.0, 2601.36, '(624.329 - 416.220,01) x 15 % = 31.216,3485 / 12'],
    [624329.01, 2601.33, '31.216,00 + 0 / 12'],
    [867123.0, 6647.9, '31.216 + (867.123 - 624.329,01) x 20 % = 79.774,798 / 12'],
    [867123.01, 6648.0, '79.776,00 + 0 / 12'],
    [1000000, 9416.27, '79.776 + 132.876,99 x 25 % = 112.995,2475 / 12'],
  ];
  for (const [renta, esperado, como] of fronteras) {
    intenta(`renta anual ${renta.toFixed(2)} -> ISR mensual ${esperado.toFixed(2)} (${como})`, () =>
      !!tramos && P.calculateIsr(renta, tramos) === esperado, () => (tramos ? String(P.calculateIsr(renta, tramos)) : sinS));
  }
  intenta('el centavo ENTRE tramos (624.329,005) es del 15 %, no del 25 %', () =>
    !!tramos && P.calculateIsr(624329.005, tramos) === 2601.36, () => (tramos ? String(P.calculateIsr(624329.005, tramos)) : sinS));
  intenta('el centavo entre exento y 15 % (416.220,005) es exento', () =>
    !!tramos && P.calculateIsr(416220.005, tramos) === 0, () => (tramos ? String(P.calculateIsr(416220.005, tramos)) : sinS));
  intenta('escala VACIA: no da 0, lanza', () => {
    try { P.calculateIsr(1000000, []); return false; } catch (e) { return /Falta la escala del ISR/.test((e as Error).message); }
  });

  console.log('\n4. Ejemplos de nomina (base del ISR = bruto - AFP - SFS del empleado)');
  const config = {
    afpEmployee: 0.0287, sfsEmployee: 0.0304, afpEmployer: 0.071, sfsEmployer: 0.0709, infotepEmployer: 0.01,
    riskEmployer: 0.011, overtimeDiurnaRate: 1.35, overtimeNocturnaRate: 1.85, overtimeFestivaRate: 2, overtimeDobleRate: 2,
  };
  // [sueldo del PERIODO, frecuencia, AFP, SFS, ISR, neto] -- a mano. Salario minimo de los
  // topes 10.000 (contador, 2026-10-04): ninguno de estos llega al tope.
  const ejemplos: [number, 'mensual' | 'quincenal', number, number, number, number, string][] = [
    [10000, 'quincenal', 287, 304, 0, 9409, 'la nomina medida (Latin Doors, 15-30/07): 18.818 x 24 = 225.816 al año, exento'],
    [50000, 'mensual', 1435, 1520, 1854.0, 45191, '47.045 x 12 = 564.540: 15 %'],
    [70000, 'mensual', 2009, 2128, 5368.45, 60494.55, '65.863 x 12 = 790.356: 20 %'],
    [100000, 'mensual', 2870, 3040, 12105.44, 81984.56, '94.090 x 12 = 1.129.080: 25 %'],
    [50000, 'quincenal', 1435, 1520, 6052.72, 40992.28, 'quincena de 100.000 al mes: 12.105,44 / 2'],
    [34685, 'mensual', 995.46, 1054.42, 0, 32635.12, 'el "exento de 34.685 al mes" se mide DESPUES de la TSS'],
  ];
  for (const [sueldo, frec, afp, sfs, isr, neto, como] of ejemplos) {
    intenta(`${frec} ${sueldo.toFixed(2)}: AFP ${afp}, SFS ${sfs}, ISR ${isr.toFixed(2)}, neto ${neto} (${como})`, () => {
      if (!tramos) return false;
      const r = P.calculateDetails({ baseSalary: sueldo, frequency: frec, isrBrackets: tramos, config, salarioMinimoTss: 10000 });
      return r.afp === afp && r.sfs === sfs && r.isr === isr && r.netSalary === neto;
    }, () => {
      if (!tramos) return sinS;
      const r = P.calculateDetails({ baseSalary: sueldo, frequency: frec, isrBrackets: tramos, config, salarioMinimoTss: 10000 });
      return `afp ${r.afp} sfs ${r.sfs} isr ${r.isr} neto ${r.netSalary}`;
    });
  }

  // ─── 5. El cableado ──────────────────────────────────────────────────────
  console.log('\n5. Cableado: repositorio, ruta, pantalla, siembra');
  const repo = sinComentarios(leer('src/repositories/hrRepository.ts'));
  const importaRegla = /from '@\/services\/nomina\/estadoDeNomina'/.test(repo);
  const recalc = metodo(repo, 'private static async recalculatePayrollTx');
  const aprobar = metodo(repo, 'static async approvePayroll');
  const borrar = metodo(repo, 'static async deletePayroll');

  const iGuardaR = recalc.search(/const \w+ = motivoParaNoRecalcular\(payroll\.status\);\s*if \(\w+\) throw new NominaNoPermitidaError\(\w+\);/);
  const iBorraDetalle = recalc.indexOf('.delete(payrollDetails)');
  ok('recalcular: la guarda de estado va ANTES de borrar el detalle, y bloquea la fila',
    importaRegla && iGuardaR > 0 && iBorraDetalle > iGuardaR && /\.for\('update'\)/.test(recalc.slice(0, iGuardaR)),
    `guarda ${iGuardaR}, borrado ${iBorraDetalle}`);

  const iGuardaA = aprobar.search(/const \w+ = motivoParaNoAprobar\(payroll\.status, details\.length\);\s*if \(\w+\) throw new NominaNoPermitidaError\(\w+\);/);
  const iDetalle = aprobar.search(/const details = await tx\s*\.select\(\)\s*\.from\(payrollDetails\)/);
  const iAprueba = aprobar.indexOf("status: 'approved'");
  ok('aprobar: lee el detalle, decide con la regla y solo despues pone `approved`; bloquea la fila',
    importaRegla && iDetalle > 0 && iGuardaA > iDetalle && iAprueba > iGuardaA && /\.for\('update'\)/.test(aprobar.slice(0, iDetalle))
      && !/'draft'/.test(aprobar),
    `detalle ${iDetalle}, guarda ${iGuardaA}, aprobada ${iAprueba}`);

  ok('eliminar usa la misma regla (no una copia de los estados)',
    /motivoParaNoEliminar\(payroll\.status\)/.test(borrar) && !/'draft'/.test(borrar));

  // Re-anclado en la segunda parte del lote: el contador decidio usar la escala
  // del año o la MAS RECIENTE ANTERIOR (ya no "el año exacto"). Lo que esto
  // vigila sigue siendo lo mismo: el año sale del texto de la fecha y la escala
  // se elige con una regla, no con una consulta escrita a mano. La regla nueva
  // la vigila `verificar_nomina_decisiones_contador.ts`.
  ok('el año de la nomina sale del texto de la fecha y la escala la elige la regla pura (no `getFullYear`)',
    /const payrollYear = anioDeLaNomina\(end\);/.test(recalc) && /escalaParaLaNomina\(aniosCargados, payrollYear\)/.test(recalc)
      && /\.where\(eq\(isrBrackets\.year, anioDeEscala\)\)/.test(recalc) && !/getFullYear/.test(recalc));
  ok('sin escala: recalcular se niega con `motivoSinEscala` (409), antes de calcular nada',
    /if \(anioDeEscala === null\) throw new NominaNoPermitidaError\(motivoSinEscala\(payrollYear\)\);/.test(recalc)
      && /if \(brackets\.length === 0\) throw new NominaNoPermitidaError\(motivoSinEscala\(payrollYear\)\);/.test(recalc)
      && recalc.indexOf('motivoSinEscala(payrollYear)') < recalc.indexOf('PayrollCalculationService.calculateDetails('));

  const ruta = sinComentarios(leer('src/app/api/v1/hr/payroll/route.ts'));
  const manejo = ruta.slice(ruta.indexOf('function respuestaDeError'), ruta.indexOf('export async function GET'));
  ok('la ruta contesta el error de la regla con su estado (409), y lo usa en POST, PUT y DELETE',
    /from '@\/services\/nomina\/estadoDeNomina'/.test(ruta)
      && /if \(error instanceof NominaNoPermitidaError\)[\s\S]*?status: error\.status/.test(manejo)
      && (ruta.match(/return respuestaDeError\(error\);/g) ?? []).length >= 3);

  //  Lote 294: la pagina de nomina esta partida (hooks/ y components/); se lee la pantalla entera.
  const pagina = sinComentarios(leerPantallaDeNomina(raiz));
  ok('la pantalla ofrece recalcular y aprobar con la regla, no con `!== \'approved\'`',
    /from '@\/services\/nomina\/estadoDeNomina'/.test(pagina)
      && /accionesDeNomina\(selectedPayroll\.status, payrollDetailsList\.length\)\.recalcular && \(/.test(pagina)
      && /accionesDeNomina\(selectedPayroll\.status, payrollDetailsList\.length\)\.aprobar && \(/.test(pagina)
      && !/status !== 'approved'/.test(pagina)
      && !/pr\.status === 'draft' \|\| pr\.status === 'calculated'/.test(pagina));

  // "Nada estatico" (lote 171): ningun tramo escrito fuera de la constante.
  const conTramos = ['src/repositories/hrRepository.ts', 'src/services/payrollCalculationService.ts', 'src/db/run-migration.ts',
    'scratch/bancos_db/semilla_app.ts', 'src/app/api/v1/hr/payroll/route.ts']
    .filter((r) => /416[.,]?220|624[.,]?329|867[.,]?123|31[.,]?216|79[.,]?776/.test(sinComentarios(leer(r))));
  const mig = sinComentarios(leer('src/db/run-migration.ts'));
  const sem = sinComentarios(leer('scratch/bancos_db/semilla_app.ts'));
  ok('ningun tramo escrito a mano: run-migration y la semilla de los bancos toman la constante',
    conTramos.length === 0
      && /from '\.\.\/services\/nomina\/escalaIsr'/.test(mig) && nombra(mig, 'filasDeLaEscala')
      && /from '\.\.\/\.\.\/src\/services\/nomina\/escalaIsr'/.test(sem) && /insert\(isrBrackets\)\.values\(filasDeLaEscala\(escala\)\)/.test(sem),
    conTramos.join(', '));

  console.log(`\n${total - fallos} OK, ${fallos} FALLA de ${total}`);
  console.log(fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
