-- ============================================================================
-- NOTA (P1-19, 2026-09-04): esta migracion nunca se aplico contra la base
-- real, y es REDUNDANTE. La migracion 0039 (2026-09-01, dos dias antes de
-- la auditoria que genero este hallazgo P1-20) ya habia agregado una FK
-- para chart_account_id -- compuesta (chart_account_id, company_id), mejor
-- que la simple que se agrega aqui abajo -- y ESA es la que existe en
-- produccion: `bank_accounts_chart_account_company_fk`.
--
-- Se deja este archivo tal cual, sin aplicar, solo como registro historico
-- de que P1-20 se investigo y de por que no hacia falta ninguna accion:
-- 0039 ya lo habia resuelto antes de que la auditoria lo senalara. NO
-- ejecutar esta migracion -- crearia una segunda FK simple, redundante con
-- la compuesta de 0039. schema.ts declara unicamente la de 0039
-- (`chartAccountCompanyFk` en src/db/schema/bank.ts).
-- ============================================================================

-- 0052 — FK ausente en bank_accounts.chart_account_id (P1-20).
--
-- EL PROBLEMA (auditoria 2026-09-03, hallazgo P1-20)
-- ----------------------------------------------------------
-- `bank_accounts.chart_account_id` (migracion 0039) no tiene ninguna
-- `REFERENCES` -- solo un indice. El propio comentario de esa columna en
-- el schema explica que reemplazo una busqueda heuristica que ya causo
-- asientos mal contabilizados (dos ajustes de produccion, de
-- 352.460,96 y 1.015.727,93, cayeron los dos en una cuenta de
-- AGRUPACION por error). Sin FK, nada impide guardar ahi una cuenta
-- contable inexistente.
--
-- LA CORRECCION
-- --------------
-- Se agrega la FK `chart_account_id -> chart_of_accounts(id)` con
-- `ON DELETE RESTRICT` (no se puede borrar una cuenta del catalogo si
-- alguna cuenta bancaria todavia la usa). La columna sigue siendo
-- nullable -- una cuenta bancaria sin cuenta contable asignada sigue
-- siendo valida (el propio comentario del schema explica que sin ella
-- el movimiento se rechaza en el codigo, no en el schema).
--
-- Antes de crear la FK, esta migracion cuenta cuantas filas de
-- bank_accounts tienen un chart_account_id que NO existe en
-- chart_of_accounts. Si hay alguna, NO crea la FK (para no romper el
-- despliegue) y deja un aviso para investigarlas manualmente. No se
-- corrigen ni se ponen en NULL filas existentes: esta migracion, como
-- las anteriores, solo cierra el hueco hacia adelante.

DO $$
DECLARE
  huerfanas integer;
BEGIN
  SELECT COUNT(*) INTO huerfanas
  FROM public.bank_accounts ba
  WHERE ba.chart_account_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts coa WHERE coa.id = ba.chart_account_id
    );

  IF huerfanas > 0 THEN
    RAISE NOTICE '0052: % cuenta(s) bancaria(s) tienen chart_account_id que no existe en chart_of_accounts. NO se crea la FK -- investigar y corregir esas filas antes de reintentar esta migracion.', huerfanas;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_chart_account_id_chart_of_accounts_id_fk'
    ) THEN
      ALTER TABLE public.bank_accounts
        ADD CONSTRAINT bank_accounts_chart_account_id_chart_of_accounts_id_fk
        FOREIGN KEY (chart_account_id) REFERENCES public.chart_of_accounts(id)
        ON DELETE RESTRICT;
      RAISE NOTICE '0052: FK bank_accounts_chart_account_id_chart_of_accounts_id_fk creada.';
    ELSE
      RAISE NOTICE '0052: bank_accounts_chart_account_id_chart_of_accounts_id_fk ya existia. Nada que crear.';
    END IF;
  END IF;
END $$;

-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.bank_accounts WHERE chart_account_id IS NOT NULL) AS "Cuentas bancarias con chart_account_id asignado",
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'bank_accounts_chart_account_id_chart_of_accounts_id_fk') AS "FK creada (1) o no (0)",
  (SELECT COUNT(*) FROM public.bank_accounts ba
    WHERE ba.chart_account_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts coa WHERE coa.id = ba.chart_account_id)
  ) AS "Cuentas bancarias huerfanas (deberia ser 0)";
