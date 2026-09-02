-- 0046 — Un tercer modo del sistema: CERTIFICACION.
--
-- QUE CAMBIA Y POR QUE
-- --------------------
-- El ambiente de la DGII pasa a decidirse UNICAMENTE por el modo del sistema,
-- uno a uno:
--
--     PRUEBA         -> TesteCF
--     CERTIFICACION  -> CerteCF
--     PRODUCCION     -> eCF
--
-- Hasta ahora eran DOS cosas: el modo (PRODUCCION/PRUEBA) y un ajuste aparte,
-- `company_settings.dgii_env`. Y podian contradecirse. De hecho lo hacian:
-- `modo = PRODUCCION` con `dgii_env = 'test'` daba datos reales con
-- presentacion de ensayo, y el codigo lo resolvia en silencio hacia TesteCF
-- porque el valor 'test' no coincidia con ninguna rama y caia en el `return`
-- final. Con un solo interruptor esa contradiccion no se puede escribir.
--
-- ESTA MIGRACION SOLO ANADE EL VALOR AL ENUM
-- ------------------------------------------
-- No convierte ninguna fila ni cambia ningun valor por defecto. Nada escribe
-- 'CERTIFICACION' todavia: el modo queda disponible pero inerte, que es lo
-- acordado -- primero el valor, despues la estructura que lo soporte.
--
-- LO QUE FALTA, MEDIDO
-- --------------------
-- 133 declaraciones de tipo en 45 ficheros fijan `'PRODUCCION' | 'PRUEBA'`, y
-- hay 14 comparaciones `=== 'PRUEBA'` en las que todo lo que no sea PRUEBA se
-- trata como produccion. Mientras eso siga asi, poner una empresa en
-- CERTIFICACION haria que 45 ficheros la lean como produccion. Por eso el modo
-- se anade SIN forma de seleccionarlo desde la interfaz.
--
-- El banco `scratch/verificar_modo_certificacion.ts` cuenta esas 133 y sirve de
-- medidor: segun se vaya haciendo la estructura, el numero baja.
--
-- OJO CON LA TRANSACCION
-- ----------------------
-- `ALTER TYPE ... ADD VALUE` se puede ejecutar dentro de una transaccion, pero
-- el valor nuevo NO se puede USAR hasta que esa transaccion confirme:
--
--     ERROR: unsafe use of new value "CERTIFICACION" of enum type
--     HINT:  New enum values must be committed before they can be used.
--
-- Comprobado, no supuesto. Por eso esta migracion no compara, no castea y no
-- inserta el valor nuevo: solo lo anade y lo verifica leyendo el catalogo
-- `pg_enum`, que es una lectura de metadatos y no un uso del valor.
--
-- Consecuencia practica: si algun dia se aplica por `drizzle-kit migrate` -- que
-- mete TODAS las pendientes en UNA transaccion -- esta tiene que ir sola o la
-- primera que use el valor fallara.

ALTER TYPE environment_mode ADD VALUE IF NOT EXISTS 'CERTIFICACION';

DO $$
DECLARE
  v_valores text;
BEGIN
  -- Se lee del catalogo. Un `SELECT 'CERTIFICACION'::environment_mode` aqui
  -- fallaria: seria usar el valor antes de que su transaccion confirme.
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
  RAISE NOTICE '0046: ninguna fila usa CERTIFICACION todavia; el modo queda disponible pero inerte.';
END $$;
