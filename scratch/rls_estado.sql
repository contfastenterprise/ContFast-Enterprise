-- Estado real de RLS. Solo lectura.
--
-- Tu produccion dio 0 politicas y 9 tablas con RLS ACTIVADO. Esa combinacion
-- es la peligrosa: con RLS activado y ninguna politica, Postgres NIEGA todo a
-- cualquier rol que no tenga BYPASSRLS. Hoy la aplicacion funciona porque
-- conecta con un rol privilegiado, pero cualquier acceso con la clave anon o
-- un rol normal veria esas nueve tablas VACIAS.
SELECT c.relname AS tabla,
       CASE WHEN c.relrowsecurity THEN 'RLS activado' ELSE 'RLS apagado' END AS rls,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=c.relname)::text AS politicas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
 ORDER BY c.relname;
