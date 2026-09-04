-- ============================================================================
--  0037  --  Negar a los roles publicos el acceso al esquema `public`
-- ============================================================================
--
--  POR QUE
--  -------
--  Los roles `anon` y `authenticated` -- a los que mapea la clave publica de
--  Supabase -- tenian DELETE/INSERT/UPDATE/SELECT/TRUNCATE sobre 92 tablas, 80
--  de ellas sin RLS, con la Data API viva y respondiendo. Se cerro a mano y la
--  Data API se apaga desde el panel, pero un arreglo que solo existe en el
--  historial de un editor SQL no es un arreglo: una base nueva levantada desde
--  las migraciones volveria a nacer abierta. Esta migracion deja el cierre
--  escrito donde se reconstruye el esquema.
--
--  Son tres capas, y sobran a proposito:
--    a) Retirar los permisos (lo que se hizo a mano).
--    b) Retirar los permisos POR DEFECTO, para que una tabla futura no los
--       herede sola.
--    c) RLS con una politica que niega, por si alguien devuelve (a).
--
--  POR QUE NO LA 0024
--  ------------------
--  Conviene dejarlo escrito porque parece que si sirve. Su politica es:
--
--      USING (current_setting('app.current_company_id') IS NULL  OR  company_id = ...)
--
--  PERMITE cuando no hay contexto. Comprobado contra PostgreSQL:
--
--      anon sin contexto ................ 1 fila visible   <-- ve todo
--      anon con contexto de otra empresa. 0 filas
--
--  Una peticion publica no pone ningun contexto: cae en la primera rama y pasa.
--  La 0024 protege solo cuando la aplicacion fija el contexto, y
--  `withTenantContext` (src/db/index.ts) no lo llama NADIE. Aplicarla hoy daria
--  la apariencia de RLS sin nada detras.
--
--  COMO FUNCIONA ESTA
--  ------------------
--  ENABLE ROW LEVEL SECURITY sin FORCE: el DUENO de la tabla se salta RLS, y el
--  dueno es el rol con el que se conecta la aplicacion. Encima, una politica
--  que niega explicitamente a `anon` y `authenticated`. Comprobado:
--
--      anon:        0 filas, y el INSERT da "permission denied"
--      aplicacion:  ve y escribe con normalidad
--
--  CONDICION IMPRESCINDIBLE
--  ------------------------
--  Todo esto se sostiene sobre "el dueno se salta RLS". Por tanto ESTA
--  MIGRACION HAY QUE EJECUTARLA CON EL MISMO ROL CON EL QUE SE CONECTA LA
--  APLICACION (el usuario de DATABASE_URL). Si se ejecuta con otro rol, la
--  aplicacion quedaria sujeta a la politica y dejaria de ver sus propias
--  tablas. El bloque aborta si encuentra una tabla de otro dueno, y avisa por
--  NOTICE con que rol se esta ejecutando: hay que leerlo.
--
--  LO QUE ESTO NO ES
--  -----------------
--  NO es aislamiento entre empresas. Eso vive en el codigo (companyId + modo en
--  cada consulta, que es lo revisado en toda la auditoria) y su respaldo
--  estructural es la 0032 con sus claves foraneas compuestas. Esto solo cierra
--  la puerta de fuera.
--
--  SE PUEDE (Y SE DEBE) REPETIR
--  ----------------------------
--  Es idempotente: volver a ejecutarla no hace dano. Y hay que volver a
--  ejecutarla despues de cualquier migracion que anada tablas, porque una tabla
--  nueva nace sin politica. Los permisos por defecto (punto 3) ya la dejan sin
--  acceso, asi que no es una brecha, pero se queda sin la tercera capa. El
--  banco `scratch/verificar_puerta_publica.ts` falla si alguna tabla se queda
--  atras, para que no dependa de acordarse.
--
--  UN SOLO BLOQUE, A PROPOSITO
--  ---------------------------
--  Todo va dentro de un unico DO. Si fueran bloques separados y alguien lo
--  pegara en un editor SQL sin parar en el primer error, la comprobacion de
--  dueno abortaria y el resto se aplicaria igual: justo el escenario que la
--  comprobacion existe para evitar. Un solo bloque no se puede ejecutar a
--  medias.
-- ============================================================================

DO $$
DECLARE
  ajenas   text;
  t        record;
  n_pol    integer := 0;
  n_rev    integer := 0;
BEGIN
  -- ---------------------------------------------------------------------
  -- 0. Sin los roles de Supabase no hay nada que negar (base de desarrollo
  --    o de integracion continua). Se sale en silencio para no romper.
  -- ---------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE '0037: no existen los roles `anon`/`authenticated`. Nada que cerrar.';
    RETURN;
  END IF;

  RAISE NOTICE '0037: ejecutando como `%`. Tiene que ser el usuario de DATABASE_URL.', current_user;

  -- ---------------------------------------------------------------------
  -- 1. Comprobacion de dueno. Incluye vistas: una vista se ejecuta con los
  --    permisos de SU dueno, asi que una vista ajena sobre estas tablas
  --    seria un rodeo alrededor de la politica.
  -- ---------------------------------------------------------------------
  SELECT string_agg(c.relname || ' (de ' || pg_get_userbyid(c.relowner) || ')', ', ' ORDER BY c.relname)
    INTO ajenas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm')
     AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user);

  IF ajenas IS NOT NULL THEN
    RAISE EXCEPTION E'0037 ABORTADO: hay objetos en `public` cuyo dueno no es `%`.\nAplicar la politica dejaria a la aplicacion sin acceso a ellos.\nObjetos: %\nSolucion: ejecutar esta migracion con el rol dueno, o traspasar el dueno con ALTER TABLE ... OWNER TO %.',
      current_user, ajenas, current_user;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. Retirar permisos ya concedidos, sobre todo lo que PostgREST expone:
  --    tablas, vistas, secuencias y funciones.
  -- ---------------------------------------------------------------------
  FOR t IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM %I', t.rolname);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', t.rolname);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', t.rolname);
    EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', t.rolname);

    -- 3. Y que una tabla creada MANANA no los herede. Esto es lo que hace que
    --    el cierre no caduque: sin esto, la siguiente migracion que anada una
    --    tabla la crearia otra vez abierta.
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM %I', t.rolname);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', t.rolname);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', t.rolname);
    n_rev := n_rev + 1;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 4. Antes de tocar RLS, apuntar como estaba cada tabla.
  --
  --    Esto no es burocracia. Activar RLS en 91 tablas necesita una vuelta
  --    atras, y una vuelta atras que ADIVINE no es una vuelta atras: en esta
  --    base hay tablas que YA tenian RLS antes de esta migracion, y apagarselo
  --    al deshacer seria dejarlas peor que como estaban. Con esto,
  --    `scratch/deshacer_puerta_publica.sql` restituye exactamente el estado
  --    anterior.
  --
  --    Se rellena UNA sola vez: si la migracion se repite, la foto buena es la
  --    primera, la de antes de tocar nada.
  --
  --    Vive en el esquema `drizzle`, NO en `public`, y a proposito: `public`
  --    tiene que seguir siendo espejo exacto de src/db/schema. Una tabla ahi
  --    que el esquema de TypeScript no declara es una tabla que el proximo
  --    `drizzle-kit generate` propondria BORRAR.
  -- ---------------------------------------------------------------------
  CREATE SCHEMA IF NOT EXISTS drizzle;

  CREATE TABLE IF NOT EXISTS drizzle.rls_estado_previo_0037 (
    tabla      text PRIMARY KEY,
    rls_activo boolean NOT NULL,
    anotado_en timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO drizzle.rls_estado_previo_0037 (tabla, rls_activo)
  SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ON CONFLICT (tabla) DO NOTHING;

  -- ---------------------------------------------------------------------
  -- 5. La red de seguridad: RLS mas politica que niega.
  -- ---------------------------------------------------------------------
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    -- Sin FORCE: el dueno (la aplicacion) se salta la politica. Explicito
    -- porque si alguna tabla llegara con FORCE puesto, la aplicacion se
    -- quedaria fuera sin que nada lo dijera.
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t.relname);

    EXECUTE format('DROP POLICY IF EXISTS sin_acceso_publico ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY sin_acceso_publico ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t.relname);
    n_pol := n_pol + 1;
  END LOOP;

  RAISE NOTICE '0037: permisos retirados a % rol(es); politica `sin_acceso_publico` en % tablas.', n_rev, n_pol;
END $$;
