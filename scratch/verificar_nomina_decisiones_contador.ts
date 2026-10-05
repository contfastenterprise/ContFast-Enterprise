/**
 * Lote 290, segunda parte -- las respuestas del contador (via el dueño,
 * 2026-10-04) a las preguntas de la primera parte. Banco de CODIGO; lo que pasa
 * contra una base esta en `verificar_nomina_decisiones_contador_db.ts`.
 *
 *  1. La base de la TSS excluye horas extra y bonos: confirmado, sin cambio de
 *     codigo; lo dice el comentario del calculo.
 *  2. El salario minimo de los topes es 10.000 y es de la EMPRESA
 *     (`payroll_configs.salario_minimo_tss`, migracion 0020, fuera de Drizzle):
 *     el calculo lo recibe y no lleva ninguno escrito; se siembra al crear la
 *     empresa; sin columna o sin valor, 10.000.
 *  3. El Infotep del 0,5 % del empleado NO se calcula: confirmado; comentario.
 *  4. "Por ahora seguiremos con la escala de 2026": la escala es la del año de
 *     la nomina o, si no esta, la MAS RECIENTE ANTERIOR, avisando; solo se niega
 *     si no hay ninguna del año o anterior. Cambia la regla del "año exacto" de
 *     la primera parte.
 *
 * Contraprueba contra `382b02e` (la primera parte ya fusionada con main).
 * Modulos nuevos con `import()` perezoso.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => {
  total++;
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const intenta = (t: string, f: () => boolean, d?: () => string) => {
  try { ok(t, f(), d ? d() : ''); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
};
const raiz = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(raiz, r)) ? readFileSync(join(raiz, r), 'utf8') : '');
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

type Topes = typeof import('../src/services/nomina/topesTss');
type Escala = typeof import('../src/services/nomina/escalaIsr');

async function main() {
  let T: Topes | null = null;
  try { T = await import('../src/services/nomina/topesTss'); } catch { T = null; }
  const S: Escala = await import('../src/services/nomina/escalaIsr');
  const { PayrollCalculationService: P } = await import('../src/services/payrollCalculationService');
  const esc = S.escalaDelAnio(2026)!;
  const tramos = esc.tramos.map((t) => ({ fromAmount: t.desde, toAmount: t.hasta, fixedAmount: t.fijo, percentage: t.porcentaje }));
  const config = {
    afpEmployee: 0.0287, sfsEmployee: 0.0304, afpEmployer: 0.071, sfsEmployer: 0.0709, infotepEmployer: 0.01,
    riskEmployer: 0.011, overtimeDiurnaRate: 1.35, overtimeNocturnaRate: 1.85, overtimeFestivaRate: 2, overtimeDobleRate: 2,
  };
  // `calculateDetails` con un parametro que en la contraprueba no existe: se pasa sin tipos.
  const calcular = (p: Record<string, unknown>) =>
    (P.calculateDetails as unknown as (x: Record<string, unknown>) => ReturnType<typeof P.calculateDetails>)({ isrBrackets: tramos, config, ...p });

  // ─── 1. El salario minimo de los topes ───────────────────────────────────
  console.log('\n1. Salario minimo de los topes de la TSS (contador: 10.000, de la empresa)');
  intenta('el de por defecto es 10.000 (decision del contador) y un valor raro cae en el de por defecto', () =>
    !!T && T.SALARIO_MINIMO_TSS_POR_DEFECTO === 10000
      && T.salarioMinimoEfectivo(null) === 10000 && T.salarioMinimoEfectivo('') === 10000 && T.salarioMinimoEfectivo('abc') === 10000
      && T.salarioMinimoEfectivo('0') === 10000 && T.salarioMinimoEfectivo(-5) === 10000
      && T.salarioMinimoEfectivo('12500.00') === 12500 && T.salarioMinimoValido(12500.555) === 12500.56,
  () => (T ? '' : 'no existe services/nomina/topesTss.ts'));
  intenta('el calculo usa el salario minimo que recibe: 150.000 con 10.000 -> SFS 3.040 (tope 100.000); con 16.262,50 -> 4.560', () => {
    const a = calcular({ baseSalary: 150000, salarioMinimoTss: 10000 });
    const b = calcular({ baseSalary: 150000, salarioMinimoTss: 16262.5 });
    // a mano: AFP 150.000 x 2,87 % = 4.305 (tope 200.000); SFS 100.000 x 3,04 % = 3.040;
    // renta (150.000 - 4.305 - 3.040) x 12 = 1.711.860 -> 79.776 + 844.736,99 x 25 % = 290.960,2475 / 12 = 24.246,69
    return a.afp === 4305 && a.sfs === 3040 && a.isr === 24246.69 && a.netSalary === 118408.31 && b.sfs === 4560;
  }, () => { const a = calcular({ baseSalary: 150000, salarioMinimoTss: 10000 }); return `afp ${a.afp} sfs ${a.sfs} isr ${a.isr} neto ${a.netSalary}`; });
  intenta('el tope del riesgo laboral (4 salarios minimos) y en quincena: 25.000 la quincena con 10.000 -> SRL sobre 20.000', () => {
    const r = calcular({ baseSalary: 25000, frequency: 'quincenal', salarioMinimoTss: 10000 });
    return r.riskEmployer === 220; // 4 x 10.000 / 2 = 20.000 x 1,10 %
  });
  intenta('sin salario minimo el calculo NO usa uno escrito: lanza', () => {
    try { calcular({ baseSalary: 150000 }); return false; } catch (e) { return /salario mínimo/.test((e as Error).message); }
  });

  // ─── 2. La escala: del año o la mas reciente anterior, avisando ──────────
  console.log('\n2. Escala del ISR: la del año o la mas reciente anterior (contador: "seguiremos con la de 2026")');
  const S2 = S as Partial<Escala>;
  const sinRegla = 'no existe escalaParaLaNomina';
  intenta('del año si esta; si no, la mas reciente ANTERIOR; nunca una posterior; sin ninguna, null', () => {
    const f = S2.escalaParaLaNomina!;
    return f([2026], 2026) === 2026 && f([2026], 2027) === 2026 && f([2025, 2026, 2028], 2027) === 2026
      && f([2026], 2025) === null && f([], 2026) === null && f([2024, 2026], 2026) === 2026;
  }, () => (S2.escalaParaLaNomina ? '' : sinRegla));
  intenta('el aviso dice que año se uso y cual falta; con la del año, ninguno', () => {
    const a = S2.avisoDeEscala!;
    const t = a(2026, 2027) ?? '';
    return /escala de 2026/.test(t) && /2027 no está cargada/.test(t) && a(2026, 2026) === null;
  }, () => (S2.avisoDeEscala ? String(S2.avisoDeEscala(2026, 2027)) : sinRegla));

  // ─── 3. Cableado ─────────────────────────────────────────────────────────
  console.log('\n3. Cableado');
  const repo = sinComentarios(leer('src/repositories/hrRepository.ts'));
  ok('repositorio: la escala sale de la regla (del año o anterior), se niega solo sin ninguna, y devuelve el aviso',
    /const anioDeEscala = escalaParaLaNomina\(aniosCargados, payrollYear\);/.test(repo)
      && /if \(anioDeEscala === null\) throw new NominaNoPermitidaError\(motivoSinEscala\(payrollYear\)\);/.test(repo)
      && /const avisoIsr = avisoDeEscala\(anioDeEscala, payrollYear\);/.test(repo)
      && /\.where\(eq\(isrBrackets\.year, anioDeEscala\)\)/.test(repo)
      && /return \{ avisoIsr \};/.test(repo)
      && /\.where\(sql`\$\{isrBrackets\.year\} <= \$\{hasta\}`\)/.test(repo));
  ok('repositorio: el salario minimo de la empresa llega al calculo',
    /const salarioMinimo = await leerSalarioMinimo\(companyId, tx\);/.test(repo) && /salarioMinimoTss: salarioMinimo\.valor,/.test(repo)
      && /from '@\/services\/nomina\/salarioMinimoRepositorio'/.test(repo));

  const calc = leer('src/services/payrollCalculationService.ts');
  const calcSin = sinComentarios(calc);
  ok('el calculo no lleva ningun salario minimo escrito y los topes usan el que recibe',
    !/16[.,]?262/.test(calcSin) && !/SALARIO_MINIMO_TSS\b/.test(calcSin)
      && /const salarioMinimo = Number\(params\.salarioMinimoTss\);/.test(calcSin)
      && /\(20 \* salarioMinimo\)/.test(calcSin) && /\(10 \* salarioMinimo\)/.test(calcSin) && /\(4 \* salarioMinimo\)/.test(calcSin));
  ok('los comentarios dicen las decisiones del contador: base de la TSS sin horas extra ni bonos, y sin Infotep del 0,5 % del empleado',
    /DECISION DEL CONTADOR[\s\S]{0,200}horas extra y los bonos NO cotizan[\s\S]{0,120}const cotizableSalary/.test(calc)
      && /DECISION DEL CONTADOR[\s\S]{0,120}Infotep del 0,5 % del\s*\/\/\s*EMPLEADO[\s\S]{0,80}NO se calcula[\s\S]{0,120}const infotepEmployer/.test(calc));

  const repoSm = sinComentarios(leer('src/services/nomina/salarioMinimoRepositorio.ts'));
  const esquema = leer('src/db/schema/hr.ts');
  const mig = leer('drizzle/0020_salario_minimo_tss.sql');
  ok('la columna: migracion 0020 que solo añade, NO declarada en Drizzle, y se mira si existe antes de nombrarla',
    /ALTER TABLE "payroll_configs" ADD COLUMN IF NOT EXISTS "salario_minimo_tss" numeric\(18, 2\)/.test(mig)
      && !/salario_minimo_tss|salarioMinimo/.test(esquema)
      && /information_schema\.columns[\s\S]*?column_name = 'salario_minimo_tss'/.test(repoSm)
      && /if \(!\(await haySalarioMinimo\(tx\)\)\) return \{ valor: SALARIO_MINIMO_TSS_POR_DEFECTO, guardado: false, hayColumna: false \};/.test(repoSm)
      && /if \(!\(await haySalarioMinimo\(tx\)\)\) throw new NominaNoPermitidaError\(MOTIVO_SIN_COLUMNA_SALARIO_MINIMO\);/.test(repoSm));

  const alta = sinComentarios(leer('src/services/empresas/altaDeEmpresa.ts'));
  const sem = sinComentarios(leer('scratch/bancos_db/semilla_app.ts'));
  const iInsert = alta.indexOf('await tx.insert(payrollConfigs)');
  const iSiembra = alta.indexOf('await sembrarSalarioMinimo(empresa.id, tx);');
  ok('la siembra: al dar de alta la empresa (y en la semilla de los bancos), despues de su configuracion de nomina',
    iInsert > 0 && iSiembra > iInsert && /sembrarSalarioMinimo\(empresa, tx\)/.test(sem));

  const rutaN = sinComentarios(leer('src/app/api/v1/hr/payroll/route.ts'));
  const pagN = sinComentarios(leer('src/app/dashboard/hr/payroll/page.tsx'));
  ok('la respuesta del calculo y la pantalla avisan del año de la escala, sin negarse',
    /aviso: payroll\.avisoIsr/.test(rutaN) && /aviso: avisoIsr/.test(rutaN) && /data: \{ payroll, details, avisoIsr\b[^}]*\}/.test(rutaN) /* lote 293: el objeto gana `asiento`; lo vigilado es que lleve avisoIsr */
      && (pagN.match(/if \(data\.aviso\) toast\.warning\(data\.aviso/g) ?? []).length === 2
      && /setAvisoIsr\(data\.data\.avisoIsr \?\? null\)/.test(pagN) && /\{avisoIsr && \(/.test(pagN)
      && /if \(data\.data\.payroll\) setSelectedPayroll\(data\.data\.payroll\);/.test(pagN));

  const rutaC = sinComentarios(leer('src/app/api/v1/hr/config/route.ts'));
  const pagC = sinComentarios(leer('src/app/dashboard/hr/config/page.tsx'));
  const iNiega = rutaC.indexOf('MOTIVO_SIN_COLUMNA_SALARIO_MINIMO }');
  const iEscribe = rutaC.indexOf('await HRRepository.updatePayrollConfig(');
  ok('Configuracion de RRHH enseña y cambia el salario minimo; sin la 0020 lo dice ANTES de escribir nada',
    /const salarioMinimoTss = await leerSalarioMinimo\(session\.companyId\);/.test(rutaC)
      && iNiega > 0 && iEscribe > iNiega
      // La condicion, no solo el mensaje (un mutante `if (false)` sobrevivia):
      && /if \(!actual\.hayColumna && salarioMinimoTss !== actual\.valor\) \{\s*return NextResponse\.json\(\{[\s\S]{0,120}MOTIVO_SIN_COLUMNA_SALARIO_MINIMO \} \}, \{ status: 409 \}\);/.test(rutaC)
      && /await guardarSalarioMinimo\(session\.companyId, salarioMinimoTss\);/.test(rutaC)
      && /Object\.entries\(tasas\)/.test(rutaC)
      && /<label htmlFor="salario-minimo-tss"/.test(pagC) && /id="salario-minimo-tss"/.test(pagC)
      && /salarioMinimoTss: config\.salarioMinimoTss,/.test(pagC) && /salarioMinimoTss: SALARIO_MINIMO_TSS_POR_DEFECTO,\s*\};/.test(pagC));

  console.log(`\n${total - fallos} OK, ${fallos} FALLA de ${total}`);
  console.log(fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
