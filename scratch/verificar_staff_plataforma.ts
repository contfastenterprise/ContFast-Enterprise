/**
 * P0-01 + P0-03: 'sistemas' no es un rol de plataforma.
 *
 * LO QUE PASO
 * -----------
 * 'sistemas' es uno de los 6 roles ESTANDAR que se siembran en CADA empresa
 * nueva (utils/defaultRoles.ts) -- el "ingeniero de sistemas" de esa empresa
 * cliente, no un operador de la plataforma ContFast. Cinco endpoints solo
 * comprobaban el NOMBRE del rol:
 *
 *   GET  /api/v1/admin/companies                    -- lista TODAS las empresas
 *   POST /api/v1/auth/switch-company                -- emite sesion en CUALQUIER empresa
 *   PUT/DELETE /api/v1/admin/companies/[id]          -- edita/desactiva CUALQUIER empresa
 *   POST .../admin/companies/[id]/clear-sandbox      -- purga datos de CUALQUIER empresa
 *   GET  /api/v1/admin/subscriptions                 -- exponia la facturacion de TODAS
 *   POST /api/v1/admin/subscriptions                 -- asignaba suscripcion a CUALQUIER empresa
 *
 * Consecuencia real: el 'sistemas' de una empresa cliente cualquiera --
 * rol estandar, no excepcional -- podia leer, modificar o purgar datos de
 * facturacion, banca, nomina y contabilidad de CUALQUIER OTRA empresa.
 *
 * Se confirmo con el usuario que hoy SI se usa 'sistemas' para administrar
 * varias empresas desde una sola cuenta -- por eso el arreglo no es bloquear
 * el cruce de empresas, sino separar "tiene el rol sistemas" (por empresa) de
 * "es staff de la plataforma" (independiente de la empresa): una columna
 * nueva `is_platform_staff` en `users`, default false, firmada en el JWT
 * igual que el rol (requiere volver a iniciar sesion si cambia, igual que ya
 * pasa con un cambio de rol), y forwardeada por proxy.ts como cabecera para
 * las rutas excluidas de verifyAuth normal.
 *
 * Este banco comprueba el codigo fuente (sin tocar la base de datos ni
 * ejecutar nada). Contraprobado: revirtiendo cualquiera de los 6 guardias a
 * `role !== 'sistemas'` a secas, o quitando isPlatformStaff de cualquier
 * punto de la cadena JWT/proxy, la comprobacion correspondiente se pone roja.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n1) Columna is_platform_staff en el esquema\n');

const schema = fuente('src/db/schema/auth.ts');
ok("users tiene isPlatformStaff: boolean('is_platform_staff').default(false).notNull()",
  /isPlatformStaff:\s*boolean\('is_platform_staff'\)\.default\(false\)\.notNull\(\)/.test(schema));

console.log('\n2) Migracion 0048 -- agrega la columna, no activa a nadie\n');

const migracion = fuente('drizzle/0048_staff_de_plataforma.sql');
ok("agrega la columna is_platform_staff boolean not null default false",
  /ADD COLUMN is_platform_staff boolean NOT NULL DEFAULT false/.test(migracion));
ok("el UPDATE que activa una cuenta esta comentado (no se ejecuta solo)",
  /--\s*UPDATE public\.users/.test(migracion) && !/^\s*UPDATE public\.users/m.test(migracion));

console.log('\n3) middleware/auth.ts -- isPlatformStaff viaja por las 3 rutas de resolucion de sesion\n');

const authMw = fuente('src/middleware/auth.ts');
ok("AuthPayload declara isPlatformStaff: boolean",
  /isPlatformStaff:\s*boolean;/.test(authMw));
ok("rama de cabeceras de proxy interno: lee x-is-platform-staff",
  /req\.headers\.get\('x-is-platform-staff'\)/.test(authMw));
ok("rama de JWT de access token: decoded.isPlatformStaff || false",
  /isPlatformStaff:\s*decoded\.isPlatformStaff \|\| false/.test(authMw));
ok("rama de refresh: selecciona isPlatformStaff de la tabla users",
  /isPlatformStaff:\s*users\.isPlatformStaff/.test(authMw));
ok("rama de refresh: firma isPlatformStaff en el nuevo access token (aparece 2 veces: select + jwt.sign)",
  (authMw.match(/isPlatformStaff:\s*userWithRole\.isPlatformStaff/g) || []).length >= 2);
ok("createSession() consulta users.isPlatformStaff y lo firma en el access token",
  /select\(\{\s*isPlatformStaff:\s*users\.isPlatformStaff\s*\}\)/.test(authMw) &&
  /permissions:\s*permissionsList,\s*isPlatformStaff\s*\}/.test(authMw));

console.log('\n4) proxy.ts -- sanitiza y reenvia x-is-platform-staff\n');

const proxy = fuente('src/proxy.ts');
ok("x-is-platform-staff esta en la lista de cabeceras sanitizadas (rutas excluidas)",
  /'x-is-platform-staff',/.test(proxy));
ok("se fija en la rama principal de verificacion (decoded.isPlatformStaff)",
  /requestHeaders\.set\('x-is-platform-staff', String\(!!decoded\.isPlatformStaff\)\)/.test(proxy));
ok("se fija en la rama de rotacion de refresh (decodedNew.isPlatformStaff)",
  /requestHeaders\.set\('x-is-platform-staff', String\(!!decodedNew\.isPlatformStaff\)\)/.test(proxy));

console.log('\n5) Los 6 endpoints cruzados exigen esSistemas(role) Y isPlatformStaff\n');

const ENDPOINTS: { archivo: string; nota: string; ambos?: boolean }[] = [
  { archivo: 'src/app/api/v1/auth/switch-company/route.ts', nota: 'emite sesion en cualquier empresa' },
  { archivo: 'src/app/api/v1/admin/companies/route.ts', nota: 'GET+POST: lista/crea empresas', ambos: true },
  { archivo: 'src/app/api/v1/admin/companies/[id]/route.ts', nota: 'PUT+DELETE: edita/desactiva empresa', ambos: true },
  { archivo: 'src/app/api/v1/admin/companies/[id]/clear-sandbox/route.ts', nota: 'purga datos de sandbox' },
  { archivo: 'src/app/api/v1/admin/subscriptions/route.ts', nota: 'POST: asigna suscripcion', ambos: false },
];

const PATRON_NUEVO = /!esSistemas\(session\.role\)\s*\|\|\s*!session\.isPlatformStaff/g;
const PATRON_VIEJO_SUELTO = /session\.role\s*!==\s*'sistemas'/;

for (const e of ENDPOINTS) {
  const src = fuente(e.archivo);
  ok(`${e.archivo}: importa esSistemas de utils/rolMatch`, /from '@\/utils\/rolMatch'/.test(src), e.nota);
  const cuenta = (src.match(PATRON_NUEVO) || []).length;
  ok(`${e.archivo}: exige !esSistemas(role) || !isPlatformStaff${e.ambos ? ' (en ambos handlers)' : ''}`,
    e.ambos ? cuenta >= 2 : cuenta >= 1, `encontrado ${cuenta} vez(es)`);
  ok(`${e.archivo}: ya no queda el guardia viejo suelto (role !== 'sistemas' sin isPlatformStaff)`,
    !PATRON_VIEJO_SUELTO.test(src));
}

console.log('\n6) admin/subscriptions GET: limita por companyId salvo isPlatformStaff\n');

const subs = fuente('src/app/api/v1/admin/subscriptions/route.ts');
ok("la consulta de listado depende de session.isPlatformStaff (ternario)",
  /session\.isPlatformStaff\s*\n?\s*\?\s*await baseQuery\.orderBy/.test(subs));
ok("la rama sin staff de plataforma filtra por companyId de la sesion",
  /baseQuery\.where\(eq\(subscriptions\.companyId, session\.companyId\)\)/.test(subs));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
