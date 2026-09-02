-- ============================================================================
--  0045  --  La clave de API de mSeller, una por entorno
-- ============================================================================
--
--  EL PROBLEMA (hallazgo ISO-16)
--  -----------------------------
--  Habia UNA clave de API por empresa. mSeller emite una distinta para cada
--  ambiente, y la autenticacion va contra el endpoint del ambiente:
--
--      POST ${baseUrl}/${entorno}/customer/authentication
--
--  Con una sola clave, el dia que una empresa pasa a produccion tiene que
--  sustituir la de pruebas -- y a partir de ese momento el modo PRUEBA deja de
--  funcionar. `entornoDgii` lo manda a TesteCF, que es correcto, pero con la
--  clave de produccion. Toda la separacion por modo se queda sin efecto justo el
--  dia del arranque real.
--
--  QUE SE SEPARA Y QUE NO
--  ----------------------
--  SOLO la clave de API cambia entre ambientes. El correo y la contrasena son
--  los mismos y se quedan en `company_settings`, donde ya estaban.
--
--  Duplicarlos por ambiente seria peor: un dato repetido en tres sitios se
--  desincroniza, y un cambio de contrasena aplicado en dos de tres deja el
--  tercero roto sin que nadie se entere hasta que falla un envio. Un dato, un
--  sitio.
--
--  `company_settings.mseller_api_key_encrypted` NO se borra aqui. El codigo deja
--  de leerla, pero se queda de momento: una clave perdida no se recupera, se le
--  pide otra al proveedor. Se limpia en una migracion posterior, cuando los
--  ambientes esten configurados y funcionando.
-- ============================================================================


-- ── PASO 0 · Si corriste una version anterior de esta migracion ──────
--
-- La primera version creaba `mseller_credentials` con correo y contrasena
-- duplicados por ambiente. Si existe, se renombra y se le quitan las dos
-- columnas que no son por entorno. Si no existe, esto no hace nada.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'mseller_credentials')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'mseller_api_keys') THEN
    ALTER TABLE "mseller_credentials" RENAME TO "mseller_api_keys";
  END IF;
END $$;

ALTER TABLE IF EXISTS "mseller_api_keys" DROP COLUMN IF EXISTS "email";
ALTER TABLE IF EXISTS "mseller_api_keys" DROP COLUMN IF EXISTS "password_encrypted";

DROP INDEX IF EXISTS "mseller_credentials_company_entorno_idx";
DROP INDEX IF EXISTS "mseller_credentials_company_idx";


-- ── PASO 1 · La tabla ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mseller_api_keys" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"        uuid NOT NULL REFERENCES "companies"("id"),
  "entorno"           varchar(20) NOT NULL,
  "api_key_encrypted" text NOT NULL,
  "created_at"        timestamp NOT NULL DEFAULT now(),
  "updated_at"        timestamp NOT NULL DEFAULT now()
);

-- Una clave por empresa y entorno, y no mas. Dos filas para el mismo entorno
-- dejarian la eleccion al orden en que Postgres devuelva las filas, que es
-- exactamente el fallo que tenia la busqueda de la cuenta contable del banco.
CREATE UNIQUE INDEX IF NOT EXISTS "mseller_api_keys_company_entorno_idx"
  ON "mseller_api_keys" ("company_id", "entorno");

CREATE INDEX IF NOT EXISTS "mseller_api_keys_company_idx"
  ON "mseller_api_keys" ("company_id");

DO $$ BEGIN
  ALTER TABLE "mseller_api_keys"
    ADD CONSTRAINT "mseller_api_keys_entorno_valido"
    CHECK ("entorno" IN ('TesteCF', 'CerteCF', 'eCF'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mseller_api_keys" DROP CONSTRAINT IF EXISTS "mseller_credentials_entorno_valido";
END $$;


-- ── PASO 2 · Traslado de la clave que ya estaba configurada ──────────
--
-- La clave actual pertenece al ambiente en el que la empresa trabaja HOY, que
-- es lo que dice `dgii_env`. Se mueve ahi y no a los tres: copiarla a todos
-- seria inventarse que sirve, y no sirve.
INSERT INTO mseller_api_keys (company_id, entorno, api_key_encrypted)
SELECT s.company_id,
       CASE s.dgii_env
         WHEN 'production' THEN 'eCF'
         WHEN 'cert'       THEN 'CerteCF'
         ELSE                   'TesteCF'
       END,
       s.mseller_api_key_encrypted
  FROM company_settings s
 WHERE s.mseller_api_key_encrypted IS NOT NULL
   AND s.mseller_api_key_encrypted <> ''
ON CONFLICT ("company_id", "entorno") DO NOTHING;


-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT c.name                                   AS empresa,
       s.dgii_env                               AS ambiente_actual,
       (s.mseller_email IS NOT NULL
        AND s.mseller_password_encrypted IS NOT NULL) AS usuario_y_clave_ok,
       COALESCE(string_agg(k.entorno, ', ' ORDER BY k.entorno), '(ninguno)')
                                                AS ambientes_con_clave_api
FROM company_settings s
JOIN companies c            ON c.id = s.company_id
LEFT JOIN mseller_api_keys k ON k.company_id = s.company_id
WHERE c.deleted_at IS NULL
GROUP BY c.name, s.dgii_env, s.mseller_email, s.mseller_password_encrypted
ORDER BY c.name;
-- `usuario_y_clave_ok` debe ser true, y cada empresa necesita clave de API al
-- menos para su `ambiente_actual`. Las de los demas ambientes se anaden en
-- Ajustes > mSeller cuando hagan falta.
