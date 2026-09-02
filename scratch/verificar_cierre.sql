-- Comprobacion del cierre. Solo lectura, no crea ni borra nada.
--
-- La consulta anterior miraba las tablas que EXISTEN. Esta mira `pg_default_acl`,
-- que es donde vive el ALTER DEFAULT PRIVILEGES: lo que heredarian las tablas
-- FUTURAS. Si esto no quedo limpio, la proxima migracion vuelve a abrir todo.

SELECT '1. tablas actuales alcanzables por anon/authenticated' AS comprobacion,
       COALESCE((SELECT count(DISTINCT table_name)::text
                   FROM information_schema.role_table_grants
                  WHERE table_schema='public' AND grantee IN ('anon','authenticated')), '0') AS valor,
       'debe ser 0' AS esperado

UNION ALL
SELECT '2. privilegios POR DEFECTO que heredarian las tablas nuevas',
       COALESCE((SELECT count(*)::text FROM pg_default_acl d
                   JOIN pg_namespace n ON n.oid = d.defaclnamespace
                  WHERE n.nspname = 'public'
                    AND array_to_string(d.defaclacl, ',') ~ '(anon|authenticated)='), '0'),
       'debe ser 0'

UNION ALL
SELECT '3. detalle de lo que quede en pg_default_acl',
       COALESCE((SELECT string_agg(DISTINCT pg_get_userbyid(d.defaclrole) || '/' || d.defaclobjtype::text, ', ')
                   FROM pg_default_acl d
                   JOIN pg_namespace n ON n.oid = d.defaclnamespace
                  WHERE n.nspname='public'
                    AND array_to_string(d.defaclacl, ',') ~ '(anon|authenticated)='), '(nada)'),
       'ideal: (nada)'

UNION ALL
SELECT '4. secuencias alcanzables',
       COALESCE((SELECT count(*)::text FROM information_schema.role_usage_grants
                  WHERE object_schema='public' AND grantee IN ('anon','authenticated')), '0'),
       'debe ser 0'

UNION ALL
SELECT '5. USAGE sobre el propio esquema public',
       CASE WHEN has_schema_privilege('anon','public','USAGE') THEN 'anon SI lo tiene' ELSE 'no' END,
       'informativo: sin tablas no sirve de nada'

ORDER BY 1;
