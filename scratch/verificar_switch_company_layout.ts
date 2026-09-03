/**
 * Bug reportado (2026-09-03): un 'sistemas' que cambia de empresa via
 * switch-company veia el selector y el header de vuelta en su empresa de
 * origen en cuanto recargaba la pagina.
 *
 * LO QUE PASABA
 * -------------
 * `switch-company` nunca toca `users.company_id` -- ese campo es el HOGAR
 * fijo del usuario. Lo que cambia en cada switch es el `companyId` firmado
 * dentro del JWT de la sesion (`middleware/auth.ts`, `createSession`). Las
 * rutas /api/* leen bien ese valor via `verifyAuth`/`auth.companyId` (así
 * es como `/api/v1/auth/me` ya lo hacia correctamente). Pero
 * `src/app/dashboard/layout.tsx` -- el componente de servidor que arma el
 * `initialUser` para toda la sesion del navegador -- decodificaba el JWT
 * solo para sacar `decoded.userId`, y despues volvia a resolver TODO lo
 * demas (companyId incluido) desde la fila de `users` en la base de datos.
 * Como `users.companyId` nunca cambia, cada recarga de pagina deshacia el
 * cambio de empresa en el selector (`user?.companyId === c.id`, en
 * new-app-sidebar.tsx) y en el header (el nombre de empresa sale de
 * `CompanyRepository.getProfile(user.companyId)`, tambien mal apuntado).
 *
 * Este banco comprueba el codigo fuente (sin ejecutar nada). Contraprobado:
 * revirtiendo `companyIdActivo` de vuelta a `user.companyId` en cualquiera
 * de los 3 usos, la comprobacion correspondiente se pone roja.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const layout = fuente('src/app/dashboard/layout.tsx');

ok("resuelve la empresa activa desde el JWT (decoded.companyId), con la fila de usuario solo como respaldo",
  /const companyIdActivo = decoded\.companyId \|\| user\.companyId;/.test(layout));
ok("los permisos se calculan contra la empresa activa, no el hogar del usuario",
  /RbacService\.getUserPermissions\(user\.id, user\.role, user\.roleId, companyIdActivo\)/.test(layout));
ok("initialUser.companyId es la empresa activa",
  /companyId: companyIdActivo,/.test(layout));
ok("los ajustes y el nombre de empresa del header salen de la empresa activa",
  /CompanyRepository\.getSettings\(companyIdActivo\)/.test(layout) && /CompanyRepository\.getProfile\(companyIdActivo\)/.test(layout));
ok("ya no queda ningun uso de user.companyId para resolver ajustes o permisos (solo como respaldo del fallback de arriba)",
  (layout.match(/user\.companyId/g) || []).length === 1);

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
