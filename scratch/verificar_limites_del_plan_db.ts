/**
 * Lote 299, contra una base -- los limites de los planes.
 *
 * Integracion: base DESECHABLE (scratch/bancos_db), con candado. NUNCA contra el `.env`.
 *
 *   powershell -ExecutionPolicy Bypass -File scratch\bancos_db\base_desechable.ps1 -Accion correr -Bancos verificar_limites_del_plan_db.ts
 *
 * Ejecuta las rutas de verdad con las cabeceras internas firmadas, y el repositorio:
 *  · emitir con plan vigente pasa la guarda (y se para en la secuencia, que esta base no
 *    tiene: nada se emite de verdad); con plan vencido, 403 PLAN_VENCIDO;
 *  · la cuenta del mes: un borrador, PRUEBA, el mes pasado y las 21:00 de RD del ultimo dia
 *    del mes anterior NO cuentan; un rechazado SI; el e-CF 101 de un plan de 100, 409;
 *  · borrador + submit al pasarse, 409 y nada encolado; un rechazado que se reenvia no suma;
 *  · el usuario n+1 (alta y reactivacion), 409; dos altas a la vez: pasa UNA;
 *  · el almacen n+1, 409; `trialing` en su periodo permite;
 *  · asientos manuales (`accounting/journals`) y nomina con plan vencido, 403;
 *  · los avisos del panel se crean y se CIERRAN solos.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-299-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-299-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-299';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
//  Identificadores con la forma RFC (version 4): los de la semilla (`cccccccc-0000-0000-...`)
//  no la tienen y Zod 4 los rechaza en las rutas ("Invalid UUID").
const ALM = '29900000-0000-4000-8000-0000000000c1';
const PROD = '29900000-0000-4000-8000-0000000000b1';
const ROL_CAJERO = '29900000-0000-4000-8000-0000000000a1';
const PLAN = '29900000-0000-4000-8000-000000000001';
const SUB = '29900000-0000-4000-8000-000000000002';

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${!c && d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
const fin = () => {
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} (${total} comprobaciones)`);
  //  Un respiro antes de salir: en Windows, salir con conexiones cerrandose da el
  //  fallo de libuv del lote 235 y un rojo con todo en verde.
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
};

type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const cabeceras = (modo = 'PRODUCCION') => ({
  'x-user-id': USER, 'x-company-id': A, 'x-user-role': 'sistemas', 'x-role-id': ROL,
  'x-environment': modo, 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string,
  'content-type': 'application/json',
});
const pedir = async (h: Handler, metodo: string, url: string, cuerpo?: unknown, ctx?: unknown, modo = 'PRODUCCION') => {
  const res = await h(new NextRequest(`http://localhost${url}`, { method: metodo, headers: cabeceras(modo), body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }), ctx);
  let c: AnyRec = {};
  try { c = await res.json() as AnyRec; } catch { c = {}; }
  return { estado: res.status, code: (c.error?.code ?? null) as string | null, cuerpo: c };
};

async function main() {
  const E = [
    'plan vigente: la guarda de emision deja pasar (null)',
    '  y POST /invoices pasa la guarda del plan (se para en la secuencia, que no hay)',
    'plan VENCIDO: POST /invoices responde 403 PLAN_VENCIDO, sin console.error (no va a Sentry)',
    '  y guardar un BORRADOR sigue funcionando (201)',
    '  asientos manuales (accounting/journals) 403 PLAN_VENCIDO',
    '  calcular nomina (hr/payroll) 403 PLAN_VENCIDO',
    'la cuenta del mes: 99 (borrador, PRUEBA, mes pasado y las 21:00 RD del dia anterior al mes, fuera)',
    '  y el 100.º cabe (guarda en null)',
    'un RECHAZADO cuenta: con el, 100 de 100 y POST /invoices responde 409 LIMITE_ECF',
    '  emitir en PRUEBA con PRODUCCION llena: se deja',
    'borrador + submit con el cupo lleno: 409 LIMITE_ECF, nada encolado y sigue en borrador',
    '  reenviar (ecf/resubmit) un borrador con el cupo lleno: 409 LIMITE_ECF',
    '  reenviar un RECHAZADO que ya cuenta no suma: la guarda lo deja',
    'usuarios: el n+1 por la ruta, 409 LIMITE_USUARIOS',
    '  reactivar con el cupo lleno, 409 LIMITE_USUARIOS',
    '  dos altas a la vez con UN hueco: pasa exactamente una',
    'almacenes: el n+1, 409 LIMITE_ALMACENES con su code',
    'trialing en su periodo: emitir, asientos y almacenes pasan la guarda',
    'avisos: al 80 % se crea `ecf-80-<mes>` (warning) por el panel',
    '  al 100 % se cierra el del 80 % y se abre `ecf-limite-<mes>` (error)',
    '  vencido: `plan-vencido-<id>` (error); al renovar se cierran SOLOS',
    '  el alta de usuario ESPERA al candado de la empresa antes de contar',
    '  y el alta de almacen tambien',
  ];

  let R: AnyRec | null = null;
  let F: Record<string, Handler> | null = null;
  let D: Record<string, Handler> | null = null;
  let S: Record<string, Handler> | null = null;
  let RS: Record<string, Handler> | null = null;
  let J: Record<string, Handler> | null = null;
  let N: Record<string, Handler> | null = null;
  let U: Record<string, Handler> | null = null;
  let W: Record<string, Handler> | null = null;
  let Adm: AnyRec | null = null;
  let Dash: AnyRec | null = null;
  let Sinc: AnyRec | null = null;
  try {
    R = (await import('../src/services/suscripcion/planRepositorio')) as AnyRec;
    F = (await import('../src/app/api/v1/invoices/route')) as unknown as Record<string, Handler>;
    D = (await import('../src/app/api/v1/invoices/draft/route')) as unknown as Record<string, Handler>;
    S = (await import('../src/app/api/v1/invoices/[id]/submit/route')) as unknown as Record<string, Handler>;
    RS = (await import('../src/app/api/v1/ecf/[id]/resubmit/route')) as unknown as Record<string, Handler>;
    J = (await import('../src/app/api/v1/accounting/journals/route')) as unknown as Record<string, Handler>;
    N = (await import('../src/app/api/v1/hr/payroll/route')) as unknown as Record<string, Handler>;
    U = (await import('../src/app/api/v1/admin/users/route')) as unknown as Record<string, Handler>;
    W = (await import('../src/app/api/v1/warehouses/route')) as unknown as Record<string, Handler>;
    Adm = (await import('../src/repositories/adminRepository')) as AnyRec;
    Dash = (await import('../src/repositories/dashboardRepository')) as AnyRec;
    Sinc = (await import('../src/services/avisos/sincronizarAvisos')) as AnyRec;
  } catch (e) { R = null; console.log(`(no cargo: ${(e as Error).message})`); }
  if (!R) { for (const t of E) ok(t, false, 'no existe services/suscripcion/planRepositorio.ts'); return fin(); }

  //  Nada se emite de verdad: sin secuencia e-CF ni clave de mSeller, la emision se para
  //  en la validacion previa. Se comprueba antes de empezar.
  await db.execute(sql`DELETE FROM ecf_sequences WHERE company_id = ${A}::uuid`);
  const claves = await todas(sql`SELECT 1 FROM mseller_api_keys WHERE company_id = ${A}::uuid`);
  if (claves.length > 0) throw new Error('Precondicion: la empresa A tiene clave de mSeller; este banco no emite nada');

  //  El plan de A: 100 e-CF, 2 usuarios, 3 almacenes.
  const ahora = new Date();
  const { mesDeRD } = await import('../src/services/suscripcion/planVigente');
  const { desde } = mesDeRD(ahora);
  const plan = async (status: string, ini: string, fin: string, ecf = 100, usuarios = 2, almacenes = 3) => {
    await db.execute(sql`DELETE FROM subscriptions WHERE company_id = ${A}::uuid`);
    await db.execute(sql`DELETE FROM plans WHERE id = ${PLAN}::uuid`);
    await db.execute(sql`INSERT INTO plans (id, name, price, max_ecf_limit, max_users, max_warehouses) VALUES (${PLAN}::uuid, 'Plan 299', 0, ${ecf}, ${usuarios}, ${almacenes})`);
    await db.execute(sql`INSERT INTO subscriptions (id, company_id, plan_id, status, current_period_start, current_period_end) VALUES (${SUB}::uuid, ${A}::uuid, ${PLAN}::uuid, ${status}, ${ini}::timestamp, ${fin}::timestamp)`);
  };
  const diaRelativo = (dias: number) => new Date(ahora.getTime() + dias * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const vigente = () => plan('active', diaRelativo(-30), diaRelativo(60));
  const vencido = () => plan('active', diaRelativo(-60), diaRelativo(-2));

  //  Facturas sembradas a mano (sin emitir nada). `n` filas con un estado, modo e instante.
  let serie = 0;
  const facturas = async (n: number, status: string, modo: string, instante: Date) => {
    for (let i = 0; i < n; i++) {
      serie++;
      const ncf = status === 'draft' ? `DFT9${String(serie).padStart(9, '0')}` : `E3299${String(serie).padStart(8, '0')}`;
      await db.execute(sql`INSERT INTO invoices (company_id, modo, user_id, warehouse_id, ncf, ecf_type, status, created_at)
        VALUES (${A}::uuid, ${modo}, ${USER}::uuid, ${ALM}::uuid, ${ncf}, '32', ${status}, ${instante.toISOString()}::timestamptz AT TIME ZONE 'UTC')`);
    }
  };
  //  Repetible sin resembrar: primero lo que cuelga de las facturas de A.
  await db.execute(sql`DELETE FROM dgii_submissions WHERE company_id = ${A}::uuid`);
  await db.execute(sql`DELETE FROM invoice_taxes WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${A}::uuid)`);
  await db.execute(sql`DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${A}::uuid)`);
  await db.execute(sql`DELETE FROM invoices WHERE company_id = ${A}::uuid`);
  await db.execute(sql`DELETE FROM users WHERE company_id = ${A}::uuid AND email LIKE 'u299-%'`);
  await db.execute(sql`DELETE FROM warehouses WHERE id = ${ALM}::uuid`);
  await db.execute(sql`INSERT INTO warehouses (id, company_id, name, code) VALUES (${ALM}::uuid, ${A}::uuid, 'Almacen 299', 'A299-ALM')`);
  await db.execute(sql`DELETE FROM products WHERE id = ${PROD}::uuid`);
  await db.execute(sql`INSERT INTO products (id, company_id, sku, name, price, cost, tracks_inventory) VALUES (${PROD}::uuid, ${A}::uuid, 'P-299', 'Puerta 299', 1000, 100, false)`);
  await db.execute(sql`INSERT INTO roles (id, name, is_fixed) VALUES (${ROL_CAJERO}::uuid, 'cajero299', false) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`DELETE FROM notifications WHERE company_id = ${A}::uuid`);
  await borrarFacturas();

  async function borrarFacturas() {
    await db.execute(sql`DELETE FROM dgii_submissions WHERE company_id = ${A}::uuid`);
    await db.execute(sql`DELETE FROM invoice_taxes WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${A}::uuid)`);
    await db.execute(sql`DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${A}::uuid)`);
    await db.execute(sql`DELETE FROM invoices WHERE company_id = ${A}::uuid`);
  }

  const cuerpoFactura = {
    warehouseId: ALM, ecfType: '32', paymentType: 'cash',
    lines: [{ productId: PROD, productName: 'Puerta 299', quantity: 1, unitPrice: 1000, discount: 0, taxRate: 0.18 }],
  };

  // ---------------------------------------------------------------- vigente
  await vigente();
  ok(E[0], (await R.bloqueoDeEmision(A, 'PRODUCCION')) === null);
  const pasa = await pedir(F!.POST, 'POST', '/api/v1/invoices', cuerpoFactura);
  //  Llega a la validacion previa del comprobante (la segunda barrera del plan esta en
  //  `EcfValidator.runAll`, antes que la secuencia): sin secuencia, 422 y nada emitido.
  ok(E[1], pasa.estado === 422 && pasa.code === 'ECF_PRE_EMISSION_FAILED' && /secuencia/.test(pasa.cuerpo.error?.message ?? ''),`${pasa.estado} ${pasa.code} ${pasa.cuerpo.error?.message ?? ''}`);

  // ---------------------------------------------------------------- vencido
  await vencido();
  //  Un bloqueo del plan no es un error del servidor: la ruta lo contesta ANTES de
  //  emitir y sin `console.error`, que en produccion va a Sentry (lote 153). Si solo lo
  //  parase la segunda barrera (`EcfValidator.runAll`), la respuesta seria la misma
  //  pero cada intento abriria un incidente.
  const errorDeConsola = console.error;
  let errores = 0;
  console.error = () => { errores++; };
  let venc: Awaited<ReturnType<typeof pedir>>;
  try { venc = await pedir(F!.POST, 'POST', '/api/v1/invoices', cuerpoFactura); } finally { console.error = errorDeConsola; }
  ok(E[2], venc.estado === 403 && venc.code === 'PLAN_VENCIDO' && errores === 0, `${venc.estado} ${venc.code} console.error=${errores}`);
  const borr = await pedir(D!.POST, 'POST', '/api/v1/invoices/draft', cuerpoFactura);
  ok(E[3], borr.estado === 201 || (borr.estado === 200 && borr.cuerpo.success === true), `${borr.estado} ${borr.cuerpo.error?.message ?? ''}`);
  const asiento = await pedir(J!.POST, 'POST', '/api/v1/accounting/journals', { date: '2026-10-05', description: 'x', lines: [] });
  ok(E[4], asiento.estado === 403 && asiento.code === 'PLAN_VENCIDO', `${asiento.estado} ${asiento.code}`);
  const nom = await pedir(N!.POST, 'POST', '/api/v1/hr/payroll', { periodStart: '2026-10-01', periodEnd: '2026-10-15', paymentDate: '2026-10-15' });
  ok(E[5], nom.estado === 403 && nom.code === 'PLAN_VENCIDO', `${nom.estado} ${nom.code}`);
  await borrarFacturas();

  // ---------------------------------------------------------------- la cuenta
  await vigente();
  const dentro = new Date(Math.max(desde.getTime() + 60 * 60000, ahora.getTime() - 60 * 60000)); // este mes de RD
  await facturas(99, 'accepted', 'PRODUCCION', dentro);
  await facturas(5, 'draft', 'PRODUCCION', dentro);              // borradores: no cuentan
  await facturas(10, 'accepted', 'PRUEBA', dentro);               // PRUEBA: no cuenta
  await facturas(3, 'accepted', 'PRODUCCION', new Date(desde.getTime() - 20 * 86400000)); // mes pasado
  await facturas(1, 'accepted', 'PRODUCCION', new Date(desde.getTime() - 3 * 3600000));   // 21:00 RD del ultimo dia del mes anterior (01:00 UTC de este)
  const usados = await R.contarEcfDelMes(A, ahora);
  ok(E[6], usados === 99, `cuenta ${usados}`);
  ok(E[7], (await R.bloqueoDeEmision(A, 'PRODUCCION')) === null);
  await facturas(1, 'rejected', 'PRODUCCION', dentro);
  const lleno = await pedir(F!.POST, 'POST', '/api/v1/invoices', cuerpoFactura);
  ok(E[8], (await R.contarEcfDelMes(A, ahora)) === 100 && lleno.estado === 409 && lleno.code === 'LIMITE_ECF', `${lleno.estado} ${lleno.code}`);
  ok(E[9], (await R.bloqueoDeEmision(A, 'PRUEBA')) === null);

  // ---------------------------------------------------------------- submit y reenvio
  serie++;
  const [bor] = await todas(sql`INSERT INTO invoices (company_id, modo, user_id, warehouse_id, ncf, ecf_type, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER}::uuid, ${ALM}::uuid, ${`DFT8${String(serie).padStart(9, '0')}`}, '32', 'draft') RETURNING id`);
  const idBor = String(bor.id);
  const sub = await pedir(S!.POST, 'POST', `/api/v1/invoices/${idBor}/submit`, {}, { params: Promise.resolve({ id: idBor }) });
  const intentos = await todas(sql`SELECT 1 FROM dgii_submissions WHERE invoice_id = ${idBor}::uuid`);
  const [est] = await todas(sql`SELECT status FROM invoices WHERE id = ${idBor}::uuid`);
  ok(E[10], sub.estado === 409 && sub.code === 'LIMITE_ECF' && intentos.length === 0 && est.status === 'draft', `${sub.estado} ${sub.code} intentos=${intentos.length} ${est.status}`);
  const re = await pedir(RS!.POST, 'POST', `/api/v1/ecf/${idBor}/resubmit`, {}, { params: Promise.resolve({ id: idBor }) });
  ok(E[11], re.estado === 409 && re.code === 'LIMITE_ECF', `${re.estado} ${re.code}`);
  ok(E[12], (await R.bloqueoDeEmision(A, 'PRODUCCION', { modo: 'PRODUCCION', status: 'rejected' })) === null
    && (await R.bloqueoDeEmision(A, 'PRODUCCION', { modo: 'PRODUCCION', status: 'draft' }))?.code === 'LIMITE_ECF');

  // ---------------------------------------------------------------- usuarios
  //  A tiene 1 usuario activo (Ana). El plan permite 2.
  await db.execute(sql`DELETE FROM users WHERE company_id = ${A}::uuid AND id <> ${USER}::uuid`);
  const nuevoUsuario = (n: number) => ({ name: `Usuario 299 ${n}`, email: `u299-${n}@alfa.do`, passwordRaw: 'secreto299', roleId: ROL_CAJERO });
  const u1 = await pedir(U!.POST, 'POST', '/api/v1/admin/users', nuevoUsuario(1));
  const u2 = await pedir(U!.POST, 'POST', '/api/v1/admin/users', nuevoUsuario(2));
  ok(E[13], u1.estado === 201 && u2.estado === 409 && u2.code === 'LIMITE_USUARIOS', `${u1.estado} ${u2.estado} ${u2.code} ${u2.cuerpo.error?.message ?? ''}`);
  //  Reactivar: se desactiva el 1 desde la base, se ocupa el hueco y se intenta reactivar.
  const [fila1] = await todas(sql`SELECT id FROM users WHERE email = 'u299-1@alfa.do'`);
  await db.execute(sql`UPDATE users SET status = 'inactive' WHERE id = ${String(fila1.id)}::uuid`);
  const u3 = await pedir(U!.POST, 'POST', '/api/v1/admin/users', nuevoUsuario(3));
  let reactivar: AnyRec = {};
  try { await Adm!.AdminRepository.toggleUserStatus(String(fila1.id), A, 'sistemas'); reactivar = { code: 'SE_REACTIVO' }; } catch (e) { reactivar = e as AnyRec; }
  ok(E[14], u3.estado === 201 && reactivar.code === 'LIMITE_USUARIOS' && reactivar.status === 409, `${u3.estado} ${reactivar.code}`);
  //  Dos altas a la vez con UN hueco: se libera uno y se piden dos a la vez.
  await db.execute(sql`DELETE FROM users WHERE email = 'u299-3@alfa.do'`);
  //  Con UNA conexion abierta, postgres.js deja a la segunda transaccion esperando a la
  //  primera y la carrera no ocurre nunca: sin candado tambien pasaria una sola, y la
  //  comprobacion no mediria nada (lo cazo el mutante que quita el candado). Se abren
  //  antes varias conexiones para que las dos altas corran DE VERDAD a la vez.
  await Promise.all([1, 2, 3, 4].map(() => db.execute(sql`SELECT pg_sleep(0.05)`)));
  const dos = await Promise.allSettled([4, 5].map((n) => Adm!.AdminRepository.createUser({ ...nuevoUsuario(n), companyId: A })));
  const [activos] = await todas(sql`SELECT count(*)::int AS n FROM users WHERE company_id = ${A}::uuid AND status = 'active'`);
  const rechazo = dos.find((d) => d.status === 'rejected') as PromiseRejectedResult | undefined;
  ok(E[15], dos.filter((d) => d.status === 'fulfilled').length === 1 && Number(activos.n) === 2 && (rechazo?.reason as AnyRec)?.code === 'LIMITE_USUARIOS',
    `${dos.map((d) => d.status).join(',')} activos=${activos.n}`);

  //  La carrera de arriba depende de como reparta postgres.js las conexiones y no siempre
  //  se produce (un mutante sin candado sobrevivio a veces). Esta es DETERMINISTA: alguien
  //  sostiene el candado de la empresa 0,8 s y el alta tiene que ESPERARLO para contar.
  //  Sin candado, el alta contesta enseguida -- antes de que se suelte.
  const esperaAlCandado = async (alta: () => Promise<unknown>) => {
    let soltado = 0;
    let terminado = 0;
    const sostener = db.transaction(async (tx) => {
      await R!.bloquearLimitesDeLaEmpresa(tx, A);
      await tx.execute(sql`SELECT pg_sleep(0.8)`);
      soltado = Date.now();
    });
    await new Promise((r) => setTimeout(r, 150));
    const acabada = alta().then(() => { terminado = Date.now(); }, () => { terminado = Date.now(); });
    await Promise.all([sostener, acabada]);
    return { espero: soltado > 0 && terminado >= soltado, soltado, terminado };
  };
  const eu = await esperaAlCandado(() => Adm!.AdminRepository.createUser({ ...nuevoUsuario(6), companyId: A }));
  ok(E[21], eu.espero, `soltado ${eu.soltado} terminado ${eu.terminado}`);

  // ---------------------------------------------------------------- almacenes
  //  El plan permite los que hay MAS UNO: el primero cabe, el segundo no.
  await db.execute(sql`DELETE FROM warehouses WHERE company_id = ${A}::uuid AND code IN ('A299-1', 'A299-2', 'A299-3', 'A299-4')`);
  const [hay] = await todas(sql`SELECT count(*)::int AS n FROM warehouses WHERE company_id = ${A}::uuid`);
  await plan('active', diaRelativo(-30), diaRelativo(60), 100, 2, Number(hay.n) + 1);
  const w1 = await pedir(W!.POST, 'POST', '/api/v1/warehouses', { name: 'Tercero', code: 'A299-1' });
  const w2 = await pedir(W!.POST, 'POST', '/api/v1/warehouses', { name: 'Cuarto', code: 'A299-2' });
  ok(E[16], w1.estado === 201 && w2.estado === 409 && w2.code === 'LIMITE_ALMACENES', `${w1.estado} ${w2.estado} ${w2.code}`);
  const ea = await esperaAlCandado(() => pedir(W!.POST, 'POST', '/api/v1/warehouses', { name: 'Quinto', code: 'A299-4' }));
  ok(E[22], ea.espero, `soltado ${ea.soltado} terminado ${ea.terminado}`);

  // ---------------------------------------------------------------- trialing
  await plan('trialing', diaRelativo(-5), diaRelativo(25), 1000, 10, 10);
  const asientoT = await pedir(J!.POST, 'POST', '/api/v1/accounting/journals', { date: '2026-10-05', description: 'x', lines: [] });
  const w3 = await pedir(W!.POST, 'POST', '/api/v1/warehouses', { name: 'Prueba', code: 'A299-3' });
  ok(E[17], (await R.bloqueoDeEmision(A, 'PRODUCCION')) === null && asientoT.estado === 400 && asientoT.code === 'VALIDATION_ERROR' && w3.estado === 201,
    `asiento ${asientoT.estado} ${asientoT.code}, almacen ${w3.estado}`);

  // ---------------------------------------------------------------- avisos
  const panel = async () => {
    const stats = await Dash!.DashboardRepository.getStats(A, 'PRODUCCION') as AnyRec;
    await Sinc!.sincronizarAvisos(A, 'PRODUCCION', stats.alertsDetails ?? []);
  };
  const vivos = async () => (await todas(sql`SELECT clave, type FROM notifications WHERE company_id = ${A}::uuid AND modo = 'PRODUCCION' AND resolved_at IS NULL`))
    .map((f) => `${f.clave}:${f.type}`);
  const mes = mesDeRD(ahora).mes;
  //  Plan de 125 con 100 usados: 80 %.
  await plan('active', diaRelativo(-30), diaRelativo(60), 125);
  await panel();
  const v80 = await vivos();
  ok(E[18], v80.includes(`ecf-80-${mes}:warning`) && !v80.some((v) => v.startsWith('ecf-limite-')), v80.join(' '));
  await plan('active', diaRelativo(-30), diaRelativo(60), 100);
  await panel();
  const v100 = await vivos();
  ok(E[19], v100.includes(`ecf-limite-${mes}:error`) && !v100.some((v) => v.startsWith('ecf-80-')), v100.join(' '));
  await vencido();
  await panel();
  const vV = await vivos();
  await plan('active', diaRelativo(-1), diaRelativo(300), -1, -1, -1);
  await panel();
  const vR = await vivos();
  ok(E[20], vV.includes(`plan-vencido-${SUB}:error`) && !vR.some((v) => v.startsWith('plan-') || v.startsWith('ecf-')), `vencido: ${vV.join(' ')} | renovado: ${vR.join(' ')}`);

  //  Se deja A como la dejo la semilla: el plan sin limites de los bancos.
  await db.execute(sql`DELETE FROM subscriptions WHERE company_id = ${A}::uuid`);
  await db.execute(sql`DELETE FROM plans WHERE id = ${PLAN}::uuid`);
  await db.execute(sql`INSERT INTO plans (id, name, price, max_ecf_limit, max_users, max_warehouses) VALUES ('eeeeeeee-0000-0000-0000-000000000299', 'Plan de los bancos', 0, -1, -1, -1) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO subscriptions (company_id, plan_id, status, current_period_start, current_period_end) VALUES (${A}::uuid, 'eeeeeeee-0000-0000-0000-000000000299', 'active', '2026-01-01', '2099-12-31')`);
  return fin();
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(1), 300); });
