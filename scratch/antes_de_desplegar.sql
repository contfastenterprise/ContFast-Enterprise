-- ANTES DE FUSIONAR A PRODUCCION. Solo lee, no cambia nada.
--
-- El codigo que vas a desplegar da por hecho DOS cosas sobre la base:
--
--   0046  el enum `environment_mode` incluye CERTIFICACION
--   0047  `company_settings.dgii_env` guarda EL MODO ('PRUEBA' / 'PRODUCCION'),
--         no un ambiente en minusculas ('test' / 'production')
--
-- Si la 0047 NO esta aplicada, el panel compara `dgii_env === 'PRODUCCION'`
-- contra un 'production' en minusculas, no coincide, y una empresa que factura
-- de verdad se pone a operar en PRUEBA. Silenciosamente. Es exactamente el fallo
-- que esta auditoria vino a cerrar, asi que conviene mirarlo antes y no despues.
--
-- Ejecuta esto en la base de PRODUCCION y pasame el resultado.

SELECT
  -- 1. ¿Existe el modo CERTIFICACION en el enum? (migracion 0046)
  (SELECT COUNT(*) > 0
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'environment_mode'
      AND e.enumlabel = 'CERTIFICACION')                      AS "0046 aplicada",

  -- 2. ¿Que valores hay en dgii_env? (migracion 0047)
  --    Esperado: solo PRUEBA y PRODUCCION, en mayusculas.
  --    Si aparece 'test', 'production' o cualquier minuscula, la 0047 falta.
  (SELECT string_agg(DISTINCT COALESCE(dgii_env::text, '(null)'), ', ' ORDER BY COALESCE(dgii_env::text, '(null)'))
     FROM company_settings)                                   AS "valores de dgii_env",

  -- 3. ¿Alguna empresa quedaria mal clasificada al desplegar?
  --    Cuenta las que NO son ni PRUEBA ni PRODUCCION exactos.
  (SELECT COUNT(*)
     FROM company_settings
    WHERE dgii_env IS NULL
       OR dgii_env::text NOT IN ('PRUEBA', 'PRODUCCION'))     AS "empresas en riesgo",

  -- 4. ¿Alguna esta en CERTIFICACION? El codigo nuevo la RECHAZA en los
  --    ajustes; si hay alguna guardada asi habria que pasarla a PRUEBA antes.
  (SELECT COUNT(*)
     FROM company_settings
    WHERE dgii_env::text = 'CERTIFICACION')                   AS "empresas en CERTIFICACION",

  -- 5. Ultima migracion registrada en el diario de Drizzle.
  --    Sirve para saber por donde va la base respecto al repositorio.
  (SELECT MAX(id)::text FROM drizzle.__drizzle_migrations)     AS "ultima migracion registrada",

  -- 6. ¿Esta CRON_SECRET en uso? No se puede ver desde SQL; recordatorio:
  --    la ruta /api/v1/cron/sincronizar-ecf devuelve 503 si no esta definida
  --    en Vercel. Comprobalo despues de desplegar.
  'comprobar en Vercel'                                       AS "CRON_SECRET";
