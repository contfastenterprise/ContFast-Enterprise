-- ============================================================================
--  0041  --  Cada asiento contable registra quien lo hizo
-- ============================================================================
--
--  EL PROBLEMA (hallazgo JRN-16)
--  ----------------------------
--  `journal_entries` no guardaba autor. Ninguna columna decia quien registro el
--  asiento, ni desde que operacion salio.
--
--  Se materializo el 14/07/2026 en la empresa 38a1a51e: aparecio un asiento
--  DUPLICADO de 545.724,30 correspondiente a la compra con NCF E310000012204.
--  No hubo forma de determinar su origen -- si fue un doble clic, un reintento
--  por timeout o alguien registrandolo dos veces -- porque el asiento no llevaba
--  autor y `audit_logs` solo tenia entradas y salidas de sesion. Un asiento sin
--  autor no es auditable: se puede corregir, pero no se puede explicar.
--
--  LA CORRECCION
--  -------------
--  Columna NULLABLE. Los asientos historicos no tienen autor y no se puede
--  deducir: inventarselo seria peor que dejarlo vacio. Los nuevos si lo llevan;
--  los once puntos del codigo que asientan ya lo pasan, y la prueba
--  `trazabilidadContable.vitest.ts` impide que aparezca uno que no lo haga.
--
--  ON DELETE SET NULL: si se borra el usuario, el asiento se queda. Un asiento
--  contable no desaparece porque se vaya un empleado.
-- ============================================================================

ALTER TABLE "journal_entries"
  ADD COLUMN IF NOT EXISTS "created_by" uuid;

DO $$ BEGIN
  ALTER TABLE "journal_entries"
    ADD CONSTRAINT "journal_entries_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "journal_entries_created_by_idx"
  ON "journal_entries" ("created_by");

COMMENT ON COLUMN "journal_entries"."created_by" IS
  'Usuario que registro el asiento. Nulo en los asientos anteriores a la migracion 0041, cuyo autor no consta. Ver hallazgo JRN-16.';


-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'created_by')  AS columna,
  (SELECT count(*) FROM pg_constraint
    WHERE conname = 'journal_entries_created_by_fk')                      AS clave_foranea,
  (SELECT count(*) FROM pg_indexes
    WHERE indexname = 'journal_entries_created_by_idx')                   AS indice,
  (SELECT count(*) FROM journal_entries WHERE created_by IS NULL)         AS asientos_sin_autor;
-- Las tres primeras tienen que dar 1. `asientos_sin_autor` es el historico:
-- baja solo, conforme se registren asientos nuevos.
