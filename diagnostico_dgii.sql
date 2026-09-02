-- ============================================================================
--  DIAGNOSTICO dgii_submissions  --  SOLO LECTURA, no modifica nada
-- ============================================================================
--
--  UNA SOLA CONSULTA. La version anterior eran ocho, y el editor de Supabase
--  solo muestra el resultado de la ultima: de ahi que solo se vieran los
--  indices. Esta devuelve todo junto, una linea por dato.
--
--  QUE SE ESTA BUSCANDO
--  --------------------
--  En `dgii_submissions` hay una fila por cada INTENTO de envio de una
--  factura. Pero los que escriben el resultado (jobRunners, worker) hacian
--  UPDATE ... WHERE invoice_id = ? AND company_id = ?, sin decir que fila:
--  tocaban TODAS a la vez. Un reenvio que falla pone status='failed' y machaca
--  response_payload tambien en la fila que estaba 'accepted', destruyendo la
--  constancia de una aceptacion de la DGII -- de donde salen el codigo de
--  seguridad y el QR del comprobante.
--
--  Y cinco rutas leian con .limit(1) SIN ORDER BY, quedandose con una
--  cualquiera.
--
--  La pregunta que responde esto: ¿ha pasado ya, y en cuantas facturas?
-- ============================================================================

WITH por_factura AS (
  SELECT
    invoice_id,
    count(*)                                                AS filas,
    count(DISTINCT status)                                  AS estados,
    count(*) FILTER (WHERE response_payload IS NOT NULL)    AS con_payload
  FROM dgii_submissions
  GROUP BY invoice_id
),
metricas AS (
  -- 1. Panorama -------------------------------------------------------------
  SELECT 1 AS orden, '1. PANORAMA' AS bloque, 'envios totales' AS concepto,
         count(*)::text AS valor FROM dgii_submissions
  UNION ALL
  SELECT 1, '1. PANORAMA', 'facturas con algun envio',
         count(DISTINCT invoice_id)::text FROM dgii_submissions
  UNION ALL
  SELECT 1, '1. PANORAMA', 'filas de mas (envios - facturas)',
         (count(*) - count(DISTINCT invoice_id))::text FROM dgii_submissions

  -- 2. Reparto por entorno y estado -----------------------------------------
  UNION ALL
  SELECT 2, '2. POR ESTADO', modo::text || ' / ' || status, count(*)::text
  FROM dgii_submissions GROUP BY modo, status

  -- 3. Facturas con varios envios -------------------------------------------
  UNION ALL
  SELECT 3, '3. VARIOS ENVIOS', 'facturas con mas de un envio',
         count(*)::text FROM por_factura WHERE filas > 1
  UNION ALL
  SELECT 3, '3. VARIOS ENVIOS', 'de esas, con estados DISTINTOS entre si',
         count(*)::text FROM por_factura WHERE filas > 1 AND estados > 1
  UNION ALL
  SELECT 3, '3. VARIOS ENVIOS', 'de esas, con respuesta solo en algunas filas',
         count(*)::text FROM por_factura
         WHERE filas > 1 AND con_payload > 0 AND con_payload < filas
  UNION ALL
  SELECT 3, '3. VARIOS ENVIOS', 'maximo de envios en una sola factura',
         COALESCE(max(filas), 0)::text FROM por_factura

  -- 4. LA PRUEBA DEL DANO ---------------------------------------------------
  --    track_id solo se escribe cuando la DGII ACEPTA. Una fila con track_id
  --    y estado 'failed' o 'rejected' es una aceptacion sobrescrita.
  UNION ALL
  SELECT 4, '4. ACEPTACIONES MACHACADAS', 'filas con track_id pero failed/rejected',
         count(*)::text FROM dgii_submissions
         WHERE track_id IS NOT NULL AND status IN ('failed','rejected')
  UNION ALL
  SELECT 4, '4. ACEPTACIONES MACHACADAS', 'facturas afectadas',
         count(DISTINCT invoice_id)::text FROM dgii_submissions
         WHERE track_id IS NOT NULL AND status IN ('failed','rejected')
  UNION ALL
  SELECT 4, '4. ACEPTACIONES MACHACADAS', 'la mas reciente',
         COALESCE(max(updated_at)::text, '(ninguna)') FROM dgii_submissions
         WHERE track_id IS NOT NULL AND status IN ('failed','rejected')

  -- 5. El mismo dano visto desde la factura ---------------------------------
  UNION ALL
  SELECT 5, '5. FACTURA ACEPTADA SIN ENVIO ACEPTADO', i.modo::text, count(*)::text
  FROM invoices i
  WHERE i.status = 'accepted' AND i.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM dgii_submissions s WHERE s.invoice_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM dgii_submissions s
                    WHERE s.invoice_id = i.id AND s.status = 'accepted')
  GROUP BY i.modo

  -- 6. Cruces que no deberian existir ---------------------------------------
  UNION ALL
  SELECT 6, '6. CRUCES', 'envios en distinto ENTORNO que su factura',
         count(*)::text FROM dgii_submissions s JOIN invoices i ON i.id = s.invoice_id
         WHERE s.modo IS DISTINCT FROM i.modo
  UNION ALL
  SELECT 6, '6. CRUCES', 'envios en distinta EMPRESA que su factura',
         count(*)::text FROM dgii_submissions s JOIN invoices i ON i.id = s.invoice_id
         WHERE s.company_id IS DISTINCT FROM i.company_id

  -- 7. Detalle de las peores ------------------------------------------------
  UNION ALL
  SELECT 7, '7. DETALLE',
         COALESCE(d.codigo_factura, d.ncf, '(sin codigo)') || '  [factura: ' || d.estado_factura || ']',
         d.envios::text || ' envios -> ' || d.estados_envios ||
         '  (track_id: ' || d.con_track || ', con respuesta: ' || d.con_resp || ')'
  FROM (
    SELECT i.codigo_factura, i.ncf, i.status AS estado_factura,
           count(s.id) AS envios,
           string_agg(DISTINCT s.status, ' + ' ORDER BY s.status) AS estados_envios,
           count(s.id) FILTER (WHERE s.track_id IS NOT NULL) AS con_track,
           count(s.id) FILTER (WHERE s.response_payload IS NOT NULL) AS con_resp
    FROM invoices i
    JOIN dgii_submissions s ON s.invoice_id = i.id
    GROUP BY i.id, i.codigo_factura, i.ncf, i.status
    HAVING count(s.id) > 1
    ORDER BY count(s.id) DESC
    LIMIT 10
  ) d

  -- 8. Indices --------------------------------------------------------------
  UNION ALL
  SELECT 8, '8. INDICES',
         CASE WHEN indexdef LIKE '%UNIQUE%' THEN 'UNICO: ' || indexname ELSE indexname END,
         regexp_replace(indexdef, '^.*USING btree ', '')
  FROM pg_indexes WHERE tablename = 'dgii_submissions'
)
SELECT bloque, concepto, valor
FROM metricas
ORDER BY orden, concepto;
