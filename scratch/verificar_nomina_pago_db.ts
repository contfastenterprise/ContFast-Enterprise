/**
 * Lote 295, contra una base -- PAGAR una nomina aprobada (el "lote D" de
 * `docs/diseno_asientos_nomina.md`).
 *
 * Integracion: base DESECHABLE, con candado (`precarga.mts`). NUNCA contra el
 * `.env` de produccion. La semilla trae el catalogo, las ocho claves de nomina
 * enlazadas (lote 292), los periodos abiertos de 2026 y la escala del ISR. Se
 * aprueba de verdad (lote 293: deja el devengo) y se paga por la ruta:
 *  1. por banco: asiento cuadrado (debe Sueldos por pagar, haber el banco),
 *     retiro en el libro de banco pendiente de conciliar, saldo que baja,
 *     estado `paid`, el pago con fecha, origen y autor; el GET lo enseña;
 *  2. por caja con sesion abierta: la sesion baja (salida) y el asiento acredita la caja;
 *  3. sin caja abierta: 409 y nada cambia;
 *  4. pagar dos veces, seguidas o a la vez: un pago;
 *  5. una no aprobada, o aprobada sin devengo: 409;
 *  6. el banco de otra empresa, o sin cuenta contable: 409;
 *  7. sin el enlace de Sueldos por pagar: 409 que lo nombra;
 *  8. el periodo del dia del pago cerrado: 409 con la fecha;
 *  9. sin la tabla 0021: 409 nombrandola, y el GET no revienta;
 * 10. si algo falla despues de escribir, no queda nada a medias.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-295-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-295-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-295';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { HRRepository } from '../src/repositories/hrRepository';
import { diaRD } from '../src/utils/fechasLocales';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const EMP = '29500000-0000-4000-8000-0000000000e1';
const POPULAR = '29500000-0000-4000-8000-0000000000b1';
const SIN_CUENTA = '29500000-0000-4000-8000-0000000000b2';
const AJENO = '29500000-0000-4000-8000-0000000000b3';
const CAJA = '29500000-0000-4000-8000-0000000000c1';
const SESION = '29500000-0000-4000-8000-0000000000c2';
const HOY = diaRD();

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
type Handler = (r: NextRequest, s: { params: Promise<{ id: string }> }) => Promise<Response>;
type Cuerpo = {
  success?: boolean;
  data?: { pago?: { id?: string; monto?: number; asiento?: { lineas?: unknown[]; total?: number } | null } | null; hayTabla?: boolean };
  error?: { message?: string };
};

async function seccion(etiquetas: string[], f: () => Promise<void>) {
  try { await f(); } catch (e) { for (const t of etiquetas) ok(t, false, `lanzo: ${(e as Error).message}`); }
}

async function main() {
  // Perezoso: en la contraprueba la ruta no existe y cada seccion da FALLA.
  let ruta: Record<string, Handler> | null = null;
  try { ruta = (await import('../src/app/api/v1/hr/payroll/[id]/pay/route')) as unknown as Record<string, Handler>; } catch { ruta = null; }
  const r = () => { if (!ruta) throw new Error('no existe la ruta hr/payroll/[id]/pay'); return ruta; };
  const pagar = async (id: string, cuerpo: Record<string, unknown>) => {
    const res = await r().POST(new NextRequest(`http://localhost/api/v1/hr/payroll/${id}/pay`, {
      method: 'POST', headers: { ...cabeceras(), 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
    }), { params: Promise.resolve({ id }) });
    return { estado: res.status, cuerpo: (await res.json()) as Cuerpo };
  };
  const ver = async (id: string) => {
    const res = await r().GET(new NextRequest(`http://localhost/api/v1/hr/payroll/${id}/pay`, { headers: cabeceras() }), { params: Promise.resolve({ id }) });
    return { estado: res.status, cuerpo: (await res.json()) as Cuerpo };
  };
  const estado = async (id: string) => (await todas(sql`SELECT status FROM payrolls WHERE id = ${id}::uuid`))[0]?.status;
  const neto = async (id: string) => Number((await todas(sql`SELECT round(sum(net_salary)*100)::bigint AS n FROM payroll_details WHERE payroll_id = ${id}::uuid`))[0]?.n ?? 0);
  const pagos = async (id: string) => {
    try { return await todas(sql`SELECT id::text, fecha::text, metodo, referencia, bank_account_id::text AS banco, cash_session_id::text AS sesion,
      round(monto*100)::bigint AS monto, created_by::text AS autor, journal_entry_id::text AS asiento FROM pagos_de_nomina WHERE payroll_id = ${id}::uuid`); }
    catch { return []; }
  };
  const asientosDe = async (ref: string) => todas(sql`SELECT id::text, date::text AS fecha, description, created_by::text AS autor FROM journal_entries WHERE company_id = ${A}::uuid AND reference = ${ref}`);
  const lineasDe = async (ref: string) => todas(sql`
    SELECT l.account_id::text AS cuenta, round(l.debit*100)::bigint AS debe, round(l.credit*100)::bigint AS haber
    FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE e.company_id = ${A}::uuid AND e.reference = ${ref}`);
  const saldoBanco = async (id: string) => {
    const [f] = await todas(sql`SELECT round(balance*100)::bigint AS s FROM bank_account_balances WHERE bank_account_id = ${id}::uuid AND modo = 'PRODUCCION'`);
    return f ? Number(f.s) : 10000000; // sin fila: el saldo del catalogo (100.000)
  };
  const retiros = async (banco: string) => todas(sql`SELECT type, round(amount*100)::bigint AS monto, reference, status, date::text AS fecha FROM bank_transactions WHERE bank_account_id = ${banco}::uuid ORDER BY created_at`);
  const crear = async (desde: string, hasta: string) =>
    (await HRRepository.createPayroll(A, 'PRODUCCION', { periodStart: desde, periodEnd: hasta, paymentDate: hasta, frequency: 'quincenal', createdBy: USER })).id;
  const aprobada = async (desde: string, hasta: string) => {
    const id = await crear(desde, hasta);
    await HRRepository.approvePayroll(id, A, 'PRODUCCION', USER);
    if ((await estado(id)) !== 'approved') throw new Error(`precondicion: la nomina ${desde} no quedo aprobada`);
    return id;
  };
  const cuenta = async (codigo: string) => {
    const [f] = await todas(sql`SELECT id::text FROM chart_of_accounts WHERE company_id = ${A}::uuid AND code = ${codigo} AND deleted_at IS NULL`);
    if (!f) throw new Error(`precondicion: no existe la cuenta ${codigo}`);
    return f.id as string;
  };
  const transferencia = { metodo: 'transfer', bankAccountId: POPULAR, fecha: HOY, referencia: 'TR-295' };

  // Precondiciones, ciertas en los dos estados: las ocho claves enlazadas (lote 292).
  const [sp] = await todas(sql`SELECT account_id::text AS id FROM accounting_mappings WHERE company_id = ${A}::uuid AND mapping_key = 'payroll_salaries_payable'`);
  if (!sp) throw new Error('precondicion: la semilla no enlazo Sueldos por Pagar');
  const sueldosPorPagar = sp.id as string;
  const ctaPopular = await cuenta('1.1.01.02');

  await db.execute(sql`
    INSERT INTO employees (id, company_id, employee_code, first_name, last_name, cedula, birth_date, contract_type, payment_frequency, salary, hire_date) VALUES
      (${EMP}::uuid, ${A}::uuid, 'A-295-1', 'Medida', 'Quincenal', '29500000001', '1980-01-01', 'indefinido', 'quincenal', 20000, '2020-01-01')
    ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO bank_accounts (id, company_id, bank_name, account_number, balance, chart_account_id) VALUES
    (${POPULAR}::uuid, ${A}::uuid, 'Popular', '111', 100000, ${ctaPopular}::uuid),
    (${SIN_CUENTA}::uuid, ${A}::uuid, 'Sin Cuenta', '222', 100000, NULL),
    (${AJENO}::uuid, ${B}::uuid, 'Ajeno', '333', 100000, NULL) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO cash_registers (id, company_id, name, code) VALUES (${CAJA}::uuid, ${A}::uuid, 'Caja 295', 'C295') ON CONFLICT (id) DO NOTHING`);

  // ─── 1. Por banco ─────────────────────────────────────────────────────
  console.log('\n1. Pagar por transferencia');
  const E1 = [
    'pagar da 200 y la nomina queda pagada',
    'UN pago guardado: fecha, metodo, banco, referencia, monto = neto, autor y su asiento',
    'el asiento del pago: debe Sueldos por pagar / haber la cuenta del banco, por el neto, fechado el dia del pago y con autor',
    'Sueldos por pagar queda en cero para esta nomina (devengo + pago)',
    'el retiro queda en el libro de banco, PENDIENTE de conciliar, y el saldo del banco baja el neto',
    'el GET enseña el pago con su asiento',
  ];
  await seccion(E1, async () => {
    const id = await aprobada('2026-01-01', '2026-01-15');
    const n = await neto(id);
    const saldoAntes = await saldoBanco(POPULAR);
    const res = await pagar(id, transferencia);
    ok(E1[0], res.estado === 200 && (await estado(id)) === 'paid', `${res.estado} ${res.cuerpo.error?.message ?? ''}`);
    const ps = await pagos(id);
    ok(E1[1], ps.length === 1 && ps[0].fecha === HOY && ps[0].metodo === 'transfer' && ps[0].banco === POPULAR && ps[0].referencia === 'TR-295'
      && Number(ps[0].monto) === n && n > 0 && ps[0].autor === USER && typeof ps[0].asiento === 'string', JSON.stringify(ps));
    const as = await asientosDe(ps[0]?.id as string);
    const ls = await lineasDe(ps[0]?.id as string);
    const debe = ls.find((l) => l.cuenta === sueldosPorPagar);
    const haber = ls.find((l) => l.cuenta === ctaPopular);
    ok(E1[2], as.length === 1 && as[0].id === ps[0].asiento && as[0].fecha === HOY && as[0].autor === USER && ls.length === 2
      && Number(debe?.debe) === n && Number(debe?.haber) === 0 && Number(haber?.haber) === n && Number(haber?.debe) === 0,
      JSON.stringify({ as, ls }));
    const [saldo] = await todas(sql`SELECT round(coalesce(sum(l.debit - l.credit),0)*100)::bigint AS s FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
      WHERE e.company_id = ${A}::uuid AND l.account_id = ${sueldosPorPagar}::uuid AND e.reference IN (${id}, ${ps[0]?.id as string})`);
    ok(E1[3], Number(saldo.s) === 0, `saldo ${saldo.s}`);
    const rs = (await retiros(POPULAR)).filter((x) => x.reference === 'TR-295');
    ok(E1[4], rs.length === 1 && rs[0].type === 'withdrawal' && Number(rs[0].monto) === n && rs[0].status === 'pending' && rs[0].fecha === HOY
      && (await saldoBanco(POPULAR)) === saldoAntes - n, JSON.stringify(rs));
    const v = await ver(id);
    ok(E1[5], v.estado === 200 && v.cuerpo.data?.pago?.id === ps[0].id && Math.round(Number(v.cuerpo.data?.pago?.monto) * 100) === n
      && (v.cuerpo.data?.pago?.asiento?.lineas?.length ?? 0) === 2, JSON.stringify(v.cuerpo).slice(0, 200));
  });

  // ─── 2. Por caja ──────────────────────────────────────────────────────
  console.log('\n2. Pagar desde la caja, con sesion abierta');
  const E2 = [
    'pagar en efectivo da 200, queda pagada, y el pago apunta a la sesion',
    'la sesion de caja baja el neto (una salida, cash_out, con la referencia del pago)',
    'el asiento acredita la Caja General y debita Sueldos por pagar',
  ];
  await seccion(E2, async () => {
    await db.execute(sql`INSERT INTO cash_sessions (id, company_id, modo, cash_register_id, user_id, status, initial_balance, expected_balance)
      VALUES (${SESION}::uuid, ${A}::uuid, 'PRODUCCION', ${CAJA}::uuid, ${USER}::uuid, 'open', 100000, 100000) ON CONFLICT (id) DO NOTHING`);
    try {
      const id = await aprobada('2026-01-16', '2026-01-31');
      const n = await neto(id);
      const res = await pagar(id, { metodo: 'cash', fecha: HOY });
      const ps = await pagos(id);
      ok(E2[0], res.estado === 200 && (await estado(id)) === 'paid' && ps.length === 1 && ps[0].sesion === SESION && ps[0].banco === null,
        `${res.estado} ${res.cuerpo.error?.message ?? ''}`);
      const [s] = await todas(sql`SELECT round(expected_balance*100)::bigint AS e FROM cash_sessions WHERE id = ${SESION}::uuid`);
      const movs = await todas(sql`SELECT type, round(amount*100)::bigint AS monto FROM cash_movements WHERE cash_session_id = ${SESION}::uuid AND reference = ${ps[0]?.id as string}`);
      ok(E2[1], Number(s.e) === 10000000 - n && movs.length === 1 && movs[0].type === 'cash_out' && Number(movs[0].monto) === n, JSON.stringify({ s, movs }));
      const caja = await cuenta('1.1.01.01');
      const ls = await lineasDe(ps[0]?.id as string);
      ok(E2[2], ls.length === 2 && Number(ls.find((l) => l.cuenta === caja)?.haber) === n && Number(ls.find((l) => l.cuenta === sueldosPorPagar)?.debe) === n, JSON.stringify(ls));
    } finally {
      await db.execute(sql`UPDATE cash_sessions SET status = 'closed' WHERE id = ${SESION}::uuid`);
    }
  });

  // ─── 3. Sin caja ──────────────────────────────────────────────────────
  console.log('\n3. Sin caja abierta');
  const E3 = ['efectivo sin caja abierta: 409 que pide abrirla, y nada cambia (aprobada, sin pago, sin asiento de pago)'];
  await seccion(E3, async () => {
    const id = await aprobada('2026-02-01', '2026-02-15');
    const asientosAntes = (await todas(sql`SELECT count(*)::int AS n FROM journal_entries WHERE company_id = ${A}::uuid`))[0].n;
    const res = await pagar(id, { metodo: 'cash', fecha: HOY });
    const asientosDespues = (await todas(sql`SELECT count(*)::int AS n FROM journal_entries WHERE company_id = ${A}::uuid`))[0].n;
    ok(E3[0], res.estado === 409 && /caja abierta/.test(res.cuerpo.error?.message ?? '') && (await estado(id)) === 'approved'
      && (await pagos(id)).length === 0 && asientosAntes === asientosDespues, `${res.estado} ${res.cuerpo.error?.message ?? ''}`);
  });

  // ─── 4. Dos veces ─────────────────────────────────────────────────────
  console.log('\n4. Pagar dos veces');
  const E4 = [
    'seguidas: la segunda 409 ("ya está pagada"), un pago y un retiro',
    'a la vez: una 200, otra 409, un pago y un retiro',
  ];
  await seccion(E4, async () => {
    const id = await aprobada('2026-02-16', '2026-02-28');
    const r1 = await pagar(id, { ...transferencia, referencia: 'TR-295-A' });
    if (r1.estado !== 200) throw new Error(`precondicion: el primer pago dio ${r1.estado} ${r1.cuerpo.error?.message ?? ''}`);
    const r2 = await pagar(id, { ...transferencia, referencia: 'TR-295-B' });
    const retirosAB = (await retiros(POPULAR)).filter((x) => /^TR-295-[AB]$/.test(String(x.reference)));
    ok(E4[0], r2.estado === 409 && /ya está pagada/.test(r2.cuerpo.error?.message ?? '') && (await pagos(id)).length === 1 && retirosAB.length === 1,
      `${r2.estado}; ${retirosAB.length} retiros`);

    const id2 = await aprobada('2026-03-01', '2026-03-15');
    const [a, b] = await Promise.all([pagar(id2, { ...transferencia, referencia: 'TR-295-C' }), pagar(id2, { ...transferencia, referencia: 'TR-295-D' })]);
    const estados = [a.estado, b.estado].sort().join(',');
    const retirosCD = (await retiros(POPULAR)).filter((x) => /^TR-295-[CD]$/.test(String(x.reference)));
    ok(E4[1], estados === '200,409' && (await pagos(id2)).length === 1 && retirosCD.length === 1, `${estados}; ${retirosCD.length} retiros`);
  });

  // ─── 5. No aprobada / sin devengo ─────────────────────────────────────
  console.log('\n5. Una nomina que no se puede pagar');
  const E5 = [
    'calculada (sin aprobar): 409 "solo se pagan nóminas aprobadas", y sigue calculada',
    'aprobada SIN asiento de devengo (antes del lote 293): 409 que lo dice, y sigue aprobada sin pago',
  ];
  await seccion(E5, async () => {
    const id = await crear('2026-03-16', '2026-03-31');
    const res = await pagar(id, transferencia);
    ok(E5[0], res.estado === 409 && /solo se pagan nóminas aprobadas/.test(res.cuerpo.error?.message ?? '') && (await estado(id)) === 'calculated'
      && (await pagos(id)).length === 0, `${res.estado} ${res.cuerpo.error?.message ?? ''}`);
    const id2 = await crear('2026-04-01', '2026-04-15');
    await db.execute(sql`UPDATE payrolls SET status = 'approved' WHERE id = ${id2}::uuid`);
    const res2 = await pagar(id2, transferencia);
    ok(E5[1], res2.estado === 409 && /sin registrar su asiento de devengo/.test(res2.cuerpo.error?.message ?? '') && (await estado(id2)) === 'approved' && (await pagos(id2)).length === 0,
      `${res2.estado} ${res2.cuerpo.error?.message ?? ''}`);
  });

  // ─── 6. El banco ──────────────────────────────────────────────────────
  console.log('\n6. El banco');
  const E6 = [
    'el banco de OTRA empresa: 409 "no pertenece a la empresa", y nada cambia',
    'un banco sin cuenta contable: 409 que lo dice, y nada cambia',
    'transferencia sin referencia: 400, y nada cambia',
  ];
  await seccion(E6, async () => {
    const id = await aprobada('2026-04-16', '2026-04-30');
    const ajeno = await pagar(id, { ...transferencia, bankAccountId: AJENO });
    ok(E6[0], ajeno.estado === 409 && /no pertenece a la empresa/.test(ajeno.cuerpo.error?.message ?? '') && (await estado(id)) === 'approved' && (await pagos(id)).length === 0,
      `${ajeno.estado} ${ajeno.cuerpo.error?.message ?? ''}`);
    const sinCta = await pagar(id, { ...transferencia, bankAccountId: SIN_CUENTA });
    ok(E6[1], sinCta.estado === 409 && /cuenta contable/.test(sinCta.cuerpo.error?.message ?? '') && (await estado(id)) === 'approved' && (await pagos(id)).length === 0
      && (await retiros(SIN_CUENTA)).length === 0, `${sinCta.estado} ${sinCta.cuerpo.error?.message ?? ''}`);
    const sinRef = await pagar(id, { ...transferencia, referencia: '' });
    ok(E6[2], sinRef.estado === 400 && /referencia/.test(sinRef.cuerpo.error?.message ?? '') && (await estado(id)) === 'approved', `${sinRef.estado}`);
  });

  // ─── 7. Sin el enlace ─────────────────────────────────────────────────
  console.log('\n7. Sin el enlace de Sueldos por pagar');
  const E7 = [
    '409 que nombra "Sueldos por Pagar" y Cuentas Puente, y nada cambia',
    'enlace cambiado DESPUES de aprobar (a otra cuenta): 409 "no deja" el neto, y nada cambia',
  ];
  await seccion(E7, async () => {
    const idOtra = await aprobada('2026-07-01', '2026-07-15');
    const otra = await cuenta('2.1.01.02');
    await db.execute(sql`UPDATE accounting_mappings SET account_id = ${otra}::uuid WHERE company_id = ${A}::uuid AND mapping_key = 'payroll_salaries_payable'`);
    try {
      const res = await pagar(idOtra, transferencia);
      ok(E7[1], res.estado === 409 && /no deja/.test(res.cuerpo.error?.message ?? '') && (await estado(idOtra)) === 'approved' && (await pagos(idOtra)).length === 0,
        `${res.estado} ${res.cuerpo.error?.message ?? ''}`);
    } finally {
      await db.execute(sql`UPDATE accounting_mappings SET account_id = ${sueldosPorPagar}::uuid WHERE company_id = ${A}::uuid AND mapping_key = 'payroll_salaries_payable'`);
    }
    const id = await aprobada('2026-05-01', '2026-05-15');
    await db.execute(sql`DELETE FROM accounting_mappings WHERE company_id = ${A}::uuid AND mapping_key = 'payroll_salaries_payable'`);
    try {
      const res = await pagar(id, transferencia);
      const msg = res.cuerpo.error?.message ?? '';
      ok(E7[0], res.estado === 409 && /Sueldos por Pagar/.test(msg) && /Cuentas Puente/.test(msg) && /pagar la nómina/.test(msg) && (await estado(id)) === 'approved'
        && (await pagos(id)).length === 0, `${res.estado} ${msg}`);
    } finally {
      await db.execute(sql`INSERT INTO accounting_mappings (company_id, mapping_key, account_id) VALUES (${A}::uuid, 'payroll_salaries_payable', ${sueldosPorPagar}::uuid)`);
    }
  });

  // ─── 8. Periodo cerrado ───────────────────────────────────────────────
  console.log('\n8. El periodo del dia del pago, cerrado');
  const E8 = ['409 con la fecha del pago, y nada cambia; con el periodo abierto, la misma nomina se paga'];
  await seccion(E8, async () => {
    const id = await aprobada('2026-05-16', '2026-05-31');
    await db.execute(sql`UPDATE accounting_periods SET status = 'closed' WHERE company_id = ${A}::uuid AND modo = 'PRODUCCION' AND '2026-06-10' BETWEEN start_date AND end_date`);
    let fallo = '';
    try {
      const res = await pagar(id, { ...transferencia, fecha: '2026-06-10', referencia: 'TR-295-JUN' });
      if (!(res.estado === 409 && /10-06-2026/.test(res.cuerpo.error?.message ?? '') && (await estado(id)) === 'approved' && (await pagos(id)).length === 0)) {
        fallo = `${res.estado} ${res.cuerpo.error?.message ?? ''}`;
      }
    } finally {
      await db.execute(sql`UPDATE accounting_periods SET status = 'open' WHERE company_id = ${A}::uuid AND modo = 'PRODUCCION' AND '2026-06-10' BETWEEN start_date AND end_date`);
    }
    const r2 = await pagar(id, { ...transferencia, fecha: '2026-06-10', referencia: 'TR-295-JUN' });
    ok(E8[0], fallo === '' && r2.estado === 200, fallo || `despues, abierto: ${r2.estado} ${r2.cuerpo.error?.message ?? ''}`);
  });

  // ─── 9. Sin la tabla ──────────────────────────────────────────────────
  console.log('\n9. Sin la migracion 0021');
  const E9 = [
    'pagar da 409 nombrando drizzle/0021_pagos_de_nomina.sql, y la nomina sigue aprobada',
    'el GET no revienta: sin pago y dice que no hay tabla',
  ];
  await seccion(E9, async () => {
    const id = await aprobada('2026-06-01', '2026-06-15');
    const servicio = await import('../src/services/nomina/pagarNomina');
    const existe = (await todas(sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'pagos_de_nomina'`)).length === 1;
    if (!existe) throw new Error('precondicion: la base no tiene pagos_de_nomina (falta aplicar la 0021)');
    await db.execute(sql`ALTER TABLE pagos_de_nomina RENAME TO pagos_de_nomina_banco295`);
    servicio.olvidarTablaDePagos();
    try {
      const res = await pagar(id, transferencia);
      ok(E9[0], res.estado === 409 && /drizzle\/0021_pagos_de_nomina\.sql/.test(res.cuerpo.error?.message ?? '') && (await estado(id)) === 'approved',
        `${res.estado} ${res.cuerpo.error?.message ?? ''}`);
      const v = await ver(id);
      ok(E9[1], v.estado === 200 && v.cuerpo.data?.pago === null && v.cuerpo.data?.hayTabla === false, JSON.stringify(v.cuerpo));
    } finally {
      await db.execute(sql`ALTER TABLE pagos_de_nomina_banco295 RENAME TO pagos_de_nomina`);
      servicio.olvidarTablaDePagos();
    }
  });

  // ─── 10. Nada a medias ────────────────────────────────────────────────
  console.log('\n10. Si algo falla despues de escribir');
  const E10 = ['la auditoria forzada a fallar: ni pago, ni asiento, ni retiro, ni saldo movido, y sigue aprobada; sin el fallo, la misma se paga'];
  await seccion(E10, async () => {
    const id = await aprobada('2026-06-16', '2026-06-30');
    const saldoAntes = await saldoBanco(POPULAR);
    const asientosAntes = (await todas(sql`SELECT count(*)::int AS n FROM journal_entries WHERE company_id = ${A}::uuid`))[0].n;
    await db.execute(sql`CREATE OR REPLACE FUNCTION banco295_falla() RETURNS trigger AS $$
      BEGIN IF NEW.action = 'pay_payroll' THEN RAISE EXCEPTION 'banco 295: auditoria forzada a fallar'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER banco295_falla BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION banco295_falla()`);
    let fallo = '';
    try {
      const res = await pagar(id, { ...transferencia, referencia: 'TR-295-X' });
      const asientosDespues = (await todas(sql`SELECT count(*)::int AS n FROM journal_entries WHERE company_id = ${A}::uuid`))[0].n;
      const rs = (await retiros(POPULAR)).filter((x) => x.reference === 'TR-295-X');
      if (!(res.estado >= 400 && (await estado(id)) === 'approved' && (await pagos(id)).length === 0 && asientosDespues === asientosAntes
        && rs.length === 0 && (await saldoBanco(POPULAR)) === saldoAntes)) {
        fallo = `${res.estado}; estado ${await estado(id)}; ${rs.length} retiros; asientos ${asientosAntes}->${asientosDespues}`;
      }
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS banco295_falla ON audit_logs`);
      await db.execute(sql`DROP FUNCTION IF EXISTS banco295_falla()`);
    }
    // La marca del estado posterior: sin el fallo, la MISMA nomina se paga.
    const r2 = await pagar(id, { ...transferencia, referencia: 'TR-295-X' });
    ok(E10[0], fallo === '' && r2.estado === 200 && (await pagos(id)).length === 1, fallo || `despues: ${r2.estado} ${r2.cuerpo.error?.message ?? ''}`);
  });

  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(2), 300); });
