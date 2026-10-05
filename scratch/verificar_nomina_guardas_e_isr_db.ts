/**
 * Lote 290, contra una base -- las guardas de la nomina y la escala del ISR.
 *
 * Integracion: base DESECHABLE, con candado (`precarga.mts`). La escala del ISR
 * la pone la semilla (`semilla_app.ts`, desde la constante de
 * `services/nomina/escalaIsr.ts`), igual que la pondra en las bases reales el
 * guion de datos del lote. Ejecuta el repositorio y la ruta de verdad:
 *  · con la escala sembrada, el ISR de cada empleado sale el calculado a mano;
 *  · recalcular una nomina APROBADA da 409 y no cambia ni el estado ni el detalle;
 *  · aprobar un borrador sin detalle, o una calculada sin lineas, da 409;
 *  · con la tabla de tramos vacia, calcular se niega (409, "Falta la escala del
 *    ISR de 2026") y no deja nada a medias; y una nomina de 2027 no se calcula
 *    con la escala de 2026.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-290-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-290-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-290';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { HRRepository } from '../src/repositories/hrRepository';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
// Empleados propios del banco (la semilla ya trae a Ana 50.000, Luis 40.000 y Sara 35.000 quincenal).
const EMP_100K = '29000000-0000-4000-8000-0000000000e1';
const EMP_70K = '29000000-0000-4000-8000-0000000000e2';
const EMP_Q20K = '29000000-0000-4000-8000-0000000000e3';
const ANA = 'eeee0000-0000-0000-0000-00000000000a';
const LUIS = 'eeee0000-0000-0000-0000-00000000000b';
const BORRADOR = '29000000-0000-4000-8000-000000000001';
const CALC_VACIA = '29000000-0000-4000-8000-000000000002';

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

/** Ejecuta una seccion; si lanza, cuenta FALLA en sus comprobaciones en vez de reventar. */
async function seccion(etiquetas: string[], f: () => Promise<void>) {
  try { await f(); } catch (e) { for (const t of etiquetas) ok(t, false, `lanzo: ${(e as Error).message}`); }
}

async function main() {
  const ruta = (await import('../src/app/api/v1/hr/payroll/route')) as unknown as Record<string, Handler>;
  const put = async (id: string, action: string) => {
    const res = await ruta.PUT(new NextRequest(`http://localhost/api/v1/hr/payroll?id=${id}`, {
      method: 'PUT', headers: { ...cabeceras(), 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    }));
    return { estado: res.status, cuerpo: (await res.json()) as { error?: { message?: string } } };
  };
  const estado = async (id: string) => (await todas(sql`SELECT status FROM payrolls WHERE id = ${id}::uuid`))[0]?.status;
  const detalle = async (id: string) => todas(sql`
    SELECT employee_id::text AS emp, gross_salary::text AS bruto, afp::text, sfs::text, isr::text, net_salary::text AS neto
    FROM payroll_details WHERE payroll_id = ${id}::uuid ORDER BY employee_id`);

  // Precondicion: la semilla puso la escala. Si no, nada de esto mide lo que dice.
  const filasEscala = await todas(sql`SELECT count(*)::int AS n FROM isr_brackets WHERE year = 2026`);
  const hayEscala = Number(filasEscala[0]?.n) === 4;

  await db.execute(sql`
    INSERT INTO employees (id, company_id, employee_code, first_name, last_name, cedula, birth_date, contract_type, payment_frequency, salary, hire_date) VALUES
      (${EMP_100K}::uuid, ${A}::uuid, 'A-290-1', 'Cien', 'Mil', '29000000001', '1980-01-01', 'indefinido', 'mensual', 100000, '2020-01-01'),
      (${EMP_70K}::uuid, ${A}::uuid, 'A-290-2', 'Setenta', 'Mil', '29000000002', '1980-01-01', 'indefinido', 'mensual', 70000, '2020-01-01'),
      (${EMP_Q20K}::uuid, ${A}::uuid, 'A-290-3', 'Quince', 'Na', '29000000003', '1980-01-01', 'indefinido', 'quincenal', 20000, '2020-01-01')
    ON CONFLICT (id) DO NOTHING`);

  // ─── 1. Con la escala sembrada, el ISR esperado ──────────────────────────
  console.log('\n1. Con la escala sembrada (semilla), el ISR de cada empleado');
  const E1 = [
    'nomina mensual de junio 2026: ISR por tramos de cada empleado (a mano)',
    'nomina quincenal: bruto 10.000 -> AFP 287, SFS 304, ISR 0, neto 9.409 (la medida en PRODUCCION)',
  ];
  let mensual = '';
  await seccion(E1, async () => {
    const nom = await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: '2026-06-01', periodEnd: '2026-06-30', paymentDate: '2026-06-30', frequency: 'mensual', createdBy: USER });
    mensual = nom.id;
    const d = new Map((await detalle(nom.id)).map((r) => [r.emp as string, r]));
    // [empleado, isr, neto] calculados a mano (ver el banco de codigo, seccion 4).
    const esperados: [string, string, string][] = [
      [EMP_100K, '12105.44', '81984.56'], // 25 %
      [EMP_70K, '5368.45', '60494.55'], // 20 %
      [ANA, '1854.00', '45191.00'], // 15 %: 47.045 x 12 = 564.540
      [LUIS, '442.65', '37193.35'], // 15 %: 37.636 x 12 = 451.632 -> 5.311,7985 / 12
    ];
    const malos = esperados.filter(([emp, isr, neto]) => d.get(emp)?.isr !== isr || d.get(emp)?.neto !== neto);
    ok(E1[0], hayEscala && malos.length === 0,
      malos.map(([emp]) => `${emp.slice(-2)}: isr ${d.get(emp)?.isr} neto ${d.get(emp)?.neto}`).join('; ') || (hayEscala ? '' : 'la base no tiene la escala de 2026'));

    const q = await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: '2026-07-15', periodEnd: '2026-07-30', paymentDate: '2026-07-30', frequency: 'quincenal', createdBy: USER });
    const fila = (await detalle(q.id)).find((r) => r.emp === EMP_Q20K);
    ok(E1[1], hayEscala && fila?.bruto === '10000.00' && fila?.afp === '287.00' && fila?.sfs === '304.00' && fila?.isr === '0.00' && fila?.neto === '9409.00', JSON.stringify(fila));
  });

  // ─── 2. Recalcular una aprobada ──────────────────────────────────────────
  console.log('\n2. Recalcular una nomina aprobada');
  const E2 = [
    'recalcular una APROBADA da 409 con el motivo',
    '... y no cambia nada: sigue aprobada y el detalle es el mismo',
  ];
  await seccion(E2, async () => {
    if (!mensual) throw new Error('no se creo la nomina mensual');
    const r = await put(mensual, 'approve');
    // Precondicion, no comprobacion: aprobar una calculada con detalle ya
    // funcionaba antes del lote (y como ok() regalaria un OK en la contraprueba).
    if (r.estado !== 200 || (await estado(mensual)) !== 'approved') throw new Error(`precondicion: aprobar dio ${r.estado} ${r.cuerpo.error?.message ?? ''}`);
    // Para que un recalculo SI cambiara el detalle: sube el sueldo de uno.
    const antes = JSON.stringify(await detalle(mensual));
    await db.execute(sql`UPDATE employees SET salary = 150000 WHERE id = ${EMP_100K}::uuid`);
    const r2 = await put(mensual, 'recalculate');
    ok(E2[0], r2.estado === 409 && /No se puede recalcular una nómina aprobada/.test(r2.cuerpo.error?.message ?? ''), `${r2.estado} ${r2.cuerpo.error?.message ?? ''}`);
    const despues = JSON.stringify(await detalle(mensual));
    ok(E2[1], (await estado(mensual)) === 'approved' && antes === despues, `estado ${await estado(mensual)}; detalle ${antes === despues ? 'igual' : 'CAMBIADO'}`);
    await db.execute(sql`UPDATE employees SET salary = 100000 WHERE id = ${EMP_100K}::uuid`);
  });

  // ─── 3. Aprobar sin detalle ──────────────────────────────────────────────
  console.log('\n3. Aprobar sin detalle');
  const E3 = [
    'aprobar un BORRADOR sin detalle da 409 y sigue en borrador',
    'aprobar una calculada SIN lineas da 409 y sigue calculada',
  ];
  await seccion(E3, async () => {
    await db.execute(sql`
      INSERT INTO payrolls (id, company_id, modo, period_start, period_end, payment_date, frequency, status, created_by) VALUES
        (${BORRADOR}::uuid, ${A}::uuid, 'PRODUCCION', '2026-08-01', '2026-08-31', '2026-08-31', 'mensual', 'draft', ${USER}::uuid),
        (${CALC_VACIA}::uuid, ${A}::uuid, 'PRODUCCION', '2026-08-01', '2026-08-31', '2026-08-31', 'semanal', 'calculated', ${USER}::uuid)
      ON CONFLICT (id) DO NOTHING`);
    const r1 = await put(BORRADOR, 'approve');
    ok(E3[0], r1.estado === 409 && /borrador/.test(r1.cuerpo.error?.message ?? '') && (await estado(BORRADOR)) === 'draft', `${r1.estado} ${r1.cuerpo.error?.message ?? ''}`);
    const r2 = await put(CALC_VACIA, 'approve');
    ok(E3[1], r2.estado === 409 && /sin detalle/.test(r2.cuerpo.error?.message ?? '') && (await estado(CALC_VACIA)) === 'calculated', `${r2.estado} ${r2.cuerpo.error?.message ?? ''}`);
  });

  // ─── 4. Tabla de tramos vacia, y un año sin escala ──────────────────────
  console.log('\n4. Sin escala: se niega, no calcula 0');
  const E4 = [
    'tabla vacia: crear una nomina se niega (409, "Falta la escala del ISR de 2026") y no queda ninguna nomina a medias',
    'tabla vacia: recalcular por la ruta da 409 y el detalle de la nomina no se toca',
    'una nomina de 2027 no se calcula con la escala de 2026 (409, "de 2027")',
  ];
  const guardadas = await todas(sql`SELECT year, from_amount, to_amount, fixed_amount, percentage FROM isr_brackets`);
  await seccion(E4, async () => {
    // Una calculada CON detalle, hecha antes de vaciar (la quincenal de julio).
    const [quinc] = await todas(sql`SELECT id::text FROM payrolls WHERE company_id = ${A}::uuid AND frequency = 'quincenal' AND period_end = '2026-07-30' AND deleted_at IS NULL LIMIT 1`);
    await db.execute(sql`DELETE FROM isr_brackets`);
    const antes = Number((await todas(sql`SELECT count(*)::int AS n FROM payrolls WHERE company_id = ${A}::uuid`))[0].n);
    let err: { status?: number; message?: string } = {};
    try {
      await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: '2026-09-01', periodEnd: '2026-09-30', paymentDate: '2026-09-30', frequency: 'mensual', createdBy: USER });
    } catch (e) { err = e as { status?: number; message?: string }; }
    const despues = Number((await todas(sql`SELECT count(*)::int AS n FROM payrolls WHERE company_id = ${A}::uuid`))[0].n);
    ok(E4[0], err.status === 409 && /^Falta la escala del ISR de 2026/.test(err.message ?? '') && despues === antes, `${err.status} ${err.message ?? '(no lanzo)'}; nominas ${antes} -> ${despues}`);

    const id = quinc?.id as string | undefined;
    if (!id) throw new Error('no hay nomina quincenal de julio');
    const det0 = JSON.stringify(await detalle(id));
    const r = await put(id, 'recalculate');
    ok(E4[1], r.estado === 409 && /Falta la escala del ISR de 2026/.test(r.cuerpo.error?.message ?? '') && JSON.stringify(await detalle(id)) === det0 && det0 !== '[]',
      `${r.estado} ${r.cuerpo.error?.message ?? ''}`);

    // Se repone la escala de 2026 y se pide 2027.
    for (const f of guardadas) {
      await db.execute(sql`INSERT INTO isr_brackets (year, from_amount, to_amount, fixed_amount, percentage) VALUES (${f.year}, ${f.from_amount}, ${f.to_amount}, ${f.fixed_amount}, ${f.percentage})`);
    }
    let err27: { status?: number; message?: string } = {};
    try {
      await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: '2027-01-01', periodEnd: '2027-01-31', paymentDate: '2027-01-31', frequency: 'mensual', createdBy: USER });
    } catch (e) { err27 = e as { status?: number; message?: string }; }
    ok(E4[2], guardadas.length > 0 && err27.status === 409 && /^Falta la escala del ISR de 2027/.test(err27.message ?? ''), `${err27.status} ${err27.message ?? '(no lanzo)'}`);
  });

  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
