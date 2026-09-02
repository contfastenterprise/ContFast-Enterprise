-- ============================================================================
--  DIAGNOSTICO: facturas exentas y estado de la 0041
-- ============================================================================
--
--  Solo LEE. No cambia nada.
--
--  QUE RESPONDE
--  ------------
--  A. Si la 0041 esta aplicada y cuantos envios recuperaron su codigo.
--  B. Que facturas tienen guardada una tasa distinta del 18% -- esas son las
--     que se emitieron ya con el codigo nuevo y son de fiar.
--  C. Cuales son ANTERIORES a la 0039 (sin tasa guardada). En esas, una
--     factura que se quiso emitir al 0% es INDISTINGUIBLE de una del 18%:
--     el `|| 0.18` la convirtio antes de guardarla, asi que en la base
--     consta como gravada al 18% y no hay nada que la delate. Esta parte
--     solo las cuenta y las lista para que las revises tu.
--  D. Si alguna factura exenta quedo con ITBIS cobrado (incoherencia).
-- ============================================================================

\echo ''
\echo '=== A. La migracion 0041 ==='
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='dgii_submissions' AND column_name='security_code') AS columna_creada,
  (SELECT count(*) FROM dgii_submissions)                                        AS envios,
  (SELECT count(*) FROM dgii_submissions WHERE security_code IS NOT NULL)         AS con_codigo,
  (SELECT count(*) FROM dgii_submissions
    WHERE status = 'accepted' AND security_code IS NULL)                          AS aceptados_sin_codigo;

\echo ''
\echo '=== A2. El ledger de migraciones ==='
SELECT count(*) AS filas, max(created_at) AS tope FROM drizzle."__drizzle_migrations";

\echo ''
\echo '=== B. Facturas con tasa guardada DISTINTA del 18% (emitidas con el codigo nuevo) ==='
SELECT i.ncf,
       i.created_at::date         AS fecha,
       i.status,
       i.total,
       i.total_taxes,
       array_agg(DISTINCT il.tax_rate::text ORDER BY il.tax_rate::text) AS tasas_de_lineas,
       (SELECT array_agg(DISTINCT t.rate::text) FROM invoice_taxes t WHERE t.invoice_id = i.id) AS tasas_del_resumen
  FROM invoices i
  JOIN invoice_lines il ON il.invoice_id = i.id
 WHERE il.tax_rate IS NOT NULL
   AND il.tax_rate <> 0.18
   AND i.deleted_at IS NULL
 GROUP BY i.id, i.ncf, i.created_at, i.status, i.total, i.total_taxes
 ORDER BY i.created_at DESC;

\echo ''
\echo '=== C. Cuantas facturas son anteriores a la 0039 (tasa no guardada) ==='
\echo '    En estas, un 0% elegido se guardo como 18% y NO se puede distinguir'
\echo '    desde los datos. Hay que identificarlas por NCF a mano.'
SELECT count(DISTINCT i.id) AS facturas_sin_tasa_guardada,
       min(i.created_at)::date AS desde,
       max(i.created_at)::date AS hasta
  FROM invoices i
  JOIN invoice_lines il ON il.invoice_id = i.id
 WHERE il.tax_rate IS NULL
   AND i.deleted_at IS NULL;

\echo ''
\echo '=== C2. Listado de esas facturas, por si reconoces alguna ==='
SELECT i.ncf,
       i.created_at::date AS fecha,
       coalesce(i.buyer_name, c.name, '(sin cliente)') AS cliente,
       i.subtotal,
       i.total_taxes,
       i.total,
       i.status
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
 WHERE i.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM invoice_lines il
                WHERE il.invoice_id = i.id AND il.tax_rate IS NULL)
 ORDER BY i.created_at DESC
 LIMIT 60;

\echo ''
\echo '=== D. Incoherencias: exenta pero con ITBIS cobrado, o al reves ==='
SELECT i.ncf,
       i.created_at::date AS fecha,
       i.total_taxes,
       CASE
         WHEN bool_and(il.tax_rate = 0) AND i.total_taxes > 0
           THEN 'lineas exentas pero el total lleva ITBIS'
         WHEN bool_and(il.tax_rate > 0) AND i.total_taxes = 0
           THEN 'lineas gravadas pero el total no lleva ITBIS'
       END AS problema
  FROM invoices i
  JOIN invoice_lines il ON il.invoice_id = i.id
 WHERE i.deleted_at IS NULL
   AND il.tax_rate IS NOT NULL
 GROUP BY i.id, i.ncf, i.created_at, i.total_taxes
HAVING (bool_and(il.tax_rate = 0) AND i.total_taxes > 0)
    OR (bool_and(il.tax_rate > 0) AND i.total_taxes = 0)
 ORDER BY i.created_at DESC;

\echo ''
\echo '(si D no devuelve filas, no hay incoherencias entre lineas y totales)'
\echo ''
