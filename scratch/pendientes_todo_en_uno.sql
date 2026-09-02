-- ============================================================================
--  LO QUE FALTA POR APLICAR EN LA BASE DE DATOS. UN SOLO FICHERO.
-- ============================================================================
--
--  COMO SE EJECUTA
--  ---------------
--  Pegar entero en el editor SQL de Supabase, o:
--
--      psql "$DATABASE_URL" -f scratch/pendientes_todo_en_uno.sql
--
--  NO por `drizzle-kit migrate`. Ese mete TODAS las pendientes en UNA sola
--  transaccion, y aqui hay un `ALTER TYPE ... ADD VALUE`: el valor nuevo no se
--  puede USAR hasta que su transaccion confirme. Ademas el ledger de
--  migraciones esta desfasado (se repara despues, ver el final).
--
--  QUE HACE, EN ORDEN
--  ------------------
--    0046  anade el modo CERTIFICACION al enum `environment_mode`.
--    0047  `company_settings.dgii_env` pasa a guardar EL MODO DEL SISTEMA.
--
--  DESPUES hay que correr `scratch/reparar_ledger_migraciones.sql`, que las
--  registra en `drizzle.__drizzle_migrations` -- y solo si el marcador de cada
--  una esta realmente puesto, asi que no puede mentir.
--
--  ES SEGURO CORRERLO DOS VECES
--  ----------------------------
--  0046 usa `ADD VALUE IF NOT EXISTS`. 0047 solo toca filas cuyo `dgii_env` no
--  sea ya un modo, y la restriccion se anade solo si no existe.
--
--  LO QUE **NO** HACE: pasar ninguna empresa a PRODUCCION. Toda empresa que
--  estuviera en 'test' queda en PRUEBA, aunque estuviera facturando de verdad.
--  Es deliberado: pasar a PRODUCCION es un acto consciente que se hace desde
--  Ajustes. Equivocarse hacia pruebas se arregla con un clic; equivocarse hacia
--  produccion emite comprobantes fiscales que ya no se retiran.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0046 — Un tercer modo del sistema: CERTIFICACION.
--
-- El ambiente de la DGII pasa a decidirse UNICAMENTE por el modo, uno a uno:
--
--     PRUEBA         -> TesteCF
--     CERTIFICACION  -> CerteCF
--     PRODUCCION     -> eCF
--
-- Esta migracion SOLO anade el valor al enum. No convierte ninguna fila. El
-- modo queda disponible pero inerte: 133 declaraciones de tipo en 45 ficheros
-- todavia fijan `'PRODUCCION' | 'PRUEBA'`, y mientras eso siga asi una empresa
-- en CERTIFICACION se leeria como produccion en 45 sitios. Por eso el selector
-- todavia no lo ofrece. `scratch/verificar_modo_certificacion.ts` cuenta esas
-- 133 y sirve de medidor.
--
-- OJO: `ALTER TYPE ... ADD VALUE` corre dentro de una transaccion, pero el
-- valor nuevo NO se puede usar hasta que confirme:
--
--     ERROR: unsafe use of new value "CERTIFICACION" of enum type
--
-- Comprobado, no supuesto. Por eso lo que sigue LEE `pg_enum` (metadatos) en
-- vez de comparar o castear el valor.
-- ----------------------------------------------------------------------------

ALTER TYPE environment_mode ADD VALUE IF NOT EXISTS 'CERTIFICACION';

DO $mig46$
DECLARE
  v_valores text;
BEGIN
  SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
    INTO v_valores
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'environment_mode';

  IF v_valores IS NULL THEN
    RAISE EXCEPTION '0046: no existe el tipo environment_mode.';
  END IF;

  IF position('CERTIFICACION' in v_valores) = 0 THEN
    RAISE EXCEPTION '0046: CERTIFICACION no quedo anadido. Valores actuales: %', v_valores;
  END IF;

  RAISE NOTICE '0046: environment_mode -> %', v_valores;
END $mig46$;


-- ----------------------------------------------------------------------------
-- 0047 — `company_settings.dgii_env` guarda EL MODO.
--
-- Habia dos interruptores para una decision, empujandose al reves: `dgii_env`
-- decia el ambiente, el modo vivia en la cookie `cf_environment`, y
-- `ClientLayout` FORZABA la cookie a partir de `dgii_env` en cada carga. Es
-- decir, el ajuste de ambiente mandaba sobre el modo -- justo al reves de lo
-- que se quiere, y la razon por la que una empresa que factura de verdad podia
-- acabar operando contra pruebas sin enterarse.
--
-- La conversion es FIEL, no interpretada:
--     'test'                    -> 'PRUEBA'
--     'production' | '1'        -> 'PRODUCCION'
--     'cert' | 'certification'  -> 'CERTIFICACION'
--     cualquier otra cosa       -> 'PRUEBA'
--
-- `dgii_env` es `varchar(50)`, no el enum, asi que escribir 'CERTIFICACION'
-- aqui NO es usar el valor del enum recien anadido arriba. Por eso las dos
-- pueden ir en el mismo fichero.
-- ----------------------------------------------------------------------------

DO $mig47$
DECLARE
  v_antes text;
  v_despues text;
  v_malas integer;
BEGIN
  SELECT string_agg(DISTINCT coalesce(dgii_env, '(nulo)'), ', ') INTO v_antes
    FROM public.company_settings;
  RAISE NOTICE '0047: valores antes -> %', coalesce(v_antes, '(sin filas)');

  UPDATE public.company_settings
     SET dgii_env = CASE lower(btrim(coalesce(dgii_env, '')))
                      WHEN 'production'    THEN 'PRODUCCION'
                      WHEN '1'             THEN 'PRODUCCION'
                      WHEN 'cert'          THEN 'CERTIFICACION'
                      WHEN 'certification' THEN 'CERTIFICACION'
                      ELSE 'PRUEBA'
                    END,
         updated_at = now()
   WHERE dgii_env IS NULL
      OR dgii_env NOT IN ('PRODUCCION', 'PRUEBA', 'CERTIFICACION');

  SELECT string_agg(DISTINCT dgii_env, ', ') INTO v_despues
    FROM public.company_settings;
  RAISE NOTICE '0047: valores despues -> %', coalesce(v_despues, '(sin filas)');

  -- El valor por defecto de la columna tambien: era 'test'.
  ALTER TABLE public.company_settings ALTER COLUMN dgii_env SET DEFAULT 'PRUEBA';

  -- Y una restriccion, para que no vuelva a entrar una cadena suelta. Sin
  -- esto, un 'test' escrito a mano se traduciria en silencio a PRUEBA en el
  -- codigo o -- peor -- lanzaria en `entornoDgii` en medio de una emision.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_dgii_env_modo_ck') THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_dgii_env_modo_ck
      CHECK (dgii_env IN ('PRODUCCION', 'PRUEBA', 'CERTIFICACION'));
  END IF;

  SELECT count(*) INTO v_malas FROM public.company_settings
   WHERE dgii_env NOT IN ('PRODUCCION', 'PRUEBA', 'CERTIFICACION');
  IF v_malas > 0 THEN
    RAISE EXCEPTION '0047: quedaron % fila(s) con un valor que no es un modo.', v_malas;
  END IF;

  RAISE NOTICE '0047: toda empresa que estaba en test queda en PRUEBA.';
  RAISE NOTICE '0047: pasar a PRODUCCION se hace desde Ajustes, a proposito.';
  RAISE NOTICE '---';
  RAISE NOTICE 'SIGUIENTE PASO: correr scratch/reparar_ledger_migraciones.sql';
END $mig47$;


-- ----------------------------------------------------------------------------
-- Como quedo cada empresa, y a que ambiente de la DGII se traduce.
-- ----------------------------------------------------------------------------
SELECT c.name                                   AS "Empresa",
       s.dgii_env                               AS "Modo del sistema",
       CASE s.dgii_env WHEN 'PRODUCCION'    THEN 'eCF (real)'
                       WHEN 'CERTIFICACION' THEN 'CerteCF'
                       ELSE 'TesteCF (pruebas)' END AS "Ambiente DGII"
  FROM public.company_settings s
  JOIN public.companies c ON c.id = s.company_id
 WHERE c.deleted_at IS NULL
 ORDER BY c.name;
