/**
 * La puerta de fuera: que `anon` y `authenticated` no puedan tocar `public`.
 *
 * QUE PASO
 * --------
 * Los roles publicos de Supabase -- a los que mapea la clave anonima -- tenian
 * SELECT/INSERT/UPDATE/DELETE/TRUNCATE sobre 92 tablas, 80 de ellas sin RLS, y
 * la Data API respondiendo. Se cerro, y la migracion 0037 deja el cierre
 * escrito para que una base reconstruida desde las migraciones nazca cerrada.
 *
 * ESTE BANCO EXISTE POR UNA RAZON CONCRETA
 * ----------------------------------------
 * Una tabla nueva nace SIN politica. Los permisos por defecto ya la dejan sin
 * acceso, asi que no es una brecha, pero se queda sin la tercera capa y nadie
 * se entera. Aqui se entera: si una migracion futura anade una tabla y no se
 * vuelve a pasar la 0037 (que es idempotente), esto falla.
 *
 * Se comprueba de verdad, con `SET ROLE anon`, no leyendo el catalogo: el
 * catalogo dice lo que se configuro, la consulta dice lo que ocurre.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const filas = async <T>(q: any) => (await db.execute(q)) as unknown as T[];

async function main() {
  const [{ n: rolesPublicos }] = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`);

  if (rolesPublicos === 0) {
    console.log('\nEsta base no tiene los roles `anon`/`authenticated` (no es Supabase).');
    console.log('No hay puerta publica que comprobar. Banco omitido.\n');
    process.exit(0);
  }

  console.log('\n1) Ningun permiso concedido a los roles publicos\n');

  const permisos = await filas<{ grantee: string; privilege_type: string; n: number }>(sql`
    SELECT grantee, privilege_type, count(*)::int AS n
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
     GROUP BY 1, 2 ORDER BY 1, 2`);
  ok('0 permisos sobre tablas y vistas', permisos.length === 0,
    permisos.map(p => `${p.grantee}:${p.privilege_type}x${p.n}`).join(' '));

  const secuencias = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM information_schema.role_usage_grants
     WHERE object_schema = 'public' AND grantee IN ('anon', 'authenticated')`);
  ok('0 permisos sobre secuencias', secuencias[0].n === 0, String(secuencias[0].n));

  // Esto es lo que hace que el cierre no caduque. Sin esto, la proxima tabla
  // nace abierta y nadie lo nota.
  const porDefecto = await filas<{ defaclrole: string; defaclacl: string }>(sql`
    SELECT pg_get_userbyid(d.defaclrole) AS defaclrole, d.defaclacl::text AS defaclacl
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public'
       AND (d.defaclacl::text LIKE '%anon=%' OR d.defaclacl::text LIKE '%authenticated=%')`);
  ok('ningun permiso POR DEFECTO para tablas futuras', porDefecto.length === 0,
    porDefecto.map(d => d.defaclrole).join(', '));

  console.log('\n2) Todas las tablas tienen RLS y la politica que niega\n');

  const sinRls = await filas<{ relname: string }>(sql`
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
     ORDER BY 1`);
  ok('ninguna tabla sin RLS', sinRls.length === 0,
    sinRls.length ? `faltan ${sinRls.length}: ${sinRls.slice(0, 5).map(t => t.relname).join(', ')} -- vuelve a pasar la 0037` : '');

  const sinPolitica = await filas<{ relname: string }>(sql`
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname
                          AND p.policyname = 'sin_acceso_publico')
     ORDER BY 1`);
  ok('ninguna tabla sin `sin_acceso_publico`', sinPolitica.length === 0,
    sinPolitica.length ? `faltan ${sinPolitica.length}: ${sinPolitica.slice(0, 5).map(t => t.relname).join(', ')} -- vuelve a pasar la 0037` : '');

  // El detalle que decide si la 0037 protege o abre. Una politica PERMISSIVE
  // que devuelve false se OR-ea con cualquier otra politica permisiva de la
  // tabla; la 0024 dejo 35 politicas `tenant_isolation_policy` que PERMITEN
  // cuando no hay contexto -- y una peticion publica nunca lo pone. Comprobado
  // sobre `expenses`: con PERMISSIVE `anon` veia 1 fila, con RESTRICTIVE ve 0.
  // Activar RLS con la politica permisiva habria abierto lo que venia a cerrar.
  const permisivas = await filas<{ tablename: string }>(sql`
    SELECT tablename FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'sin_acceso_publico' AND permissive <> 'RESTRICTIVE'
     ORDER BY 1`);
  ok('todas son RESTRICTIVE, no PERMISSIVE', permisivas.length === 0,
    permisivas.slice(0, 5).map(t => t.tablename).join(', '));

  // Sin FORCE es lo que permite que la aplicacion (duena) siga trabajando. Si
  // alguna llegara con FORCE, la aplicacion se quedaria fuera de esa tabla.
  const conForce = await filas<{ relname: string }>(sql`
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relforcerowsecurity
     ORDER BY 1`);
  ok('ninguna con FORCE (la aplicacion se quedaria fuera)', conForce.length === 0,
    conForce.slice(0, 5).map(t => t.relname).join(', '));

  console.log('\n3) La aplicacion es duena de todo (la condicion de la que depende)\n');

  const ajenas = await filas<{ relname: string; dueno: string }>(sql`
    SELECT c.relname, pg_get_userbyid(c.relowner) AS dueno
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
       AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
     ORDER BY 1`);
  ok('ningun objeto de otro dueno', ajenas.length === 0,
    ajenas.slice(0, 5).map(t => `${t.relname} (de ${t.dueno})`).join(', '));

  console.log('\n4) La prueba que importa: hacerse pasar por `anon`\n');

  // El catalogo dice lo que se configuro. Esto dice lo que ocurre.
  //
  // POR QUE UNA CONEXION APARTE, Y POR QUE LA ASERCION DE `current_user`
  // ---------------------------------------------------------------------
  // La primera version usaba `SET LOCAL ROLE anon` sobre la conexion de la
  // aplicacion. Fuera de una transaccion, `SET LOCAL` es solo un aviso y NO
  // cambia de rol: la consulta corrio como la aplicacion. Aqui se vio porque
  // se esperaba 0 y salieron 2 -- pero la comprobacion siguiente esperaba
  // "permission denied", y ESA habria pasado en verde sin comprobar nada.
  // De ahi la asercion de `current_user`: antes de creerse el resultado hay
  // que confirmar que de verdad se es `anon`.
  //
  // Tampoco vale meterlo en una transaccion: un error de permisos la aborta, y
  // lo que falla despues es "transaccion abortada", no lo que se queria medir.
  // Ni reutilizar el pool: un `SET ROLE` de sesion se le queda pegado a la
  // conexion y se lo lleva la siguiente consulta que la tome.
  // Conexion propia, `SET ROLE` de sesion, y se cierra al terminar.
  const anon = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  let quien = '';
  let vistoPorAnon: number | null = null;
  let errLectura = '';
  let errEscritura = '';
  try {
    await anon.unsafe('SET ROLE anon');
    quien = (await anon.unsafe('SELECT current_user AS quien'))[0].quien;
    try {
      vistoPorAnon = Number((await anon.unsafe('SELECT count(*)::int AS n FROM companies'))[0].n);
    } catch (e: any) { errLectura = e.message; }
    try {
      await anon.unsafe("INSERT INTO companies (id, name, rnc) VALUES (gen_random_uuid(), 'intruso', '000000000')");
    } catch (e: any) { errEscritura = e.message; }
  } finally {
    await anon.end();
  }

  ok('el cambio de rol funciono de verdad', quien === 'anon', `current_user = ${quien}`);
  ok('`anon` no lee `companies`',
    vistoPorAnon === 0 || /permission denied/i.test(errLectura),
    errLectura || `vio ${vistoPorAnon} filas`);
  ok('`anon` no escribe en `companies`',
    /permission denied|row-level security/i.test(errEscritura),
    errEscritura.slice(0, 80) || 'ENTRO');

  console.log('\n5) Control: la aplicacion no se ha quedado fuera\n');

  await db.execute(sql`RESET ROLE`);
  const [{ n: tablas }] = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n2 ON n2.oid = c.relnamespace
     WHERE n2.nspname = 'public' AND c.relkind = 'r'`);
  ok('hay tablas que comprobar', tablas > 0, `${tablas} tablas`);

  // Una lectura y una escritura reales por el camino de la aplicacion. Si la
  // politica la afectara, esto es lo que fallaria.
  const EMP = '99999999-0037-0000-0000-000000000001';
  await db.execute(sql`DELETE FROM companies WHERE id = ${EMP}::uuid`);
  await db.execute(sql`
    INSERT INTO companies (id, name, rnc) VALUES (${EMP}::uuid, 'Prueba puerta 0037', '000000037')`);
  const leido = await filas<{ name: string }>(sql`SELECT name FROM companies WHERE id = ${EMP}::uuid`);
  ok('la aplicacion escribe y vuelve a leer', leido.length === 1 && leido[0].name === 'Prueba puerta 0037');
  await db.execute(sql`DELETE FROM companies WHERE id = ${EMP}::uuid`);
  const borrado = await filas<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM companies WHERE id = ${EMP}::uuid`);
  ok('y borra', borrado[0].n === 0);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
