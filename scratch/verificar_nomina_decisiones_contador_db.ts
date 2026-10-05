/**
 * Lote 290, segunda parte, contra una base -- las decisiones del contador
 * (2026-10-04). Integracion: base DESECHABLE, con candado (`precarga.mts`). La
 * base trae la migracion 0020 (el lanzador aplica todo `drizzle/`), la escala
 * de 2026 y el salario minimo sembrado (`semilla_app.ts`).
 *
 *  · la siembra (semilla y alta de empresa) pone 10.000 en la empresa;
 *  · el calculo usa el salario minimo de la EMPRESA: con 12.000, el SFS de un
 *    sueldo de 150.000 topa en 120.000;
 *  · Configuracion de RRHH lo enseña y lo guarda;
 *  · sin la columna (migracion sin aplicar): el calculo usa 10.000, guardar otro
 *    valor da 409 nombrando la 0020 y no escribe nada;
 *  · una nomina de 2027, con solo la escala de 2026, SE CALCULA con la de 2026 y
 *    la respuesta y el detalle avisan de que año se uso.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-290b-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-290b-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-290b';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { HRRepository } from '../src/repositories/hrRepository';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const EMP_150K = '29000000-0000-4000-8000-0000000000f1';

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
const fin = () => {
  console.log(`\n${total - fallos} OK, ${fallos} FALLA de ${total}`);
  console.log(fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`);
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
};
const cabeceras = () => ({
  'x-user-id': USER, 'x-company-id': A, 'x-user-role': 'sistemas', 'x-role-id': ROL,
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string, 'content-type': 'application/json',
});
type Handler = (r: NextRequest) => Promise<Response>;
type Cuerpo = { success?: boolean; aviso?: string | null; data?: Record<string, unknown> & { id?: string; avisoIsr?: string | null }; error?: { message?: string } };

async function seccion(etiquetas: string[], f: () => Promise<void>) {
  try { await f(); } catch (e) { for (const t of etiquetas) ok(t, false, `lanzo: ${(e as Error).message}`); }
}
const hayColumna = async () => (await todas(sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_configs' AND column_name = 'salario_minimo_tss'`)).length > 0;
const valorGuardado = async (empresa = A) => (await hayColumna())
  ? (await todas(sql`SELECT salario_minimo_tss::text AS v FROM payroll_configs WHERE company_id = ${empresa}::uuid`))[0]?.v ?? null
  : 'SIN COLUMNA';

async function main() {
  const nomina = (await import('../src/app/api/v1/hr/payroll/route')) as unknown as Record<string, Handler>;
  const ajustes = (await import('../src/app/api/v1/hr/config/route')) as unknown as Record<string, Handler>;
  let olvidar: () => void = () => {};
  try { olvidar = (await import('../src/services/nomina/salarioMinimoRepositorio')).olvidarColumnaSalarioMinimo; } catch { /* contraprueba */ }

  const llamar = async (h: Handler, metodo: string, url: string, cuerpo?: unknown) => {
    const res = await h(new NextRequest(`http://localhost${url}`, { method: metodo, headers: cabeceras(), body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }));
    return { estado: res.status, cuerpo: (await res.json()) as Cuerpo };
  };
  const sfsDe = async (payrollId: string) =>
    (await todas(sql`SELECT sfs::text AS sfs, afp::text AS afp FROM payroll_details WHERE payroll_id = ${payrollId}::uuid AND employee_id = ${EMP_150K}::uuid`))[0];
  const tasas = {
    afpEmployee: 0.0287, sfsEmployee: 0.0304, afpEmployer: 0.071, sfsEmployer: 0.0709, infotepEmployer: 0.01, riskEmployer: 0.011,
    overtimeDiurnaRate: 1.35, overtimeNocturnaRate: 1.85, overtimeFestivaRate: 2, overtimeDobleRate: 2,
  };

  await db.execute(sql`
    INSERT INTO employees (id, company_id, employee_code, first_name, last_name, cedula, birth_date, contract_type, payment_frequency, salary, hire_date)
    VALUES (${EMP_150K}::uuid, ${A}::uuid, 'A-290-F', 'Ciento', 'Cincuenta', '29000000011', '1980-01-01', 'indefinido', 'mensual', 150000, '2020-01-01')
    ON CONFLICT (id) DO NOTHING`);

  // ─── 1. La siembra y el calculo con el de la empresa ─────────────────────
  console.log('\n1. Salario minimo de la empresa (sembrado 10.000)');
  const E1 = [
    'la semilla (como el alta de empresa) deja 10.000 en la empresa',
    'dar de alta una empresa nueva siembra 10.000',
    'con 10.000: el SFS de 150.000 topa en 100.000 (3.040) y el AFP no topa (4.305)',
    'Configuracion de RRHH lo enseña (10.000, guardado) y guarda 12.000',
    'con 12.000: el SFS de 150.000 topa en 120.000 (3.648)',
  ];
  await seccion(E1, async () => {
    ok(E1[0], (await valorGuardado()) === '10000.00', String(await valorGuardado()));

    const { crearEmpresaConSuSiembra } = await import('../src/services/empresas/altaDeEmpresa');
    const nueva = await db.transaction(async (tx) => crearEmpresaConSuSiembra(tx, { name: 'Gamma 290 SRL', rnc: '129000290' }));
    const idNueva = (nueva as unknown as { empresa?: { id: string }; id?: string }).empresa?.id ?? (nueva as unknown as { id: string }).id;
    ok(E1[1], (await valorGuardado(idNueva)) === '10000.00', `${idNueva}: ${await valorGuardado(idNueva)}`);

    const n1 = await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: '2026-05-01', periodEnd: '2026-05-31', paymentDate: '2026-05-31', frequency: 'mensual', createdBy: USER });
    const d1 = await sfsDe(n1.id);
    ok(E1[2], d1?.sfs === '3040.00' && d1?.afp === '4305.00', JSON.stringify(d1));

    const g = await llamar(ajustes.GET, 'GET', '/api/v1/hr/config');
    const sm = g.cuerpo.data?.salarioMinimoTss as { valor?: number; guardado?: boolean; hayColumna?: boolean } | undefined;
    const p = await llamar(ajustes.PUT, 'PUT', '/api/v1/hr/config', { ...tasas, salarioMinimoTss: 12000 });
    ok(E1[3], sm?.valor === 10000 && sm?.guardado === true && sm?.hayColumna === true && p.estado === 200 && (await valorGuardado()) === '12000.00',
      `GET ${JSON.stringify(sm)}; PUT ${p.estado} ${p.cuerpo.error?.message ?? ''}; guardado ${await valorGuardado()}`);

    const r = await llamar(nomina.PUT, 'PUT', `/api/v1/hr/payroll?id=${n1.id}`, { action: 'recalculate' });
    const d2 = await sfsDe(n1.id);
    ok(E1[4], r.estado === 200 && d2?.sfs === '3648.00' && d2?.afp === '4305.00', `${r.estado} ${JSON.stringify(d2)}`);
  });

  // ─── 2. Sin la columna (migracion 0020 sin aplicar) ──────────────────────
  console.log('\n2. Sin la migracion 0020');
  const E2 = [
    'sin columna: el calculo usa 10.000 (SFS 3.040) y no falla',
    'sin columna: guardar 12.000 da 409 nombrando la 0020 y no cambia ninguna tasa',
    'sin columna: guardar con 10.000 (el que ya se usa) funciona',
  ];
  await seccion(E2, async () => {
    if (!(await hayColumna())) throw new Error('precondicion: la base no trae la columna (¿falta la 0020 en drizzle/?)');
    await db.execute(sql`ALTER TABLE payroll_configs DROP COLUMN salario_minimo_tss`);
    olvidar();
    try {
      const n = await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: '2026-04-01', periodEnd: '2026-04-30', paymentDate: '2026-04-30', frequency: 'mensual', createdBy: USER });
      const d = await sfsDe(n.id);
      ok(E2[0], d?.sfs === '3040.00', JSON.stringify(d));

      const antes = (await todas(sql`SELECT risk_employer::text AS r FROM payroll_configs WHERE company_id = ${A}::uuid`))[0]?.r;
      const p = await llamar(ajustes.PUT, 'PUT', '/api/v1/hr/config', { ...tasas, riskEmployer: 0.02, salarioMinimoTss: 12000 });
      const despues = (await todas(sql`SELECT risk_employer::text AS r FROM payroll_configs WHERE company_id = ${A}::uuid`))[0]?.r;
      ok(E2[1], p.estado === 409 && /0020_salario_minimo_tss/.test(p.cuerpo.error?.message ?? '') && antes === despues,
        `${p.estado} ${p.cuerpo.error?.message ?? ''}; riesgo ${antes} -> ${despues}`);

      const p2 = await llamar(ajustes.PUT, 'PUT', '/api/v1/hr/config', { ...tasas, salarioMinimoTss: 10000 });
      ok(E2[2], p2.estado === 200, `${p2.estado} ${p2.cuerpo.error?.message ?? ''}`);
    } finally {
      await db.execute(sql`ALTER TABLE payroll_configs ADD COLUMN IF NOT EXISTS salario_minimo_tss numeric(18, 2)`);
      olvidar();
    }
  });

  // ─── 3. Nomina de 2027 con la escala de 2026 ─────────────────────────────
  console.log('\n3. Escala de otro año: se calcula con la mas reciente anterior, avisando');
  const E3 = [
    'una nomina de enero de 2027 SE CALCULA con la escala de 2026 y la respuesta del calculo lo avisa',
    '... con el ISR de la escala de 2026',
    'el detalle de la nomina repite el aviso; una de 2026 no lleva ninguno',
  ];
  await seccion(E3, async () => {
    const c = await llamar(nomina.POST, 'POST', '/api/v1/hr/payroll', { periodStart: '2027-01-01', periodEnd: '2027-01-31', paymentDate: '2027-01-31', frequency: 'mensual' });
    let id = c.cuerpo.data?.id as string | undefined;
    let aviso = c.cuerpo.aviso ?? null;
    if (c.estado === 403) {
      // Sin plan activo en la semilla, la ruta de alta se niega antes de calcular:
      // se crea por el repositorio (lo mismo que llama la ruta) y se recalcula por la ruta.
      const n = await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: '2027-01-01', periodEnd: '2027-01-31', paymentDate: '2027-01-31', frequency: 'mensual', createdBy: USER });
      id = n.id;
      const r = await llamar(nomina.PUT, 'PUT', `/api/v1/hr/payroll?id=${id}`, { action: 'recalculate' });
      aviso = r.estado === 200 ? (r.cuerpo.aviso ?? null) : `(${r.estado}) ${r.cuerpo.error?.message}`;
    }
    ok(E3[0], !!id && /ISR calculado con la escala de 2026: la de 2027 no está cargada/.test(aviso ?? ''), `${c.estado} ${aviso ?? c.cuerpo.error?.message ?? ''}`);

    const ana = (await todas(sql`SELECT isr::text AS isr FROM payroll_details WHERE payroll_id = ${id ?? null}::uuid AND employee_id = 'eeee0000-0000-0000-0000-00000000000a'::uuid`))[0];
    ok(E3[1], ana?.isr === '1854.00', JSON.stringify(ana)); // Ana 50.000: 1.854,00 con la de 2026

    const g = await llamar(nomina.GET, 'GET', `/api/v1/hr/payroll?id=${id}`);
    const de2026 = (await todas(sql`SELECT id::text FROM payrolls WHERE company_id = ${A}::uuid AND period_end = '2026-05-31' AND deleted_at IS NULL LIMIT 1`))[0]?.id as string;
    const g26 = await llamar(nomina.GET, 'GET', `/api/v1/hr/payroll?id=${de2026}`);
    ok(E3[2], /escala de 2026/.test(String(g.cuerpo.data?.avisoIsr ?? '')) && g26.estado === 200 && (g26.cuerpo.data?.avisoIsr ?? null) === null,
      `${g.estado} ${g.cuerpo.data?.avisoIsr}; 2026: ${g26.cuerpo.data?.avisoIsr}`);
  });

  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
