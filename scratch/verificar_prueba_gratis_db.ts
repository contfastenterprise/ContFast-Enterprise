/**
 * Lote 300, contra una base -- toda empresa nueva nace con su prueba gratis
 * (`trialing`, Plan Basico, 30 dias), y el guion se la da a las que no tenian.
 *
 * Integracion: base DESECHABLE (scratch/bancos_db), con candado. Ejecuta las rutas
 * de verdad (`POST /api/v1/auth/register` y el alta de Administracion), la funcion
 * `crearPruebaGratis` y el guion `scratch/_to_delete/prueba_gratis_empresas.ts`
 * (no versionado: si falta, sus comprobaciones dan FALLA). Lo que solo se ve
 * ejecutando:
 *  · el registro y Administracion dejan la empresa CON su prueba: una sola
 *    suscripcion, `trialing`, del Plan Basico, desde la medianoche de RD de hoy y
 *    30 dias;
 *  · una segunda llamada no crea otra;
 *  · si la alta falla despues de crear la prueba, no queda ni empresa ni prueba;
 *    y sin Plan Basico la alta falla entera, sin dejar empresa;
 *  · el guion: el ensayo no escribe, aplicar crea solo a las que no tenian, y
 *    aplicar otra vez no cambia nada.
 *
 *   powershell -File scratch\bancos_db\base_desechable.ps1 -Accion correr -Bancos verificar_prueba_gratis_db.ts -SinReiniciar
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-300-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-300-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-300';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { db } from '../src/db';
import { DEFAULT_COMPANY_ROLES } from '../src/utils/defaultRoles';

const ALFA = '11111111-1111-1111-1111-111111111111'; // semilla: Alfa SRL, sin suscripcion
const BETA = '22222222-2222-2222-2222-222222222222'; // semilla: Beta SRL
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';
const DIA = 24 * 60 * 60 * 1000;
const raiz = join(__dirname, '..');
const GUION = 'scratch/_to_delete/prueba_gratis_empresas.ts';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
const uno = async (q: ReturnType<typeof sql>) => (await todas(q))[0];
const fin = () => {
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
};

type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;
const sello = String(Date.now()).slice(-7);
const rncNuevo = (n: number) => `8${sello}${n}`;
let ipN = 0;
const ip = () => `10.300.${Math.floor(++ipN / 250)}.${ipN % 250}`;

/** Lo esperado, calculado aqui y no con la funcion del lote: el dia de RD de hoy. */
const inicioEsperado = () => new Date(`${new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)}T04:00:00.000Z`);

type Sus = { id: string; status: string; plan: string; inicio: string; fin: string };
//  Las columnas son `timestamp` SIN zona y guardan UTC (lote 174). Leidas en crudo
//  llegan como "2026-10-05 04:00:00", y `new Date` las tomaria como hora LOCAL de
//  quien corre el banco: se piden ya en ISO con su Z.
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
const suscripciones = async (companyId: string) => (await todas(sql`SELECT s.id::text id, s.status, p.name plan,
    to_char(s.current_period_start, ${ISO}) inicio, to_char(s.current_period_end, ${ISO}) fin
  FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.company_id = ${companyId}::uuid`)) as unknown as Sus[];
const esPrueba = (s: Sus[]) => {
  if (s.length !== 1) return false;
  const [x] = s;
  const ini = new Date(x.inicio); const fn = new Date(x.fin);
  return x.status === 'trialing' && x.plan === 'Plan Básico' && ini.getTime() === inicioEsperado().getTime()
    && fn.getTime() - ini.getTime() === 30 * DIA - 1;
};
const empresaPorRnc = async (rnc: string) => (await uno(sql`SELECT id::text id FROM companies WHERE rnc = ${rnc}`))?.id as string | undefined;
const cuenta = async (q: ReturnType<typeof sql>) => Number((await uno(q)).n);

function guion(...args: string[]) {
  if (!existsSync(join(raiz, GUION))) return { codigo: -1, salida: `falta ${GUION}` };
  const r = spawnSync(process.execPath, [join(raiz, 'node_modules/tsx/dist/cli.mjs'), '--import', './scratch/bancos_db/precarga.mts', GUION, ...args],
    { cwd: raiz, env: process.env, encoding: 'utf8' });
  return { codigo: r.status ?? -1, salida: `${r.stdout}${r.stderr}` };
}

async function main() {
  let reg: Record<string, Handler> | null = null;
  let admin: Record<string, Handler> | null = null;
  try { reg = (await import('../src/app/api/v1/auth/register/route')) as unknown as Record<string, Handler>; } catch { reg = null; }
  try { admin = (await import('../src/app/api/v1/admin/companies/route')) as unknown as Record<string, Handler>; } catch { admin = null; }
  if (!reg?.POST || !admin?.POST) throw new Error('Precondicion: faltan las rutas de registro o de Administracion');
  //  Precondicion de los dos estados: la semilla trae el Plan Basico y Alfa sin suscripcion.
  if (await cuenta(sql`SELECT count(*)::int n FROM plans WHERE name = 'Plan Básico'`) !== 1) throw new Error('Precondicion: la semilla no trae el Plan Básico');
  if (await cuenta(sql`SELECT count(*)::int n FROM subscriptions WHERE company_id = ${ALFA}::uuid`) !== 0) throw new Error('Precondicion: Alfa ya tiene suscripcion');

  for (const r of DEFAULT_COMPANY_ROLES) {
    await db.execute(sql`INSERT INTO roles (name, description, is_fixed) SELECT ${r.name}, ${r.description}, ${r.isFixed}
      WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = ${r.name})`);
  }
  const registrar = async (n: number) => {
    const res = await reg!.POST(new NextRequest('http://localhost/api/v1/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() },
      body: JSON.stringify({ razonSocial: `Prueba ${sello}-${n} S.R.L.`, rncEmpresa: rncNuevo(n), actividad: 'Comercio',
        fullName: `Dueño ${n}`, email: `dueno${n}.${sello}@prueba300.do`, password: 'secreto123' }),
    }));
    return res.status;
  };
  const altaAdmin = async (n: number) => {
    const res = await admin!.POST(new NextRequest('http://localhost/api/v1/admin/companies', {
      method: 'POST',
      headers: {
        'x-user-id': USER, 'x-company-id': ALFA, 'x-user-role': 'sistemas', 'x-role-id': ROL, 'x-is-platform-staff': 'true',
        'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string, 'content-type': 'application/json',
      },
      body: JSON.stringify({ name: `Admin ${sello}-${n}`, rnc: rncNuevo(n), email: `admin${n}@prueba300.do` }),
    }));
    return res.status;
  };

  console.log('\n1) Las altas crean la empresa con su prueba\n');
  const r1 = await registrar(1);
  const e1 = await empresaPorRnc(rncNuevo(1));
  const s1 = e1 ? await suscripciones(e1) : [];
  ok('el registro publico deja la empresa con UNA suscripcion trialing del Plan Básico, desde hoy (RD) y 30 dias',
    r1 === 200 && !!e1 && esPrueba(s1), `${r1} ${JSON.stringify(s1)}`);
  const r2 = await altaAdmin(2);
  const e2 = await empresaPorRnc(rncNuevo(2));
  const s2 = e2 ? await suscripciones(e2) : [];
  ok('el alta desde Administracion, igual', r2 === 200 && !!e2 && esPrueba(s2), `${r2} ${JSON.stringify(s2)}`);

  console.log('\n2) Una segunda llamada no duplica\n');
  let P: typeof import('../src/services/suscripcion/pruebaGratis') | null = null;
  try { P = await import('../src/services/suscripcion/pruebaGratis'); } catch { P = null; }
  if (!P || !e1) {
    ok('crearPruebaGratis sobre una empresa que ya tiene su prueba no crea otra', false, 'no existe la funcion o la empresa');
    ok('  dos llamadas a la vez sobre la misma empresa dejan UNA suscripcion', false, 'no existe la funcion o la empresa');
  } else {
    const r = await db.transaction((tx) => P!.crearPruebaGratis(tx, e1));
    ok('crearPruebaGratis sobre una empresa que ya tiene su prueba no crea otra',
      r.creada === false && (await suscripciones(e1)).length === 1, JSON.stringify(r));
    //  A la vez, sobre una empresa sin suscripcion: el bloqueo deja UNA.
    //  La primera se queda con su transaccion ABIERTA un momento despues de crear, y la
    //  segunda empieza mientras tanto: sin el bloqueo veria "sin suscripcion" (la de la
    //  primera aun no esta confirmada) y crearia otra. Con dos llamadas seguidas sin
    //  esa espera, la primera terminaba antes y el mutante sin FOR UPDATE sobrevivia.
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const [a, b] = await Promise.all([
      db.transaction(async (tx) => { const r = await P!.crearPruebaGratis(tx, BETA); await espera(400); return r; }),
      espera(100).then(() => db.transaction((tx) => P!.crearPruebaGratis(tx, BETA))),
    ]);
    ok('  dos llamadas a la vez sobre la misma empresa dejan UNA suscripcion',
      [a.creada, b.creada].filter(Boolean).length === 1 && (await suscripciones(BETA)).length === 1, `${a.creada} ${b.creada}`);
    //  Beta queda como la empresa que "ya tiene" para el guion: se le pone el estado de Latin Doors.
    await db.execute(sql`UPDATE subscriptions SET status = 'active', plan_id = (SELECT id FROM plans WHERE name = 'Plan Corporativo')
      WHERE company_id = ${BETA}::uuid`);
  }

  console.log('\n3) Si la alta falla, no queda ni empresa ni prueba\n');
  //  a) Falla DESPUES de crear la prueba (sin el rol de administracion, el registro
  //     lanza tras crearEmpresaConSuSiembra).
  const empAntes = await cuenta(sql`SELECT count(*)::int n FROM companies`);
  const susAntes = await cuenta(sql`SELECT count(*)::int n FROM subscriptions`);
  await db.execute(sql`UPDATE roles SET name = 'administracion_300' WHERE name = 'administracion'`);
  let r3: number | null = null;
  try { r3 = await registrar(3); } catch { r3 = null; } finally {
    await db.execute(sql`UPDATE roles SET name = 'administracion' WHERE name = 'administracion_300'`);
  }
  const empDespues = await cuenta(sql`SELECT count(*)::int n FROM companies`);
  const susDespues = await cuenta(sql`SELECT count(*)::int n FROM subscriptions`);
  const r3b = await registrar(3);
  const e3 = await empresaPorRnc(rncNuevo(3));
  ok('una alta que falla despues de crear la prueba no deja empresa ni suscripcion; la misma, repetida, entra con su prueba',
    (r3 ?? 500) >= 500 && empDespues === empAntes && susDespues === susAntes && r3b === 200 && !!e3 && esPrueba(await suscripciones(e3)),
    `1.º ${r3}, empresas ${empAntes}→${empDespues}, suscripciones ${susAntes}→${susDespues}; 2.º ${r3b}`);
  //  b) Sin Plan Basico la alta falla entera.
  await db.execute(sql`UPDATE plans SET name = 'Plan Básico_300' WHERE name = 'Plan Básico'`);
  let r4: number | null = null;
  try { r4 = await registrar(4); } catch { r4 = null; }
  let r5: number | null = null;
  try { r5 = await altaAdmin(5); } catch { r5 = null; } finally {
    await db.execute(sql`UPDATE plans SET name = 'Plan Básico' WHERE name = 'Plan Básico_300'`);
  }
  ok('sin Plan Básico ninguna de las dos altas deja una empresa (sin prueba) a medias',
    (r4 ?? 500) >= 500 && (r5 ?? 500) >= 500 && !(await empresaPorRnc(rncNuevo(4))) && !(await empresaPorRnc(rncNuevo(5))),
    `registro ${r4}, Administracion ${r5}`);

  console.log('\n4) El guion, en sus tres pasos\n');
  const sinAntes = (await todas(sql`SELECT c.name FROM companies c WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.company_id = c.id)`))
    .map((f) => String(f.name));
  const totalAntes = await cuenta(sql`SELECT count(*)::int n FROM subscriptions`);
  const g1 = guion();
  ok('el ensayo nombra a las que no tienen suscripcion (Alfa), no a la que ya tiene (Beta), y no escribe nada',
    g1.codigo === 0 && sinAntes.includes('Alfa SRL') && sinAntes.every((n) => g1.salida.includes(`SE CREARIA: ${n}`))
    && !g1.salida.includes('SE CREARIA: Beta SRL') && (await cuenta(sql`SELECT count(*)::int n FROM subscriptions`)) === totalAntes,
    g1.salida.slice(0, 400));
  const betaAntes = JSON.stringify(await suscripciones(BETA));
  const g2 = guion('--aplicar');
  ok('aplicar da su prueba a cada una de esas y no toca la que ya tenia',
    g2.codigo === 0 && esPrueba(await suscripciones(ALFA))
    && (await cuenta(sql`SELECT count(*)::int n FROM companies c WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.company_id = c.id)`)) === 0
    && (await cuenta(sql`SELECT count(*)::int n FROM subscriptions`)) === totalAntes + sinAntes.length
    && JSON.stringify(await suscripciones(BETA)) === betaAntes, g2.salida.slice(0, 400));
  const totalTras = await cuenta(sql`SELECT count(*)::int n FROM subscriptions`);
  const g3 = guion('--aplicar');
  ok('aplicar otra vez no cambia nada', g3.codigo === 0 && g3.salida.includes('Total: 0') && (await cuenta(sql`SELECT count(*)::int n FROM subscriptions`)) === totalTras,
    g3.salida.slice(0, 300));

  fin();
}

main().catch((e) => { console.error(e); fallos++; fin(); });
