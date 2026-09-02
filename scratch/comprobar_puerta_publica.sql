-- ============================================================================
--  Comprobacion de la puerta publica  --  para el editor SQL de Supabase
-- ============================================================================
--
--  Sirve para las dos cosas:
--
--    ANTES de la 0037  -> dice si se puede aplicar sin bloquear la aplicacion.
--    DESPUES           -> dice si quedo bien.
--
--  No cambia nada. Solo lee. Se puede ejecutar las veces que haga falta.
--
--  IMPORTANTE: ejecutarlo con el MISMO usuario que usa la aplicacion, es decir
--  el de DATABASE_URL en Vercel. El editor SQL de Supabase se conecta como
--  `postgres`; si DATABASE_URL tambien apunta a `postgres`, todo cuadra. Si no,
--  el bloque 1 lo dira.
-- ============================================================================

SELECT json_build_object(

  -- --------------------------------------------------------------------
  -- 1. LO PRIMERO: ¿se puede aplicar la 0037 sin dejar fuera a la app?
  --    La 0037 se apoya en que el dueno de la tabla se salta RLS. Si hay
  --    objetos de otro dueno, la migracion ABORTA a proposito. Aqui se ve
  --    antes de intentarlo.
  -- --------------------------------------------------------------------
  'a_usuario_actual', current_user,

  'b_veredicto', (
    SELECT CASE WHEN count(*) = 0
      THEN 'SE PUEDE APLICAR: todo en `public` pertenece a ' || current_user
      ELSE 'NO APLICAR TODAVIA: ' || count(*) || ' objeto(s) de otro dueno' END
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
       AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)),

  'c_objetos_de_otro_dueno', COALESCE((
    SELECT json_agg(json_build_object('objeto', c.relname, 'dueno', pg_get_userbyid(c.relowner)) ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
       AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)), '[]'::json),

  -- --------------------------------------------------------------------
  -- 2. Permisos de los roles publicos. Aqui es donde estaban los 92x7.
  --    Debe salir 0.
  -- --------------------------------------------------------------------
  'd_permisos_anon_authenticated', (
    SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')),

  -- Lo que hace que el cierre no caduque: si alguien tiene permisos POR
  -- DEFECTO para `anon`, la proxima tabla nace abierta.
  -- Ojo: `ALTER DEFAULT PRIVILEGES` es POR ROL CREADOR. La 0037 solo puede
  -- limpiar los del rol que la ejecuta. Si aqui aparece otro rol (p. ej.
  -- `supabase_admin`), significa que una tabla creada POR ESE ROL heredaria
  -- permisos; hay que limpiarlo aparte o vigilarlo.
  'e_permisos_por_defecto_que_dan_a_anon', COALESCE((
    SELECT json_agg(json_build_object('rol_creador', pg_get_userbyid(d.defaclrole), 'acl', d.defaclacl::text))
      FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public'
       AND (d.defaclacl::text LIKE '%anon=%' OR d.defaclacl::text LIKE '%authenticated=%')), '[]'::json),

  -- --------------------------------------------------------------------
  -- 3. Estado de la tercera capa (RLS + politica). Antes de la 0037 esto
  --    sale bajo; despues, los tres numeros deben ser iguales.
  -- --------------------------------------------------------------------
  'f_tablas_en_public', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')),

  'g_con_rls_activo', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity),

  'h_con_politica_sin_acceso_publico', (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'sin_acceso_publico'),

  -- Tiene que ser RESTRICTIVE. Una PERMISSIVE que devuelve false se SUMA
  -- (OR) a cualquier otra politica permisiva de la tabla en vez de restar.
  'i_politicas_mias_no_restrictivas_DEBE_SER_0', (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'sin_acceso_publico'
       AND permissive <> 'RESTRICTIVE'),

  -- Si alguna tabla tuviera FORCE, la aplicacion se quedaria fuera de ella.
  'j_con_FORCE_DEBE_SER_0', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relforcerowsecurity),

  -- --------------------------------------------------------------------
  -- 4. Otras politicas que ya viven en la base. Interesa porque al activar
  --    RLS las politicas que estaban dormidas DESPIERTAN. Las de la 0024
  --    (`tenant_isolation_policy`) permiten cuando no hay contexto.
  -- --------------------------------------------------------------------
  'k_otras_politicas', COALESCE((
    SELECT json_agg(x) FROM (
      SELECT policyname, permissive, count(*) AS tablas
        FROM pg_policies WHERE schemaname = 'public' AND policyname <> 'sin_acceso_publico'
       GROUP BY 1,2 ORDER BY 3 DESC) x), '[]'::json),

  -- --------------------------------------------------------------------
  -- 5. Tablas que se quedarian fuera si se aplicara ahora mismo.
  -- --------------------------------------------------------------------
  'l_tablas_sin_politica', COALESCE((
    SELECT json_agg(c.relname ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
       AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname='public' AND p.tablename=c.relname
                          AND p.policyname='sin_acceso_publico')), '[]'::json)

) AS puerta_publica;
