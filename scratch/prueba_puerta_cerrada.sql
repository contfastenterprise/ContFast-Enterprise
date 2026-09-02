-- ============================================================================
--  ¿Una tabla creada por tus migraciones hereda permisos para anon?
-- ============================================================================
--
--  Quedaron 3 entradas en pg_default_acl a nombre de `supabase_admin`. Eso
--  SOLO afecta a objetos creados por ese rol. Tus migraciones corren como
--  `postgres`, cuya entrada ya se limpio.
--
--  En vez de razonarlo: se crea una tabla igual que lo haria una migracion, se
--  miran sus permisos y se borra. No deja nada.
-- ============================================================================

CREATE TABLE public.zz_prueba_permisos (id int);

SELECT 'la crea el rol' AS dato,
       (SELECT pg_get_userbyid(relowner) FROM pg_class
         WHERE relname = 'zz_prueba_permisos') AS valor,
       '' AS lectura
UNION ALL
SELECT 'permisos heredados por anon/authenticated',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_name = 'zz_prueba_permisos' AND grantee IN ('anon','authenticated')),
       'si es 0, la puerta esta cerrada para tus migraciones'
UNION ALL
SELECT 'cuales',
       COALESCE((SELECT string_agg(DISTINCT privilege_type, ', ')
                   FROM information_schema.role_table_grants
                  WHERE table_name='zz_prueba_permisos' AND grantee IN ('anon','authenticated')),
                '(ninguno)'),
       '';

DROP TABLE public.zz_prueba_permisos;
