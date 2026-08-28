/**
 * `role_permissions` se resolvia solo por `roleId`, y `roles` es GLOBAL.
 *
 * El esquema lo dice todo:
 *
 *   roles                       sin company_id. Catalogo global del sistema.
 *   role_permissions            UNIQUE (company_id, role_id, permission_id)
 *
 * O sea: para el MISMO roleId hay una fila por empresa. Cada empresa decide que
 * puede hacer su rol "cajero". Pero `hasPermission` buscaba asi:
 *
 *   .where(and(eq(rolePermissions.roleId, roleId), ...))   .limit(1)
 *
 * Sin `companyId` y con `limit(1)` sin orden. La decision de autorizacion la
 * podia resolver la fila de OTRA empresa.
 *
 * Consecuencia en las dos direcciones:
 *   - la empresa A concede contabilidad:write a "cajero" -> el cajero de la
 *     empresa B entra en contabilidad sin que su administrador se lo diera.
 *   - la empresa A se lo niega -> el cajero de B pierde un acceso legitimo.
 *
 * `RbacService.getUserPermissions` tenia el mismo fallo y ademas SIN `limit`,
 * asi que volcaba las filas de todas las empresas en un Map donde ganaba la
 * ultima. Esa lista se firma dentro del JWT al iniciar sesion, asi que el
 * permiso ajeno quedaba ademas guardado en el token.
 *
 * `user_permissions` no tiene este problema: su indice unico es
 * (user_id, permission_id), una sola fila por usuario, y el usuario pertenece a
 * una empresa. Se comprueba igualmente mas abajo.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { hasPermission } from '../src/middleware/permissions';
import { RbacService } from '../src/services/auth/rbacService';

const A = '11111111-1111-1111-1111-111111111111'; // Alfa
const B = '22222222-2222-2222-2222-222222222222'; // Beta
const ROL_CAJERO = 'eeeeeeee-0000-0000-0000-000000000001'; // global, compartido
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function permisoId(modulo: string, accion: string): Promise<string> {
  const r = await db.execute(sql`
    INSERT INTO permissions (module, action) VALUES (${modulo}, ${accion})
    ON CONFLICT (module, action) DO UPDATE SET action = EXCLUDED.action
    RETURNING id
  `);
  return (r as unknown as { id: string }[])[0].id;
}

async function main() {
  await db.execute(sql`DELETE FROM role_permissions`);
  await db.execute(sql`DELETE FROM user_permissions`);
  await db.execute(sql`
    INSERT INTO roles (id, name, is_fixed) VALUES (${ROL_CAJERO}::uuid, 'cajero', false)
    ON CONFLICT (id) DO UPDATE SET name = 'cajero'
  `);
  // Los dos usuarios comparten el rol global, cada uno en su empresa.
  await db.execute(sql`UPDATE users SET role_id = ${ROL_CAJERO}::uuid WHERE id IN (${USER_A}::uuid, ${USER_B}::uuid)`);

  const contaWrite = await permisoId('contabilidad', 'write');
  const bancoRead = await permisoId('banco', 'read');

  console.log('\n1) La empresa A concede contabilidad:write a su rol cajero\n');
  await db.execute(sql`
    INSERT INTO role_permissions (company_id, role_id, permission_id, granted)
    VALUES (${A}::uuid, ${ROL_CAJERO}::uuid, ${contaWrite}::uuid, true)
  `);
  // La empresa B no tiene fila: su cajero NO deberia poder.

  const cajeroA = await hasPermission(USER_A, 'cajero', ROL_CAJERO, A, 'contabilidad', 'write');
  ok('el cajero de A si puede (control: la concesion funciona)', cajeroA === true, String(cajeroA));

  const cajeroB = await hasPermission(USER_B, 'cajero', ROL_CAJERO, B, 'contabilidad', 'write');
  ok('el cajero de B NO hereda el permiso de A', cajeroB === false, String(cajeroB));

  console.log('\n2) Y al reves: A lo NIEGA, B lo tiene concedido\n');
  await db.execute(sql`DELETE FROM role_permissions`);
  await db.execute(sql`
    INSERT INTO role_permissions (company_id, role_id, permission_id, granted) VALUES
      (${A}::uuid, ${ROL_CAJERO}::uuid, ${bancoRead}::uuid, false),
      (${B}::uuid, ${ROL_CAJERO}::uuid, ${bancoRead}::uuid, true)
  `);
  const bancoB = await hasPermission(USER_B, 'cajero', ROL_CAJERO, B, 'banco', 'read');
  ok('la negacion de A no le quita el acceso legitimo a B', bancoB === true, String(bancoB));

  const bancoA = await hasPermission(USER_A, 'cajero', ROL_CAJERO, A, 'banco', 'read');
  ok('y A sigue teniendolo negado', bancoA === false, String(bancoA));

  console.log('\n3) Los permisos que se firman en el JWT al iniciar sesion\n');
  await db.execute(sql`DELETE FROM role_permissions`);
  await db.execute(sql`
    INSERT INTO role_permissions (company_id, role_id, permission_id, granted) VALUES
      (${A}::uuid, ${ROL_CAJERO}::uuid, ${contaWrite}::uuid, true)
  `);
  const permisosB = await RbacService.getUserPermissions(USER_B, 'cajero', ROL_CAJERO, B);
  ok('la sesion de B no lleva contabilidad:write de A',
    !permisosB.includes('contabilidad:write'), JSON.stringify(permisosB));

  const permisosA = await RbacService.getUserPermissions(USER_A, 'cajero', ROL_CAJERO, A);
  ok('pero la de A si lo lleva (control)',
    permisosA.includes('contabilidad:write'), JSON.stringify(permisosA));

  console.log('\n4) user_permissions: una fila por usuario, no deberia cruzar\n');
  await db.execute(sql`DELETE FROM role_permissions`);
  await db.execute(sql`
    INSERT INTO user_permissions (company_id, user_id, permission_id, granted)
    VALUES (${A}::uuid, ${USER_A}::uuid, ${contaWrite}::uuid, true)
  `);
  const usrB = await hasPermission(USER_B, 'cajero', ROL_CAJERO, B, 'contabilidad', 'write');
  ok('la excepcion personal de un usuario de A no alcanza a B', usrB === false, String(usrB));
  const usrA = await hasPermission(USER_A, 'cajero', ROL_CAJERO, A, 'contabilidad', 'write');
  ok('y si alcanza a su dueno (control)', usrA === true, String(usrA));

  console.log('\n5) El rol fijo sigue mandando por encima de todo\n');
  const sistemas = await hasPermission(USER_B, 'sistemas', ROL_CAJERO, B, 'contabilidad', 'write');
  ok('sistemas conserva acceso total', sistemas === true, String(sistemas));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
