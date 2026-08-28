-- ============================================================
-- DIAGNÓSTICO: Cheques en Garantía "fantasma" + historial vacío
-- Ejecutar en Supabase > SQL Editor (solo SELECT, no modifica nada)
-- ============================================================

-- 1) Cheques que DISPARAN la alerta del dashboard
--    (is_guarantee, status='pending', due_date <= hoy)
--    y el estado real de su ap_payment asociado.
SELECT
  c.id                AS check_id,
  c.modo,
  c.check_number,
  c.payee,
  c.amount,
  c.issue_date,
  c.due_date,
  c.status            AS check_status,
  c.deleted_at,
  c.ap_id,
  p.id                AS payment_id,
  p.status            AS payment_status,
  ap.id               AS ap_existe,
  ap.balance          AS ap_balance,
  ap.deleted_at       AS ap_deleted_at,
  e.id                AS gasto_existe,
  CASE
    WHEN p.id IS NULL            THEN 'HUERFANO: cheque sin ap_payment  -> alerta eterna'
    WHEN p.status <> 'pending_guarantee'
                                 THEN 'DESINCRONIZADO: payment ya aplicado, cheque quedo pending'
    WHEN ap.id IS NULL           THEN 'HUERFANO: CxP borrada'
    WHEN ap.deleted_at IS NOT NULL THEN 'HUERFANO: CxP anulada'
    WHEN c.deleted_at IS NOT NULL THEN 'HUERFANO: cheque soft-deleted'
    ELSE 'OK - realmente pendiente'
  END AS diagnostico
FROM checks c
LEFT JOIN ap_payments p       ON p.check_id = c.id
LEFT JOIN accounts_payable ap ON ap.id      = c.ap_id
LEFT JOIN expenses e          ON e.id       = ap.expense_id
WHERE c.is_guarantee = true
  AND c.status = 'pending'
  AND c.due_date <= CURRENT_DATE
ORDER BY c.due_date;

-- 2) Resumen general de cheques
SELECT modo, is_guarantee, status, count(*) AS cantidad
FROM checks
GROUP BY 1,2,3 ORDER BY 1,2,3;

-- 3) Resumen general de pagos CxP
SELECT modo, status, payment_method, count(*) AS cantidad
FROM ap_payments
GROUP BY 1,2,3 ORDER BY 1,2,3;

-- 4) Cheques YA COBRADOS (cleared) y la fecha con la que se filtran hoy.
--    Nota: la pantalla filtra por p.payment_date (= fecha de EMISIÓN),
--    no por la fecha real de cobro. Por eso el historial sale vacío.
SELECT
  c.check_number,
  c.payee,
  c.amount,
  c.issue_date        AS fecha_emision,
  p.payment_date      AS fecha_usada_por_el_filtro,
  c.due_date          AS fecha_pactada_cobro,
  c.updated_at        AS fecha_real_aplicacion,
  p.status            AS payment_status,
  c.status            AS check_status
FROM checks c
JOIN ap_payments p ON p.check_id = c.id
WHERE c.is_guarantee = true
  AND c.status = 'cleared'
ORDER BY c.updated_at DESC;
