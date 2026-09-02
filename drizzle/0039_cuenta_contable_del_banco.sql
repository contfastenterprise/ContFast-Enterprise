-- ============================================================================
--  0039  --  Cada cuenta bancaria declara su cuenta contable
-- ============================================================================
--
--  EL PROBLEMA
--  -----------
--  `bank_accounts` no tenia ninguna relacion con el plan de cuentas, asi que
--  al contabilizar un movimiento el codigo la ADIVINABA por el nombre:
--
--      assetAccounts.find(a => a.name.toLowerCase().includes('banco'))
--
--  Tres defectos en una linea:
--
--    1. "Efectivo en Caja y Bancos" contiene "banco". Esa es una cuenta de
--       AGRUPACION (is_transactional = false), y aun asi entra en el sorteo.
--    2. La consulta no lleva ORDER BY, de modo que cual gana lo decide el
--       orden en que Postgres devuelva las filas. Nadie lo fijo.
--    3. Con varias cuentas bancarias, todas se contabilizan contra la misma
--       cuenta: la que gane. Los bancos dejan de ser conciliables por separado.
--
--  Verificado en produccion el 29/08/2026, empresa 38a1a51e: dos ajustes
--  bancarios del mismo dia, uno de 352.460,96 y otro de 1.015.727,93, fueron a
--  parar los dos a la cuenta de agrupacion 1.1.01. El segundo quedo con el
--  debe y el haber contra ESA MISMA cuenta: cuadra y no significa nada. El
--  saldo del modulo de bancos subio; el mayor no se movio.
--
--  Ademas, una de las dos cuentas bancarias reales (Scotiabank) no tenia
--  ninguna cuenta equivalente en el catalogo, de modo que no habia forma de
--  acertar ni por casualidad.
--
--  LA CORRECCION
--  -------------
--  El enlace deja de deducirse y pasa a declararse. `chart_account_id` es
--  NULLABLE a proposito: las cuentas existentes no lo tienen y la migracion no
--  puede inventarselo. El codigo bloquea el movimiento con un error explicito
--  mientras no este configurado -- mejor parado que mal contabilizado.
--
--  Hallazgos: JRN-04 (asiento omitido o mal ruteado), JRN-12 (movimientos
--  contra cuentas de agrupacion).
-- ============================================================================

ALTER TABLE "bank_accounts"
  ADD COLUMN IF NOT EXISTS "chart_account_id" uuid;

-- FK compuesta contra (id, company_id): impide enlazar una cuenta bancaria con
-- la cuenta contable de OTRA empresa. `chart_of_accounts` ya tiene el indice
-- unico (id, company_id) que la migracion 0032 necesito para lo mismo.
DO $$ BEGIN
  ALTER TABLE "bank_accounts"
    ADD CONSTRAINT "bank_accounts_chart_account_company_fk"
    FOREIGN KEY ("chart_account_id", "company_id")
    REFERENCES "chart_of_accounts"("id", "company_id")
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    -- Si el indice unico (id, company_id) no existiera en esta instancia, se
    -- cae a una FK simple antes que quedarse sin ninguna.
    BEGIN
      ALTER TABLE "bank_accounts"
        ADD CONSTRAINT "bank_accounts_chart_account_fk"
        FOREIGN KEY ("chart_account_id") REFERENCES "chart_of_accounts"("id")
        ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

CREATE INDEX IF NOT EXISTS "bank_accounts_chart_account_idx"
  ON "bank_accounts" ("chart_account_id");

COMMENT ON COLUMN "bank_accounts"."chart_account_id" IS
  'Cuenta del plan contable contra la que se asientan los movimientos de esta cuenta bancaria. Debe ser transaccional y activa. Sin ella, el movimiento no se contabiliza: se rechaza con error. Ver migracion 0039.';
