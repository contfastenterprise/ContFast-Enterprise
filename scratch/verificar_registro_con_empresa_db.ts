/**
 * Lote 287, contra una base -- el registro publico crea la empresa con SU nombre y
 * SU RNC, y un RNC que ya tiene empresa nunca da acceso a ella.
 *
 * Integracion: base DESECHABLE (scratch/bancos_db), con candado. Ejecuta las rutas
 * de verdad (`POST /api/v1/auth/register`, la consulta publica del padron y el alta
 * de Administracion). Lo que solo se ve ejecutando:
 *  · la empresa nace con la razon social y el RNC enviados, con sus ajustes y su
 *    nomina (lo que Administracion sembraba y el registro no), catalogo y periodos;
 *  · el usuario queda como administracion de ESA empresa;
 *  · un RNC con empresa da 409 y no crea nada -- ni empresa ni usuario --, y dos
 *    registros a la vez con el mismo RNC dejan UNA empresa;
 *  · `rnc` (el "unirme a una empresa existente" de F0-02) se rechaza con 403 aunque
 *    venga solo, sin validar el resto;
 *  · si el alta falla a medias, no queda una empresa sin usuario;
 *  · "Buscar DGII" funciona sin sesion;
 *  · Administracion aplica la misma regla (un RNC con guiones de una empresa que ya
 *    existe tambien es un repetido).
 *
 *   powershell -File scratch\bancos_db\base_desechable.ps1 -Accion correr -Bancos verificar_registro_con_empresa_db.ts -SinReiniciar
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-287-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-287-refresh';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'banco-lote-287';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { DEFAULT_COMPANY_ROLES } from '../src/utils/defaultRoles';

const ALFA = '11111111-1111-1111-1111-111111111111'; // semilla: Alfa SRL, RNC 101000001
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ROL = 'aaaaaaaa-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
//  Cierto antes y despues del lote: como ok() regalaria un OK en la contraprueba.
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); fallos++; return; }
  console.log(`  inv   ${t}`);
};
const todas = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Record<string, unknown>[];
const uno = async (q: ReturnType<typeof sql>) => (await todas(q))[0];
const fin = () => {
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`}`);
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
};

type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;

//  RNC y correos de ESTA corrida: el banco se puede repetir sin resembrar.
const sello = String(Date.now()).slice(-7);
const rncNuevo = (n: number) => `9${sello}${n}`; // 9 digitos
let ipN = 0;
//  Una IP por peticion: el limite 'auth' (5/min por IP) cuenta en memoria aunque no
//  haya Redis, y este banco hace mas de cinco.
const ip = () => `10.287.${Math.floor(++ipN / 250)}.${ipN % 250}`;

async function main() {
  const E = [
    'la empresa nace con la razon social y el RNC enviados (sin guiones), activa',
    '  con sus ajustes (PRUEBA) y su nomina, como las de Administracion, ademas de catalogo y periodos',
    'el usuario queda como administracion de SU empresa',
    'un RNC que ya tiene empresa da 409 y no crea ni empresa ni usuario',
    '  tambien escrito con guiones',
    'dos registros a la vez con el mismo RNC dejan UNA empresa: el otro, 409',
    '`rnc` (unirse, F0-02) da 403 aunque venga solo, sin validar el resto',
    'si el alta falla a medias no queda una empresa sin usuario',
    '"Buscar DGII" funciona sin sesion y trae la razon social del padron',
    'Administracion rechaza con 409 el RNC de una empresa que ya existe, aunque lleve guiones',
  ];
  let reg: Record<string, Handler> | null = null;
  let buscar: Record<string, Handler> | null = null;
  let admin: Record<string, Handler> | null = null;
  try { reg = (await import('../src/app/api/v1/auth/register/route')) as unknown as Record<string, Handler>; } catch { reg = null; }
  try { buscar = (await import('../src/app/api/v1/auth/register/rnc/[rnc]/route')) as unknown as Record<string, Handler>; } catch { buscar = null; }
  try { admin = (await import('../src/app/api/v1/admin/companies/route')) as unknown as Record<string, Handler>; } catch { admin = null; }
  if (!reg?.POST || !admin?.POST) throw new Error('Precondicion: faltan las rutas de registro o de Administracion');

  //  Los roles globales de la aplicacion (la semilla solo trae 'admin'): en
  //  produccion existen, y el registro necesita el de administracion.
  for (const r of DEFAULT_COMPANY_ROLES) {
    await db.execute(sql`INSERT INTO roles (name, description, is_fixed) SELECT ${r.name}, ${r.description}, ${r.isFixed}
      WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = ${r.name})`);
  }

  const registrar = async (cuerpo: Record<string, unknown>) => {
    const res = await reg!.POST(new NextRequest('http://localhost/api/v1/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() }, body: JSON.stringify(cuerpo),
    }));
    return { estado: res.status, cuerpo: (await res.json()) as { success?: boolean; error?: { code?: string; message?: string } } };
  };
  const cuerpo = (n: number, extra: Record<string, unknown> = {}) => ({
    razonSocial: `Ferreteria ${sello}-${n} S.R.L.`, rncEmpresa: rncNuevo(n), actividad: 'Venta de herramientas',
    fullName: `Dueño ${n}`, email: `dueno${n}.${sello}@registro.do`, password: 'secreto123', ...extra,
  });
  const empresas = async (rnc: string) => (await todas(sql`SELECT id::text, name, rnc, status, business_activity FROM companies WHERE regexp_replace(rnc, '[^0-9]', '', 'g') = ${rnc}`)) as
    { id: string; name: string; rnc: string; status: string; business_activity: string | null }[];
  const usuarios = async (email: string) => (await todas(sql`SELECT u.company_id::text c, r.name rol FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ${email}`)) as { c: string; rol: string }[];

  //  1. Alta normal, con el RNC escrito con guiones.
  const c1 = cuerpo(1, { rncEmpresa: `${rncNuevo(1).slice(0, 3)}-${rncNuevo(1).slice(3, 8)}-${rncNuevo(1).slice(8)}` });
  const r1 = await registrar(c1);
  const e1 = await empresas(rncNuevo(1));
  ok(E[0], r1.estado === 200 && e1.length === 1 && e1[0].name === c1.razonSocial && e1[0].rnc === rncNuevo(1) && e1[0].status === 'active'
    && e1[0].business_activity === 'Venta de herramientas', `${r1.estado} ${r1.cuerpo.error?.message ?? ''} ${JSON.stringify(e1)}`);
  if (e1.length === 1) {
    const s = await uno(sql`SELECT
      (SELECT dgii_env FROM company_settings WHERE company_id = ${e1[0].id}::uuid) entorno,
      (SELECT count(*)::int FROM payroll_configs WHERE company_id = ${e1[0].id}::uuid) nomina,
      (SELECT count(*)::int FROM chart_of_accounts WHERE company_id = ${e1[0].id}::uuid) cuentas,
      (SELECT count(*)::int FROM accounting_periods WHERE company_id = ${e1[0].id}::uuid) periodos`);
    ok(E[1], s.entorno === 'PRUEBA' && s.nomina === 1 && Number(s.cuentas) > 10 && Number(s.periodos) > 0, JSON.stringify(s));
  } else ok(E[1], false, 'no se creo la empresa');
  const u1 = await usuarios(c1.email);
  ok(E[2], u1.length === 1 && e1.length === 1 && u1[0].c === e1[0].id && u1[0].rol === 'administracion', JSON.stringify(u1));

  //  2. Repetido.
  const c2 = cuerpo(2, { rncEmpresa: rncNuevo(1) });
  const r2 = await registrar(c2);
  ok(E[3], r2.estado === 409 && r2.cuerpo.error?.code === 'RNC_YA_REGISTRADO' && (await empresas(rncNuevo(1))).length === 1
    && (await usuarios(c2.email)).length === 0, `${r2.estado} ${r2.cuerpo.error?.message ?? ''}`);
  //  Alfa SRL, de la semilla, escrito con guiones: tampoco da acceso ni crea otra.
  const c3 = cuerpo(3, { rncEmpresa: '101-00000-1' });
  const r3 = await registrar(c3);
  //  Y al reves: una empresa que Administracion guardo CON guiones antes de este lote
  //  (la columna admite 11 caracteres) tambien cuenta, aunque se escriba sin ellos.
  const rncLegado = rncNuevo(6);
  const legado = `${rncLegado.slice(0, 3)}-${rncLegado.slice(3, 8)}-${rncLegado.slice(8)}`;
  await db.execute(sql`INSERT INTO companies (name, rnc) VALUES ('Legado con guiones', ${legado})`);
  const r3b = await registrar(cuerpo(6));
  ok(E[4], r3.estado === 409 && (await usuarios(c3.email)).length === 0 && (await empresas('101000001')).length === 1
    && r3b.estado === 409 && (await empresas(rncLegado)).length === 1 && (await usuarios(cuerpo(6).email)).length === 0,
    `${r3.estado} ${r3.cuerpo.error?.message ?? ''} / legado: ${r3b.estado}`);

  //  3. Dos a la vez.
  const [ra, rb] = await Promise.all([registrar(cuerpo(4)), registrar(cuerpo(5, { rncEmpresa: rncNuevo(4) }))]);
  const estados = [ra.estado, rb.estado].sort().join(',');
  ok(E[5], estados === '200,409' && (await empresas(rncNuevo(4))).length === 1, `${estados} ${ra.cuerpo.error?.message ?? ''} ${rb.cuerpo.error?.message ?? ''}`);

  //  4. F0-02.
  const r6 = await registrar({ rnc: '101000001' });
  const r7 = await registrar({ ...cuerpo(7), rnc: '101000001' });
  ok(E[6], r6.estado === 403 && r6.cuerpo.error?.code === 'REGISTRATION_CLOSED', `${r6.estado} ${r6.cuerpo.error?.message ?? ''}`);
  invariante('`rnc` con un cuerpo completo da 403 y no toca la empresa ni crea usuario',
    r7.estado === 403 && (await usuarios(cuerpo(7).email)).length === 0 && (await usuarios('ana@alfa.do')).length === 1,
    `${r7.estado}`);

  //  5. Fallo a medias: sin el rol de administracion, el alta falla DESPUES de crear la empresa.
  //  Y despues, con el rol de vuelta, el MISMO registro entra: prueba que el primero
  //  llego a crear la empresa (y la deshizo) en vez de fallar antes de tocar nada, y
  //  que no dejo una empresa a medias que ahora lo bloquearia con un 409.
  const antes = Number((await uno(sql`SELECT count(*)::int n FROM companies`)).n);
  await db.execute(sql`UPDATE roles SET name = 'administracion_287' WHERE name = 'administracion'`);
  let r8: Awaited<ReturnType<typeof registrar>> | null = null;
  try { r8 = await registrar(cuerpo(8)); } catch { r8 = null; } finally {
    await db.execute(sql`UPDATE roles SET name = 'administracion' WHERE name = 'administracion_287'`);
  }
  const despues = Number((await uno(sql`SELECT count(*)::int n FROM companies`)).n);
  const r8b = await registrar(cuerpo(8));
  const e8 = await empresas(rncNuevo(8));
  ok(E[7], (r8?.estado ?? 500) >= 500 && despues === antes && r8b.estado === 200 && e8.length === 1
    && (await usuarios(cuerpo(8).email)).length === 1,
    `1.º ${r8?.estado}, empresas ${antes}→${despues}; 2.º ${r8b.estado} ${r8b.cuerpo.error?.message ?? ''}, con ese RNC: ${e8.length}`);

  //  6. Buscar DGII, sin sesion.
  const rncPadron = rncNuevo(9);
  await db.execute(sql`DELETE FROM rnc_padron WHERE rnc = ${rncPadron}`);
  await db.execute(sql`INSERT INTO rnc_padron (rnc, nombre, nombre_comercial, estado, actividad) VALUES (${rncPadron}, 'CONSTRUCTORA DEL PADRON SRL', '', 'ACTIVO', 'CONSTRUCCION')`);
  let b: { estado: number; cuerpo: { success?: boolean; data?: { nombre?: string } } } | null = null;
  if (buscar?.GET) {
    const res = await buscar.GET(new NextRequest(`http://localhost/api/v1/auth/register/rnc/${rncPadron}`, { headers: { 'x-forwarded-for': ip() } }),
      { params: Promise.resolve({ rnc: rncPadron }) });
    b = { estado: res.status, cuerpo: await res.json() };
  }
  await db.execute(sql`DELETE FROM rnc_padron WHERE rnc = ${rncPadron}`);
  ok(E[8], b?.estado === 200 && b.cuerpo.success === true && b.cuerpo.data?.nombre === 'CONSTRUCTORA DEL PADRON SRL', JSON.stringify(b));

  //  7. Administracion, la misma regla.
  const resA = await admin.POST(new NextRequest('http://localhost/api/v1/admin/companies', {
    method: 'POST',
    headers: {
      'x-user-id': USER, 'x-company-id': ALFA, 'x-user-role': 'sistemas', 'x-role-id': ROL, 'x-is-platform-staff': 'true',
      'x-environment': 'PRODUCCION', 'x-internal-proxy-signature': process.env.INTERNAL_API_KEY as string, 'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Alfa otra vez', rnc: '101-00000-1', email: 'otra@alfa.do' }),
  }));
  ok(E[9], resA.status === 409 && (await empresas('101000001')).length === 1, `${resA.status} ${JSON.stringify(await resA.json())}`);

  fin();
}

main().catch((e) => { console.error(e); fallos++; fin(); });
