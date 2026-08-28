-- ============================================================
-- LIMPIEZA de cheques en garantía huérfanos ya acumulados en la base.
--
-- Origen: hasta el fix de hoy, DELETE /api/v1/expenses/[id] borraba el gasto
-- pero dejaba viva la CxP, el cheque en garantía y el ap_payment. Esos cheques
-- quedaban en status='pending' para siempre.
--
-- CORRE PRIMERO EL PASO 1 (solo lectura) Y REVISA EL RESULTADO.
-- El paso 2 borra: descoméntalo únicamente si el paso 1 muestra lo que esperas.
-- Haz un backup / snapshot de Supabase antes del paso 2.
-- ============================================================

-- ── PASO 1: ver qué se borraría (SOLO LECTURA) ───────────────
WITH huerfanos AS (
  SELECT
    ap.id            AS ap_id,
    ap.company_id,
    ap.modo,
    ap.supplier_id,
    ap.balance,
    ap.expense_id,
    c.id             AS check_id,
    c.check_number,
    c.payee,
    c.amount         AS check_amount,
    c.due_date,
    c.status         AS check_status
  FROM accounts_payable ap
  LEFT JOIN checks c ON c.ap_id = ap.id
  WHERE
    -- El gasto que originó la CxP ya no existe
    NOT EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = ap.expense_id OR e.id = ap.id
    )
    -- Y la CxP no proviene de una orden de compra
    AND ap.purchase_order_id IS NULL
    -- Y no tiene ningún pago aplicado (sin impacto contable real)
    AND NOT EXISTS (
      SELECT 1 FROM ap_payments p
      WHERE p.ap_id = ap.id AND p.status = 'applied'
    )
    -- Y no tiene pagos a suplidor aplicados contra su balance
    AND NOT EXISTS (
      SELECT 1 FROM supplier_payment_applied spa WHERE spa.ap_id = ap.id
    )
)
SELECT * FROM huerfanos ORDER BY due_date NULLS LAST;

-- ── PASO 2: borrar (DESCOMENTAR SOLO TRAS REVISAR EL PASO 1) ──
-- El orden importa por las llaves foráneas: pagos -> cheques -> CxP.
/*
BEGIN;

CREATE TEMP TABLE ap_huerfanas AS
  SELECT ap.id
  FROM accounts_payable ap
  WHERE NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = ap.expense_id OR e.id = ap.id)
    AND ap.purchase_order_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM ap_payments p WHERE p.ap_id = ap.id AND p.status = 'applied')
    AND NOT EXISTS (SELECT 1 FROM supplier_payment_applied spa WHERE spa.ap_id = ap.id);

DELETE FROM ap_payments      WHERE ap_id IN (SELECT id FROM ap_huerfanas);
DELETE FROM checks           WHERE ap_id IN (SELECT id FROM ap_huerfanas);
DELETE FROM accounts_payable WHERE id    IN (SELECT id FROM ap_huerfanas);

-- Revisa los conteos antes de confirmar:
--   ROLLBACK;  -- si algo no cuadra
COMMIT;
*/
