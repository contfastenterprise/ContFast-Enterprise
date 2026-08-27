-- 0029: fecha real de cobro de cheques en garantia
--
-- Motivo: el historial de "Cheques Aplicados" se filtraba por ap_payments.payment_date,
-- que es la fecha de EMISION del cheque. Como los cheques en garantia son post-fechados
-- (se emiten meses antes de cobrarse), el rango por defecto (mes actual) los excluia
-- y el historial salia siempre vacio.
--
-- Se usa tipo `date` (no timestamp) por consistencia con issue_date / due_date
-- y para evitar corrimientos por zona horaria al filtrar por rango.

ALTER TABLE "checks" ADD COLUMN IF NOT EXISTS "cleared_date" date;
CREATE INDEX IF NOT EXISTS "checks_cleared_date_idx" ON "checks" USING btree ("cleared_date");

-- Backfill: para los cheques ya cobrados, usar updated_at como mejor aproximacion
-- de la fecha de aplicacion (es cuando se marcaron 'cleared').
UPDATE "checks"
SET "cleared_date" = "updated_at"::date
WHERE "status" = 'cleared' AND "cleared_date" IS NULL;
