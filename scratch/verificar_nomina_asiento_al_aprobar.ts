/**
 * Lote 293 -- el asiento de devengo al APROBAR una nomina (el "lote C" de
 * `docs/diseno_asientos_nomina.md`). Banco de CODIGO: ejecuta la regla pura
 * (`services/nomina/asientoDeNomina.ts`), dibuja lo que enseña la pantalla y
 * mira el cableado. Lo que pasa contra una base (la transaccion, el 409, el
 * periodo cerrado, aprobar dos veces) lo ejecuta
 * `verificar_nomina_asiento_al_aprobar_db.ts`.
 *
 * QUE SE VIGILA
 * -------------
 *  1. La nomina medida en PRODUCCION (bruto 10.000, neto 9.409): el asiento del
 *     diseño, debe 11.629 = haber 11.629, sin lineas en cero.
 *  2. Varios empleados: se suma todo, y cuadra.
 *  3. Otras deducciones a su cuenta; dos claves en una cuenta, una linea.
 *  4. Redondeos: se suma en centavos (sin la deriva de la coma flotante), y un
 *     detalle que no cuadra se NIEGA nombrando al empleado -- nunca se ajusta.
 *  5. Cuentas sin enlazar: el motivo las nombra y dice donde enlazarlas.
 *  6. Descripcion, fecha (fin del periodo) y el motivo del periodo cerrado.
 *  7. Ningun codigo de cuenta escrito; las claves salen de la tabla.
 *  8. El cableado: el asiento va dentro de la transaccion de aprobar y antes de
 *     marcarla; la ruta y la pantalla lo enseñan.
 *  9. La pantalla, dibujada: el asiento y el motivo de un rechazo.
 *
 * Los modulos del lote se cargan con `import()` perezoso: en la contraprueba no
 * existen, y cada comprobacion da FALLA por etiqueta en vez de reventar.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** Un identificador entero, no un prefijo (seccion 3 del metodo). */
const nombra = (f: string, id: string) => new RegExp(`\\b${id}\\b`).test(f);

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
async function seccion(etiquetas: string[], f: () => Promise<void> | void) {
  try { await f(); } catch (e) { for (const t of etiquetas) ok(t, false, `lanzo: ${(e as Error).message}`); }
}

type Detalle = Record<string, string | number>;
const CUENTAS = {
  payroll_salaries_expense: 'c-sueldos',
  payroll_employer_tss_expense: 'c-patronal',
  payroll_infotep_expense: 'c-infotep-gasto',
  payroll_salaries_payable: 'c-sueldos-pagar',
  payroll_tss_payable: 'c-tss-pagar',
  payroll_isr_payable: 'c-isr-pagar',
  payroll_infotep_payable: 'c-infotep-pagar',
  payroll_other_deductions: 'c-otras',
};
const detalle = (o: Partial<Record<string, string | number>>): Detalle => ({
  grossSalary: '0.00', netSalary: '0.00', afp: '0.00', sfs: '0.00', isr: '0.00', otherDeductions: '0.00',
  afpEmployer: '0.00', sfsEmployer: '0.00', riskEmployer: '0.00', infotepEmployer: '0.00', ...o,
} as Detalle);
/** La nomina medida en PRODUCCION el 2026-10-04 (Latin Doors, 15-30/07). */
const MEDIDA = detalle({
  grossSalary: '10000.00', netSalary: '9409.00', afp: '287.00', sfs: '304.00',
  afpEmployer: '710.00', sfsEmployer: '709.00', riskEmployer: '110.00', infotepEmployer: '100.00',
});
type Linea = { clave: string; accountId: string; debit: number; credit: number };
const porCuenta = (ls: Linea[]) => Object.fromEntries(ls.map((l) => [l.accountId, l.debit > 0 ? `D${l.debit}` : `H${l.credit}`]));

async function main() {
  type Modulo = typeof import('../src/services/nomina/asientoDeNomina');
  let M: Modulo | null = null;
  try { M = await import('../src/services/nomina/asientoDeNomina'); } catch { M = null; }
  const m = () => { if (!M) throw new Error('no existe services/nomina/asientoDeNomina'); return M; };

  // ─── 1 ─────────────────────────────────────────────────────────────────
  console.log('\n1. La nomina medida (bruto 10.000, neto 9.409)');
  const E1 = [
    'las seis lineas del diseño: sueldos 10.000, patronales 1.529, Infotep 100 | por pagar 9.409, TSS 2.120, Infotep 100',
    'debe 11.629 = haber 11.629 (y el total lo dice)',
    'sin lineas en cero: ni ISR (0) ni otras deducciones (0)',
  ];
  await seccion(E1, () => {
    const r = m().asientoDeNomina([MEDIDA as never], CUENTAS);
    if (!r.ok) throw new Error(r.motivo);
    const esperado = {
      'c-sueldos': 'D10000', 'c-patronal': 'D1529', 'c-infotep-gasto': 'D100',
      'c-sueldos-pagar': 'H9409', 'c-tss-pagar': 'H2120', 'c-infotep-pagar': 'H100',
    };
    ok(E1[0], JSON.stringify(porCuenta(r.lineas)) === JSON.stringify(esperado), JSON.stringify(porCuenta(r.lineas)));
    const debe = r.lineas.reduce((s, l) => s + l.debit, 0);
    const haber = r.lineas.reduce((s, l) => s + l.credit, 0);
    ok(E1[1], debe === 11629 && haber === 11629 && r.total === 11629, `debe ${debe} haber ${haber} total ${r.total}`);
    ok(E1[2], r.lineas.length === 6 && r.lineas.every((l) => (l.debit > 0) !== (l.credit > 0)), `${r.lineas.length} lineas`);
  });

  // ─── 2 ─────────────────────────────────────────────────────────────────
  console.log('\n2. Varios empleados');
  const E2 = ['dos empleados (uno con ISR y otro con otras deducciones): cada cuenta con la suma, debe = haber = 139.548'];
  await seccion(E2, () => {
    const a = detalle({ grossSalary: '100000.00', afp: '2870.00', sfs: '3040.00', isr: '12105.44', netSalary: '81984.56', afpEmployer: '7100.00', sfsEmployer: '7090.00', riskEmployer: '1100.00', infotepEmployer: '1000.00' });
    const b = detalle({ grossSalary: '20000.00', afp: '574.00', sfs: '608.00', otherDeductions: '500.00', netSalary: '18318.00', afpEmployer: '1420.00', sfsEmployer: '1418.00', riskEmployer: '220.00', infotepEmployer: '200.00' });
    const r = m().asientoDeNomina([a, b] as never, CUENTAS);
    if (!r.ok) throw new Error(r.motivo);
    const esperado = {
      'c-sueldos': 'D120000', 'c-patronal': 'D18348', 'c-infotep-gasto': 'D1200',
      'c-sueldos-pagar': 'H100302.56', 'c-tss-pagar': 'H25440', 'c-isr-pagar': 'H12105.44', 'c-infotep-pagar': 'H1200', 'c-otras': 'H500',
    };
    const debe = r.lineas.reduce((s, l) => s + l.debit, 0);
    const haber = r.lineas.reduce((s, l) => s + l.credit, 0);
    ok(E2[0], JSON.stringify(porCuenta(r.lineas)) === JSON.stringify(esperado) && debe === 139548 && haber === 139548 && r.total === 139548,
      `${JSON.stringify(porCuenta(r.lineas))} debe ${debe} haber ${haber}`);
  });

  // ─── 3 ─────────────────────────────────────────────────────────────────
  console.log('\n3. Otras deducciones, y dos claves en una cuenta');
  const E3 = [
    'otras deducciones (750) al HABER de su cuenta (D5), y el neto baja en lo mismo',
    'si el contador apunta TSS e Infotep por pagar a UNA cuenta (D8), sale una linea con la suma',
  ];
  await seccion(E3, () => {
    const d = detalle({ ...MEDIDA, otherDeductions: '750.00', netSalary: '8659.00' });
    const r = m().asientoDeNomina([d as never], CUENTAS);
    if (!r.ok) throw new Error(r.motivo);
    const otras = r.lineas.find((l) => l.accountId === 'c-otras');
    const neto = r.lineas.find((l) => l.accountId === 'c-sueldos-pagar');
    ok(E3[0], otras?.credit === 750 && otras.debit === 0 && neto?.credit === 8659 && r.total === 11629, JSON.stringify(porCuenta(r.lineas)));

    const juntas = m().asientoDeNomina([MEDIDA as never], { ...CUENTAS, payroll_infotep_payable: 'c-tss-pagar' });
    if (!juntas.ok) throw new Error(juntas.motivo);
    const tss = juntas.lineas.filter((l) => l.accountId === 'c-tss-pagar');
    ok(E3[1], tss.length === 1 && tss[0].credit === 2220 && juntas.lineas.length === 5, JSON.stringify(porCuenta(juntas.lineas)));
  });

  // ─── 4 ─────────────────────────────────────────────────────────────────
  console.log('\n4. Redondeos');
  const E4 = [
    'importes con centavos: la suma sale exacta (1.000,10 + 1.000,20 = 2.000,30, no 2.000,3000000000002)',
    'un detalle cuyo neto no es bruto - deducciones por 0,01 se NIEGA, nombrando al empleado y la diferencia',
    '... y no se ajusta: no devuelve ninguna linea',
    'un importe negativo se niega',
  ];
  await seccion(E4, () => {
    const a = detalle({ grossSalary: '1000.10', netSalary: '1000.10' });
    const b = detalle({ grossSalary: '1000.20', netSalary: '1000.20', afpEmployer: '0.10', sfsEmployer: '0.20', riskEmployer: '0.03' });
    const r = m().asientoDeNomina([a, b] as never, CUENTAS);
    if (!r.ok) throw new Error(r.motivo);
    const sueldos = r.lineas.find((l) => l.accountId === 'c-sueldos');
    const patronal = r.lineas.find((l) => l.accountId === 'c-patronal');
    ok(E4[0], sueldos?.debit === 2000.3 && patronal?.debit === 0.33 && r.total === 2000.63,
      `sueldos ${sueldos?.debit} patronal ${patronal?.debit} total ${r.total}`);

    const mala = detalle({ ...MEDIDA, empleado: 'Ana Perez (A-01)', netSalary: '9408.99' });
    const r2 = m().asientoDeNomina([MEDIDA, mala] as never, CUENTAS);
    ok(E4[1], !r2.ok && /Ana Perez \(A-01\)/.test(r2.motivo) && /\+0\.01/.test(r2.motivo) && /Recalcule/.test(r2.motivo), r2.ok ? 'lo dio por bueno' : r2.motivo);
    ok(E4[2], !r2.ok && !('lineas' in r2), JSON.stringify(r2).slice(0, 120));

    const neg = detalle({ ...MEDIDA, empleado: 'Luis', afp: '-287.00', netSalary: '9983.00' });
    const r3 = m().asientoDeNomina([neg] as never, CUENTAS);
    ok(E4[3], !r3.ok && /negativos/.test(r3.motivo) && /Luis/.test(r3.motivo), r3.ok ? 'lo dio por bueno' : r3.motivo);
  });

  // ─── 5 ─────────────────────────────────────────────────────────────────
  console.log('\n5. Cuentas sin enlazar');
  const E5 = [
    'sin la cuenta del ISR (con ISR > 0): se niega nombrandola como la pantalla, y dice "Configuración > Cuentas Puente"',
    'con ISR 0, la cuenta del ISR no hace falta: el asiento sale igual',
    'faltan varias: las nombra todas',
  ];
  await seccion(E5, () => {
    const conIsr = detalle({ ...MEDIDA, isr: '100.00', netSalary: '9309.00' });
    const sinIsr = { ...CUENTAS } as Partial<typeof CUENTAS>;
    delete sinIsr.payroll_isr_payable;
    const r = m().asientoDeNomina([conIsr as never], sinIsr);
    ok(E5[0], !r.ok && /ISR Retenido a Asalariados \(IR-3\)/.test(r.motivo) && /Configuración > Cuentas Puente/.test(r.motivo), r.ok ? 'asento' : r.motivo);
    const r2 = m().asientoDeNomina([MEDIDA as never], sinIsr);
    ok(E5[1], r2.ok, r2.ok ? '' : r2.motivo);
    const r3 = m().asientoDeNomina([MEDIDA as never], {});
    ok(E5[2], !r3.ok && /Sueldos y Salarios/.test(r3.motivo) && /Sueldos por Pagar/.test(r3.motivo) && /Infotep por Pagar/.test(r3.motivo), r3.ok ? 'asento' : r3.motivo);
  });

  // ─── 6 ─────────────────────────────────────────────────────────────────
  console.log('\n6. Descripcion, fecha y periodo');
  const E6 = [
    'descripcion legible: "Nómina quincenal 01-15/10/2026"',
    'un periodo que cruza de mes lleva las dos fechas',
    'la fecha del asiento es el FIN del periodo (D10)',
    'el motivo del periodo cerrado dice la fecha (30-07-2026), que la asienta el contador y donde se abre un periodo',
  ];
  await seccion(E6, () => {
    ok(E6[0], m().descripcionDelAsiento('2026-10-01', '2026-10-15', 'quincenal') === 'Nómina quincenal 01-15/10/2026', m().descripcionDelAsiento('2026-10-01', '2026-10-15', 'quincenal'));
    ok(E6[1], m().descripcionDelAsiento('2026-07-16', '2026-08-15', 'mensual') === 'Nómina mensual 16/07/2026-15/08/2026', m().descripcionDelAsiento('2026-07-16', '2026-08-15', 'mensual'));
    ok(E6[2], m().fechaDelAsiento('2026-07-30') === '2026-07-30', m().fechaDelAsiento('2026-07-30'));
    const mot = m().motivoPeriodoNoAbierto('2026-07-30');
    ok(E6[3], /30-07-2026/.test(mot) && /contador/.test(mot) && /Contabilidad > Períodos/.test(mot), mot);
  });

  // ─── 7 ─────────────────────────────────────────────────────────────────
  console.log('\n7. Nada de contabilidad escrito en el codigo');
  const regla = sinComentarios(leer('src/services/nomina/asientoDeNomina.ts'));
  const db = sinComentarios(leer('src/services/nomina/asentarNomina.ts'));
  const E7 = [
    'las claves del asiento son las ocho de la categoria nomina de CUENTAS_DEL_SISTEMA',
    'ningun codigo de cuenta escrito en la regla ni en el acceso a la base',
  ];
  await seccion(E7, () => {
    ok(E7[0], JSON.stringify([...m().CLAVES_DE_NOMINA].sort()) === JSON.stringify(Object.keys(CUENTAS).sort()), JSON.stringify(m().CLAVES_DE_NOMINA));
    const codigos = [...(regla + db).matchAll(/['"`]\d\.\d(\.\d{2}){0,2}['"`]/g)].map((x) => x[0]);
    ok(E7[1], regla !== '' && db !== '' && codigos.length === 0, codigos.join(', ') || (regla && db ? '' : 'faltan los modulos'));
  });

  // ─── 8 ─────────────────────────────────────────────────────────────────
  console.log('\n8. El cableado');
  const repo = leer('src/repositories/hrRepository.ts');
  const ruta = leer('src/app/api/v1/hr/payroll/route.ts');
  const pagina = leer('src/app/dashboard/hr/payroll/page.tsx');
  const contab = leer('src/app/dashboard/accounting/page.tsx');
  const aprobar = (() => {
    const i = repo.indexOf('static async approvePayroll(');
    const j = repo.indexOf('static async deletePayroll(');
    if (i < 0 || j < i) throw new Error('precondicion: approvePayroll y deletePayroll existen en hrRepository');
    return sinComentarios(repo.slice(i, j));
  })();
  const E8 = [
    'approvePayroll importa asentarDevengoDeNomina y lo llama con la `tx` de su transaccion',
    '... ANTES de marcar la nomina como aprobada',
    'asentarNomina registra por createJournalEntry(tx, ...) con la referencia y la fecha de la nomina',
    'asentarNomina mira el periodo (isPeriodOpen con la tx) antes de asentar, y no asienta dos veces (busca por referencia)',
    'la ruta: aprobar devuelve el asiento y el detalle lo enseña',
    'la pantalla enseña el asiento y el motivo de un rechazo; Contabilidad abre el Libro Diario con ?tab=journals',
  ];
  await seccion(E8, () => {
    const llamada = /await asentarDevengoDeNomina\(\s*tx\s*,/.test(aprobar);
    const dentro = /return db\.transaction\(async \(tx\) =>[\s\S]*asentarDevengoDeNomina\(/.test(aprobar);
    ok(E8[0], /import \{[^}]*\basentarDevengoDeNomina\b[^}]*\} from '@\/services\/nomina\/asentarNomina'/.test(repo) && llamada && dentro);
    const iA = aprobar.search(/asentarDevengoDeNomina\(/);
    const iM = aprobar.search(/\.set\(\{\s*status:\s*'approved'/);
    ok(E8[1], iA > 0 && iM > 0 && iA < iM, `asiento en ${iA}, aprobada en ${iM}`);
    ok(E8[2], /AccountingRepository\.createJournalEntry\(\s*tx\s*,\s*\{[\s\S]*reference:\s*nomina\.id[\s\S]*date:\s*fecha/.test(db));
    const iP = db.search(/AccountingRepository\.isPeriodOpen\(companyId,\s*fecha,\s*modo,\s*tx\)/);
    const iC = db.search(/AccountingRepository\.createJournalEntry\(/);
    const dup = /eq\(journalEntries\.reference,\s*nomina\.id\)[\s\S]*if \(previo\) return/.test(db);
    ok(E8[3], iP > 0 && iC > iP && dup, `periodo ${iP}, asiento ${iC}, duplicado ${dup}`);
    ok(E8[4], /const \{ asiento \} = await HRRepository\.approvePayroll\(/.test(ruta) && /data: \{ asiento \}/.test(ruta)
      && /import \{ asientoDeLaNomina \} from '@\/services\/nomina\/asentarNomina'/.test(ruta) && /data: \{ payroll, details, avisoIsr, asiento \}/.test(ruta));
    ok(E8[5], /<AsientoDeLaNomina\b[^>]*asiento=\{asiento\}[^>]*motivoRechazo=\{motivoRechazo\}/.test(pagina)
      && /setMotivoRechazo\(data\.error\?\.message/.test(pagina) && nombra(pagina, 'setAsiento')
      && /tab === 'journals'\) setActiveTab\('journals'\)/.test(contab));
  });

  // ─── 9 ─────────────────────────────────────────────────────────────────
  console.log('\n9. La pantalla, dibujada');
  const E9 = [
    'el asiento: fecha, cada cuenta con su debe y su haber, el total y el enlace al Libro Diario',
    'el motivo de un rechazo, a la vista como alerta',
    'una aprobada sin asiento lo dice (no inventa uno); una calculada sin asiento no enseña nada',
  ];
  await seccion(E9, async () => {
    const comp = await import('../src/app/dashboard/hr/payroll/components/AsientoDeLaNomina');
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const pinta = (p: object) => renderToStaticMarkup(React.createElement(comp.AsientoDeLaNomina as never, p));
    const asiento = {
      id: 'x', fecha: '2026-10-15', descripcion: 'Nómina quincenal 01-15/10/2026', total: 11629,
      lineas: [
        { codigo: '6.1.01.01', cuenta: 'Sueldos y Salarios', debe: 10000, haber: 0 },
        { codigo: '2.1.01.04', cuenta: 'Sueldos por Pagar', debe: 0, haber: 9409 },
      ],
    };
    const html = pinta({ status: 'approved', asiento, motivoRechazo: null });
    ok(E9[0], /15-10-2026/.test(html) && /6\.1\.01\.01<\/span> Sueldos y Salarios/.test(html) && /10,000\.00|10\.000,00|10000\.00/.test(html)
      && /9,409\.00|9\.409,00/.test(html) && /11,629\.00|11\.629,00/.test(html) && /href="\/dashboard\/accounting\?tab=journals"/.test(html), html.slice(0, 200));
    const rech = pinta({ status: 'calculated', asiento: null, motivoRechazo: 'No se puede aprobar la nómina: ... (30-07-2026) ...' });
    ok(E9[1], /role="alert"/.test(rech) && /30-07-2026/.test(rech), rech);
    const sin = pinta({ status: 'approved', asiento: null, motivoRechazo: null });
    const calc = pinta({ status: 'calculated', asiento: null, motivoRechazo: null });
    ok(E9[2], /sin registrar asiento/.test(sin) && calc === '', `${sin} | ${calc}`);
  });

  console.log(`\n${total - fallos} OK, ${fallos} FALLA de ${total}`);
  console.log(fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
