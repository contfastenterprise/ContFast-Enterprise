-- 0047 — `company_settings.dgii_env` pasa a guardar EL MODO DEL SISTEMA.
--
-- DE DONDE VIENE ESTO
-- -------------------
-- Habia dos interruptores para una decision, y ademas se empujaban al reves de
-- como deberian:
--
--   * `dgii_env` ('test' | 'production') decia el ambiente de la DGII.
--   * El modo del sistema vivia en la cookie `cf_environment`
--     ('PRODUCCION' | 'PRUEBA'), que es lo que separa los datos reales de los
--     de ensayo.
--   * Y `ClientLayout` FORZABA la cookie a partir de `dgii_env` en cada carga:
--
--         const targetEnv = env === 'production' ? 'PRODUCCION' : 'PRUEBA';
--         document.cookie = `cf_environment=${targetEnv}; ...`;
--
--     Es decir: el ajuste de ambiente mandaba sobre el modo. Justo al reves de
--     lo que se quiere, y la razon por la que una empresa que factura de verdad
--     podia acabar operando contra el ambiente de pruebas sin enterarse.
--
-- QUE QUEDA
-- ---------
-- Un solo interruptor: EL MODO. `dgii_env` lo guarda, y el ambiente de la DGII
-- se deduce (`entornoDgii`), nunca al reves:
--
--     PRUEBA         -> TesteCF
--     CERTIFICACION  -> CerteCF
--     PRODUCCION     -> eCF
--
-- LA CONVERSION ES FIEL, NO INTERPRETADA
-- --------------------------------------
--     'test'                    -> 'PRUEBA'
--     'production' | '1'        -> 'PRODUCCION'
--     'cert' | 'certification'  -> 'CERTIFICACION'
--     cualquier otra cosa       -> 'PRUEBA'
--
-- Se traduce lo que HAY, sin adivinar lo que deberia haber. Eso significa que
-- una empresa con 'test' queda en PRUEBA aunque estuviera facturando de verdad.
-- Es deliberado: pasar a PRODUCCION es un acto consciente que se hace desde el
-- selector, no algo que una migracion decida por su cuenta. Equivocarse hacia
-- pruebas se arregla con un clic; equivocarse hacia produccion emite
-- comprobantes fiscales que ya no se retiran.
--
-- CERTIFICACION se admite en la columna, pero el resto del sistema todavia
-- supone dos modos (133 declaraciones en 45 ficheros). Por eso el selector no
-- lo ofrece aun. Ver `scratch/verificar_modo_certificacion.ts`, que lo mide.

DO $$
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
END $$;

-- Como quedo cada empresa, y a que ambiente de la DGII se traduce.
SELECT c.name                                   AS "Empresa",
       s.dgii_env                               AS "Modo del sistema",
       CASE s.dgii_env WHEN 'PRODUCCION'    THEN 'eCF (real)'
                       WHEN 'CERTIFICACION' THEN 'CerteCF'
                       ELSE 'TesteCF (pruebas)' END AS "Ambiente DGII"
  FROM public.company_settings s
  JOIN public.companies c ON c.id = s.company_id
 WHERE c.deleted_at IS NULL
 ORDER BY c.name;
