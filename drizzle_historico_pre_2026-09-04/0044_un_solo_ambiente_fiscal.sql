-- ============================================================================
--  0044  --  Un solo ajuste decide el ambiente fiscal
-- ============================================================================
--
--  EL PROBLEMA (hallazgo ISO-13)
--  -----------------------------
--  `company_settings` tenia DOS columnas para lo mismo:
--
--      dgii_env         test | production   <- la que decide todo
--      mseller_entorno  test | production   <- no la lee nadie
--
--  Las cinco resoluciones del entorno de mSeller leen `dgii_env`.
--  `mseller_entorno` tenia columna, campo en la API, validacion y hasta un
--  selector en la pantalla de ajustes -- deshabilitado, un espejo del otro -- y
--  no decidia absolutamente nada.
--
--  Desde la pantalla era imposible desincronizarlas: el selector bueno copiaba
--  su valor a las dos. Pero la API de ajustes aceptaba `msellerEntorno` por
--  separado y lo guardaba tal cual, de modo que la base podia acabar con
--
--      dgii_env = production   /   mseller_entorno = test
--
--  y el sistema emitiria en PRODUCCION mientras la columna que se llama
--  "entorno de mSeller" dice pruebas. Quien la consultara para comprobar en que
--  ambiente esta, se llevaria la respuesta equivocada.
--
--  Es el mismo patron que `accounting_mappings`: una tabla de configuracion que
--  existe, se siembra, tiene pantalla, y ningun asiento consulta jamas.
--
--  LA CORRECCION
--  -------------
--  Se borra la columna duplicada. Queda `dgii_env`, que es la que ya lee todo.
--  No cambia ningun comportamiento: solo desaparece la trampa.
--
--  EL PASO 1 SE NIEGA A BORRAR si alguna empresa tiene las dos columnas con
--  valores distintos. En ese caso hay que mirar cual es el bueno antes de
--  perder la evidencia -- borrar primero y preguntar despues es como se pierden
--  los datos que explican un problema.
-- ============================================================================


-- ── PASO 1 · No borrar a ciegas ──────────────────────────────────────
--
-- La comprobacion solo tiene sentido mientras la columna exista. Sin esta
-- guarda, volver a pasar la migracion sobre una base donde ya se borro no
-- avisaba de nada: fallaba con "column mseller_entorno does not exist", que
-- parece un problema y no lo es. Una migracion que no se puede repetir sin
-- reventar es una migracion que nadie se atreve a repetir.
--
-- La consulta va en EXECUTE, y no escrita directamente dentro del IF, para no
-- depender de CUANDO resuelve PL/pgSQL los nombres de una sentencia que no
-- llega a ejecutarse. Con EXECUTE la cadena no se analiza si no se ejecuta, y
-- punto: no hay nada que razonar.
DO $$
DECLARE
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'company_settings'
                AND column_name = 'mseller_entorno') THEN

    EXECUTE 'SELECT count(*) FROM company_settings
              WHERE mseller_entorno IS DISTINCT FROM dgii_env'
       INTO n;

    IF n > 0 THEN
      RAISE EXCEPTION
        'Hay % empresa(s) con mseller_entorno distinto de dgii_env. Revisa cual es el valor bueno en cada una ANTES de borrar la columna: SELECT company_id, dgii_env, mseller_entorno FROM company_settings WHERE mseller_entorno IS DISTINCT FROM dgii_env;', n;
    END IF;

  ELSE
    RAISE NOTICE '0044: la columna mseller_entorno ya no existe. Nada que comprobar ni que borrar.';
  END IF;
END $$;


-- ── PASO 2 · Fuera el duplicado ──────────────────────────────────────
ALTER TABLE "company_settings"
  DROP COLUMN IF EXISTS "mseller_entorno";

COMMENT ON COLUMN "company_settings"."dgii_env" IS
  'Unico ajuste que decide el ambiente fiscal: test | production | cert. Lo lee entornoDgii(), y SOLO cuando el modo de la operacion es PRODUCCION -- en PRUEBA se va siempre a TesteCF. Ver hallazgo ISO-13.';


-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT c.name                AS empresa,
       s.dgii_env            AS ambiente_fiscal,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'company_settings'
           AND column_name = 'mseller_entorno') AS columna_duplicada_restante
FROM company_settings s
JOIN companies c ON c.id = s.company_id
WHERE c.deleted_at IS NULL
ORDER BY c.name;
-- `columna_duplicada_restante` tiene que ser 0 en todas las filas.
