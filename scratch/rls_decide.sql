-- ¿Que pueden hacer los roles publicos de Supabase sobre las tablas de public?
--
-- POR QUE IMPORTA: la clave `anon` es publica por diseño (va en el navegador).
-- Si los roles `anon` o `authenticated` tienen permisos sobre una tabla y esa
-- tabla NO tiene RLS, cualquiera con la URL del proyecto y esa clave puede
-- leerla a traves de la API automatica de Supabase (PostgREST), aunque tu
-- aplicacion no la use.
--
-- Si sale que NO tienen permisos, RLS aqui es defensa en profundidad y se puede
-- decidir con calma. Si sale que SI, RLS es lo unico que separa esas tablas del
-- mundo, y apagarlo seria exactamente lo contrario de lo que hay que hacer.

SELECT grantee AS rol,
       count(DISTINCT table_name)::text AS tablas_alcanzables,
       string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS permisos
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated', 'public')
 GROUP BY grantee

UNION ALL

SELECT '--- de esas, SIN RLS activado ---',
       (SELECT count(*)::text
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
           AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                        WHERE g.table_schema='public' AND g.table_name = c.relname
                          AND g.grantee IN ('anon','authenticated'))),
       'quedarian expuestas via PostgREST'

UNION ALL

SELECT '--- total de tablas en public ---',
       (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind='r'),
       ''
ORDER BY 1;
