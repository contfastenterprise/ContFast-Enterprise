-- ============================================================================
--  DESHACER la 0037  --  red de emergencia
-- ============================================================================
--
--  PARA QUE EXISTE
--  ---------------
--  La 0037 activa RLS en las ~91 tablas de `public`. Se sostiene sobre que la
--  aplicacion es DUENA de las tablas (el dueno se salta RLS). La migracion
--  comprueba eso y aborta si no se cumple, y `comprobar_puerta_publica.sql` lo
--  dice de antemano. Aun asi: si al entrar en la aplicacion aparecen listados
--  vacios o errores de permisos, esto lo devuelve todo a como estaba, de una
--  sola pegada.
--
--  DESHACERLO NO REABRE LA BRECHA
--  ------------------------------
--  Quita SOLO la tercera capa: la politica `sin_acceso_publico` y el RLS de las
--  tablas que no lo tenian antes. Los permisos de `anon` y `authenticated`
--  siguen retirados -- esa es la primera capa y la que de verdad cerro la
--  puerta -- y los permisos por defecto tambien. No toca politicas de nadie mas
--  (la `tenant_isolation_policy` de la 0024 se queda como este).
--
--  RESTITUYE EL ESTADO EXACTO, NO UNO PARECIDO
--  -------------------------------------------
--  Nueve tablas de esta base YA tenian RLS antes de la 0037. Apagarselo al
--  deshacer las dejaria PEOR que como estaban. Por eso la 0037 apunta el estado
--  previo de cada tabla en `drizzle.rls_estado_previo_0037` antes de tocar nada,
--  y esto lee de ahi: solo apaga RLS donde estaba apagado.
--
--  Si esa tabla no existe (porque la 0037 nunca llego a correr), no hay nada
--  que deshacer y el bloque lo dice en vez de adivinar.
-- ============================================================================

--  UN DETALLE QUE COSTO UN INTENTO
--  -------------------------------
--  La lista NO se puede recorrer con un cursor que lea
--  `rls_estado_previo_0037`, porque una de las tablas a modificar es esa misma
--  y PostgreSQL responde "cannot ALTER TABLE ... because it is being used by
--  active queries in this session". Se resuelve leyendo la lista entera a un
--  array ANTES de tocar nada, y recorriendo el array.

DO $$
DECLARE
  objetivos  text[];
  previas    text[];
  tabla      text;
  n_pol integer := 0;
  n_rls integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'drizzle' AND c.relname = 'rls_estado_previo_0037'
  ) THEN
    RAISE EXCEPTION 'No existe `drizzle.rls_estado_previo_0037`: la 0037 no se ha aplicado en esta base, o alguien borro la tabla. Sin esa foto no se puede restituir el estado anterior sin adivinar, y adivinar aqui es peor que no hacer nada.';
  END IF;

  -- Las dos listas, leidas de una vez y guardadas en memoria.
  SELECT array_agg(p.tablename ORDER BY p.tablename) INTO objetivos
    FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.policyname = 'sin_acceso_publico';

  SELECT array_agg(e.tabla) INTO previas
    FROM drizzle.rls_estado_previo_0037 e
   WHERE e.rls_activo;

  objetivos := COALESCE(objetivos, ARRAY[]::text[]);
  previas   := COALESCE(previas,   ARRAY[]::text[]);

  FOREACH tabla IN ARRAY objetivos LOOP
    EXECUTE format('DROP POLICY IF EXISTS sin_acceso_publico ON public.%I', tabla);
    n_pol := n_pol + 1;

    -- Solo se apaga donde estaba apagado. Donde ya venia encendido, se queda.
    IF NOT (tabla = ANY (previas)) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tabla);
      n_rls := n_rls + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Deshecha la 0037: % politicas retiradas, RLS apagado en % tablas (las demas ya lo tenian antes).', n_pol, n_rls;
  RAISE NOTICE 'Los permisos de `anon`/`authenticated` SIGUEN retirados. La puerta no se ha reabierto.';
END $$;
