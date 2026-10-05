/**
 * Lote 293, contra una base -- aprobar una nomina registra su asiento de
 * devengo (el "lote C" de `docs/diseno_asientos_nomina.md`).
 *
 * Integracion: base DESECHABLE, con candado (`precarga.mts`). NUNCA contra el
 * `.env` de produccion. La semilla trae el catalogo, las ocho claves de nomina
 * enlazadas (lote 292), los periodos abiertos de 2026 y la escala del ISR.
 * Ejecuta la ruta y el repositorio de verdad:
 *  1. aprobar crea UN asiento cuadrado, con las cuentas enlazadas, la fecha de
 *     fin del periodo, la referencia y el autor; el detalle de la nomina lo enseña;
 *  2. aprobar dos veces (seguidas y a la vez) deja un solo asiento;
 *  3. una nomina que ya tiene asiento con su referencia no genera otro;
 *  4. sin las cuentas de nomina enlazadas: 409 que las nombra, y nada cambia;
 *  5. con el periodo cerrado (el caso de julio de Latin Doors) o sin periodo: 409
 *     que lo dice, y nada cambia;
 *  6. si algo falla DESPUES del asiento, dentro de la aprobacion, el asiento se
 *     deshace con ella: misma transaccion.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-293-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-293-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-293';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { HRRepository } from '../src/repositories/hrRepository';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
/** Quincenal de 20.000: bruto 10.000 y neto 9.409, la nomina medida en PRODUCCION. */
const EMP = '29300000-0000-4000-8000-0000000000e1';
/** Quincenal de 200.000: para que el asiento lleve ISR retenido. */
const EMP_ISR = '29300000-0000-4000-8000-0000000000e2';
const CLAVES = ['payroll_salaries_expense', 'payroll_employer_tss_expense', 'payroll_infotep_expense', 'payroll_salaries_payable',
  'payroll_tss_payable', 'payroll_isr_payable', 'payroll_infotep_payable', 'payroll_other_deductions'];

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
  'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
});
type Handler = (r: NextRequest) => Promise<Response>;
type Cuerpo = { success?: boolean; data?: { asiento?: { id?: string; yaExistia?: boolean; lineas?: unknown[]; total?: number } | null }; error?: { message?: string } };

async function seccion(etiquetas: string[], f: () => Promise<void>) {
  try { await f(); } catch (e) { for (const t of etiquetas) ok(t, false, `lanzo: ${(e as Error).message}`); }
}

async function main() {
  const ruta = (await import('../src/app/api/v1/hr/payroll/route')) as unknown as Record<string, Handler>;
  const put = async (id: string, action: string) => {
    const res = await ruta.PUT(new NextRequest(`http://localhost/api/v1/hr/payroll?id=${id}`, {
      method: 'PUT', headers: { ...cabeceras(), 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    }));
    return { estado: res.status, cuerpo: (await res.json()) as Cuerpo };
  };
  const ver = async (id: string) => {
    const res = await ruta.GET(new NextRequest(`http://localhost/api/v1/hr/payroll?id=${id}`, { headers: cabeceras() }));
    return (await res.json()) as Cuerpo;
  };
  const estado = async (id: string) => (await todas(sql`SELECT status FROM payrolls WHERE id = ${id}::uuid`))[0]?.status;
  const asientos = async (id: string) => todas(sql`
    SELECT id::text, date::text AS fecha, description, created_by::text AS autor FROM journal_entries
    WHERE company_id = ${A}::uuid AND reference = ${id}`);
  const crear = async (desde: string, hasta: string) =>
    (await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: desde, periodEnd: hasta, paymentDate: hasta, frequency: 'quincenal', createdBy: USER })).id;

  // Precondiciones, ciertas en los dos estados: la semilla enlazo las ocho
  // claves (lote 292) y abrio octubre. Sin eso, nada de esto mide lo que dice.
  const mapeosAntes = await todas(sql`SELECT mapping_key, account_id::text FROM accounting_mappings WHERE company_id = ${A}::uuid AND mapping_key IN ${sql.raw(`('${CLAVES.join("','")}')`)}`);
  if (mapeosAntes.length !== 8) throw new Error(`precondicion: la semilla enlazo ${mapeosAntes.length} de 8 claves de nomina`);
  const cuentaDe = new Map(mapeosAntes.map((m) => [m.mapping_key as string, m.account_id as string]));

  await db.execute(sql`
    INSERT INTO employees (id, company_id, employee_code, first_name, last_name, cedula, birth_date, contract_type, payment_frequency, salary, hire_date) VALUES
      (${EMP}::uuid, ${A}::uuid, 'A-293-1', 'Medida', 'Quincenal', '29300000001', '1980-01-01', 'indefinido', 'quincenal', 20000, '2020-01-01'),
      (${EMP_ISR}::uuid, ${A}::uuid, 'A-293-2', 'Con', 'Isr', '29300000002', '1980-01-01', 'indefinido', 'quincenal', 200000, '2020-01-01')
    ON CONFLICT (id) DO NOTHING`);

  // ─── 1. Aprobar asienta ───────────────────────────────────────────────
  console.log('\n1. Aprobar registra el asiento de devengo');
  const E1 = [
    'aprobar da 200, la nomina queda aprobada y la respuesta nombra el asiento',
    'UN asiento con la referencia de la nomina, fecha de fin del periodo (15/10), descripcion legible y autor',
    'cada cuenta enlazada lleva la suma del detalle guardado (bruto, patronales, Infotep | neto, TSS, ISR, Infotep, otras)',
    'el asiento cuadra al centavo, y el empleado medido entra con bruto 10.000 y neto 9.409',
    'el detalle de la nomina (GET) enseña el asiento con sus lineas',
  ];
  await seccion(E1, async () => {
    // Una deduccion del periodo, para que el asiento lleve "otras deducciones".
    await db.execute(sql`INSERT INTO employee_deductions (company_id, employee_id, type, description, amount, date, status, modo)
      VALUES (${A}::uuid, ${EMP_ISR}::uuid, 'otros', 'Prestamo 293', 250, '2026-10-05', 'pending', 'PRODUCCION')`);
    const id = await crear('2026-10-01', '2026-10-15');
    const r = await put(id, 'approve');
    ok(E1[0], r.estado === 200 && (await estado(id)) === 'approved' && typeof r.cuerpo.data?.asiento?.id === 'string', `${r.estado} ${r.cuerpo.error?.message ?? ''}`);
    const as = await asientos(id);
    ok(E1[1], as.length === 1 && as[0].fecha === '2026-10-15' && as[0].description === 'Nómina quincenal 01-15/10/2026' && as[0].autor === USER && as[0].id === r.cuerpo.data?.asiento?.id,
      JSON.stringify(as));

    const [s] = await todas(sql`
      SELECT round(sum(gross_salary)*100)::bigint AS bruto, round(sum(afp_employer+sfs_employer+risk_employer)*100)::bigint AS patronal,
             round(sum(infotep_employer)*100)::bigint AS infotep, round(sum(net_salary)*100)::bigint AS neto,
             round(sum(afp+sfs+afp_employer+sfs_employer+risk_employer)*100)::bigint AS tss, round(sum(isr)*100)::bigint AS isr,
             round(sum(other_deductions)*100)::bigint AS otras
      FROM payroll_details WHERE payroll_id = ${id}::uuid`);
    const lineas = await todas(sql`
      SELECT l.account_id::text AS cuenta, round(sum(l.debit)*100)::bigint AS debe, round(sum(l.credit)*100)::bigint AS haber
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
      WHERE e.reference = ${id} GROUP BY l.account_id`);
    const de = (clave: string) => lineas.find((l) => l.cuenta === cuentaDe.get(clave));
    const esperado: [string, 'debe' | 'haber', unknown][] = [
      ['payroll_salaries_expense', 'debe', s.bruto], ['payroll_employer_tss_expense', 'debe', s.patronal], ['payroll_infotep_expense', 'debe', s.infotep],
      ['payroll_salaries_payable', 'haber', s.neto], ['payroll_tss_payable', 'haber', s.tss], ['payroll_isr_payable', 'haber', s.isr],
      ['payroll_infotep_payable', 'haber', s.infotep], ['payroll_other_deductions', 'haber', s.otras],
    ];
    const malas = esperado.filter(([clave, lado, v]) => Number(v) === 0 ? !!de(clave) : Number(de(clave)?.[lado]) !== Number(v));
    const conCero = esperado.filter(([, , v]) => Number(v) !== 0).length;
    // Las ocho: con ISR y con otras deducciones (si no, dos cuentas no se miran).
    ok(E1[2], malas.length === 0 && lineas.length === conCero && conCero === 8,
      malas.map(([c]) => `${c}: ${JSON.stringify(de(c))}`).join('; ') || `${lineas.length} cuentas`);
    const debe = lineas.reduce((t, l) => t + Number(l.debe), 0);
    const haber = lineas.reduce((t, l) => t + Number(l.haber), 0);
    const [medido] = await todas(sql`SELECT gross_salary::text AS bruto, net_salary::text AS neto FROM payroll_details WHERE payroll_id = ${id}::uuid AND employee_id = ${EMP}::uuid`);
    ok(E1[3], debe === haber && debe > 0 && medido?.bruto === '10000.00' && medido?.neto === '9409.00', `debe ${debe} haber ${haber}; medido ${JSON.stringify(medido)}`);
    const v = await ver(id);
    ok(E1[4], v.data?.asiento?.id === as[0]?.id && (v.data?.asiento?.lineas?.length ?? 0) === lineas.length && Number(v.data?.asiento?.total) * 100 === debe,
      JSON.stringify(v.data?.asiento ?? null).slice(0, 160));
  });

  // ─── 2. Dos veces ─────────────────────────────────────────────────────
  console.log('\n2. Aprobar dos veces');
  const E2 = [
    'aprobar otra vez una aprobada: 409 y sigue habiendo UN asiento',
    'dos aprobaciones A LA VEZ: una 200, otra 409, y UN asiento',
  ];
  await seccion(E2, async () => {
    const id = await crear('2026-10-16', '2026-10-31');
    const r1 = await put(id, 'approve');
    if (r1.estado !== 200) throw new Error(`precondicion: la primera aprobacion dio ${r1.estado} ${r1.cuerpo.error?.message ?? ''}`);
    const r2 = await put(id, 'approve');
    const n = (await asientos(id)).length;
    ok(E2[0], r2.estado === 409 && n === 1, `${r2.estado}; ${n} asientos`);

    const id2 = await crear('2026-09-01', '2026-09-15');
    const [a, b] = await Promise.all([put(id2, 'approve'), put(id2, 'approve')]);
    const estados = [a.estado, b.estado].sort().join(',');
    const n2 = (await asientos(id2)).length;
    ok(E2[1], estados === '200,409' && n2 === 1, `${estados}; ${n2} asientos`);
  });

  // ─── 3. Ya tenia asiento ──────────────────────────────────────────────
  console.log('\n3. Una nomina que ya tiene asiento con su referencia');
  const E3 = ['no genera otro: aprueba, sigue habiendo UN asiento (el que ya estaba) y la respuesta lo dice'];
  await seccion(E3, async () => {
    const id = await crear('2026-09-16', '2026-09-30');
    const [previo] = await todas(sql`
      INSERT INTO journal_entries (company_id, modo, reference, date, description, status)
      VALUES (${A}::uuid, 'PRODUCCION', ${id}, '2026-09-30', 'Asiento de la nomina hecho a mano', 'posted') RETURNING id::text`);
    const r = await put(id, 'approve');
    const as = await asientos(id);
    ok(E3[0], r.estado === 200 && as.length === 1 && as[0].id === previo.id && r.cuerpo.data?.asiento?.yaExistia === true,
      `${r.estado} ${r.cuerpo.error?.message ?? ''}; ${as.length} asientos`);
  });

  // ─── 4. Sin cuentas enlazadas ─────────────────────────────────────────
  console.log('\n4. Sin las cuentas de nomina enlazadas');
  const E4 = [
    'aprobar da 409 nombrando las cuentas que faltan y donde se enlazan',
    '... y nada cambia: sigue calculada, sin asiento, y sus novedades siguen pendientes',
  ];
  await seccion(E4, async () => {
    const id = await crear('2026-11-01', '2026-11-15');
    await db.execute(sql`INSERT INTO employee_income (company_id, employee_id, type, description, amount, date, status, modo)
      VALUES (${A}::uuid, ${EMP}::uuid, 'bono', 'Bono 293', 1000, '2026-11-10', 'pending', 'PRODUCCION')`);
    await HRRepository.recalculatePayroll(id, A, 'PRODUCCION');
    await db.execute(sql`DELETE FROM accounting_mappings WHERE company_id = ${A}::uuid AND mapping_key IN ('payroll_salaries_payable', 'payroll_tss_payable')`);
    try {
      const r = await put(id, 'approve');
      const msg = r.cuerpo.error?.message ?? '';
      ok(E4[0], r.estado === 409 && /Sueldos por Pagar/.test(msg) && /TSS por Pagar/.test(msg) && /Configuración > Cuentas Puente/.test(msg), `${r.estado} ${msg}`);
      const [nov] = await todas(sql`SELECT status FROM employee_income WHERE description = 'Bono 293'`);
      ok(E4[1], (await estado(id)) === 'calculated' && (await asientos(id)).length === 0 && nov?.status === 'pending',
        `estado ${await estado(id)}; novedad ${nov?.status}`);
    } finally {
      for (const m of mapeosAntes.filter((x) => ['payroll_salaries_payable', 'payroll_tss_payable'].includes(x.mapping_key as string))) {
        await db.execute(sql`INSERT INTO accounting_mappings (company_id, mapping_key, account_id) VALUES (${A}::uuid, ${m.mapping_key as string}, ${m.account_id as string}::uuid)`);
      }
    }
  });

  // ─── 5. Periodo cerrado / inexistente ─────────────────────────────────
  console.log('\n5. Periodo cerrado o sin periodo');
  const E5 = [
    'periodo de julio CERRADO (el caso de Latin Doors, 15-30/07): 409 que dice la fecha y que la asienta el contador',
    '... y nada cambia: sigue calculada y sin asiento',
    'SIN periodo para la fecha (agosto borrado): 409, sigue calculada y sin asiento',
  ];
  await seccion(E5, async () => {
    const id = await crear('2026-07-15', '2026-07-30');
    await db.execute(sql`UPDATE accounting_periods SET status = 'closed' WHERE company_id = ${A}::uuid AND modo = 'PRODUCCION' AND '2026-07-30' BETWEEN start_date AND end_date`);
    try {
      const r = await put(id, 'approve');
      const msg = r.cuerpo.error?.message ?? '';
      ok(E5[0], r.estado === 409 && /30-07-2026/.test(msg) && /contador/.test(msg), `${r.estado} ${msg}`);
      ok(E5[1], (await estado(id)) === 'calculated' && (await asientos(id)).length === 0, `estado ${await estado(id)}`);
    } finally {
      await db.execute(sql`UPDATE accounting_periods SET status = 'open' WHERE company_id = ${A}::uuid AND modo = 'PRODUCCION' AND '2026-07-30' BETWEEN start_date AND end_date`);
    }

    const id2 = await crear('2026-08-01', '2026-08-15');
    const agosto = await todas(sql`DELETE FROM accounting_periods WHERE company_id = ${A}::uuid AND modo = 'PRODUCCION' AND '2026-08-15' BETWEEN start_date AND end_date
      RETURNING company_id::text, modo::text, name, start_date::text, end_date::text, status`);
    try {
      const r = await put(id2, 'approve');
      ok(E5[2], agosto.length === 1 && r.estado === 409 && /15-08-2026/.test(r.cuerpo.error?.message ?? '') && (await estado(id2)) === 'calculated' && (await asientos(id2)).length === 0,
        `${r.estado} ${r.cuerpo.error?.message ?? ''}`);
    } finally {
      for (const p of agosto) {
        await db.execute(sql`INSERT INTO accounting_periods (company_id, modo, name, start_date, end_date, status)
          VALUES (${p.company_id as string}::uuid, ${p.modo as string}::environment_mode, ${p.name as string}, ${p.start_date as string}, ${p.end_date as string}, ${p.status as string})`);
      }
    }
  });

  // ─── 6. Misma transaccion ─────────────────────────────────────────────
  console.log('\n6. El asiento va en la transaccion de aprobar');
  const E6 = ['si la aprobacion falla DESPUES de asentar (la auditoria, forzada a fallar), el asiento se deshace y la nomina sigue calculada'];
  await seccion(E6, async () => {
    const id = await crear('2026-12-01', '2026-12-15');
    await db.execute(sql`CREATE OR REPLACE FUNCTION banco293_falla() RETURNS trigger AS $$
      BEGIN IF NEW.action = 'approve_payroll' THEN RAISE EXCEPTION 'banco 293: auditoria forzada a fallar'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER banco293_falla BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION banco293_falla()`);
    let fallo = '';
    try {
      const r = await put(id, 'approve');
      const n = (await asientos(id)).length;
      if (!(r.estado >= 400 && (await estado(id)) === 'calculated' && n === 0)) fallo = `${r.estado}; estado ${await estado(id)}; ${n} asientos`;
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS banco293_falla ON audit_logs`);
      await db.execute(sql`DROP FUNCTION IF EXISTS banco293_falla()`);
    }
    // La marca del estado posterior: sin la auditoria rota, la MISMA nomina si
    // se asienta. Sin esto, "no hay asiento" seria cierto de balde en un codigo
    // que no asienta nunca (y la contraprueba regalaria un OK).
    const r2 = await put(id, 'approve');
    const n2 = (await asientos(id)).length;
    ok(E6[0], fallo === '' && r2.estado === 200 && n2 === 1, fallo || `despues, sin el fallo: ${r2.estado}, ${n2} asientos`);
  });

  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
