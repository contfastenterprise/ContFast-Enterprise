-- ============================================================================
--  El fleco: los privilegios por defecto de `supabase_admin`
-- ============================================================================
--
--  Tras el REVOKE quedaron tres entradas en pg_default_acl a nombre de
--  `supabase_admin` (tablas, secuencias y funciones). El de `postgres` -- que
--  es el rol con el que corren tus migraciones -- si se limpio, asi que las
--  tablas que TU crees ya no heredan permisos para anon.
--
--  Lo que queda solo afecta a objetos creados POR supabase_admin, el rol
--  interno de Supabase. Para tocarlo hay que serlo, y el editor SQL corre como
--  `postgres`. Este script lo intenta y, si no puede, lo dice claramente en vez
--  de fallar a medias.
-- ============================================================================

DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE supabase_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    RESET ROLE;
    RAISE NOTICE 'OK: privilegios por defecto de supabase_admin retirados.';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RESET ROLE;
    RAISE NOTICE 'NO se pudo: %. Hay que hacerlo desde el panel de Supabase o con soporte.', SQLERRM;
  END;
END $$;

--  Resultado: cuantas entradas quedan y de quien.
SELECT COALESCE(string_agg(DISTINCT pg_get_userbyid(d.defaclrole) || '/' || d.defaclobjtype::text, ', '),
                '(nada: cerrado del todo)') AS pendiente_en_pg_default_acl
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
 WHERE n.nspname = 'public'
   AND array_to_string(d.defaclacl, ',') ~ '(anon|authenticated)=';
